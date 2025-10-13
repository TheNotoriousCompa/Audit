import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as fs from 'fs';
import path from "path";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import isDev from "electron-is-dev";
import type { DownloadOptions, DownloadResult } from '../types/electron';

// Define local types
type PythonProcess = ChildProcessWithoutNullStreams & {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
};

let mainWindow: BrowserWindow | null = null;

// --- Function to create the main window ---
function createWindow() {
  let preloadPath: string;
  
  if (isDev) {
    preloadPath = path.join(__dirname, '..', '..', 'dist', 'preload', 'preload.js');
    console.log('Development preload path:', preloadPath);
  } else {
    preloadPath = path.join(process.resourcesPath, 'app/dist/preload/preload.js');
  }
  
  if (!path.isAbsolute(preloadPath)) {
    preloadPath = path.resolve(preloadPath);
  }
  
  console.log('Final preload path:', preloadPath);
  console.log('preload file exists:', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    transparent: true,
    frame: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#00000000",
    resizable: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
      webSecurity: !isDev,
      backgroundThrottling: false,
    },
  });

  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../../../out/index.html")}`;

  console.log("Loading URL:", url);

  const loadApp = (retryCount = 0) => {
    if (!mainWindow) return;
    
    const maxRetries = 10;
    const retryDelay = 1000;

    mainWindow.loadURL('http://localhost:3000').catch((err) => {
      console.warn(`Failed to load URL (attempt ${retryCount + 1}/${maxRetries}):`, err);
      
      if (retryCount < maxRetries) {
        console.log(`Retrying in ${retryDelay}ms...`);
        setTimeout(() => loadApp(retryCount + 1), retryDelay);
      } else {
        console.error('Max retries reached. Failed to load the app.');
        console.error("❌ Failed to load:", { error: err.message });
      }
    });
  };

  loadApp();

  if (isDev && mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Function to run download script ---
async function runDownloadScript(url: string, options: DownloadOptions): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const scriptPath = isDev
      ? path.join(__dirname, "../../python/main.py")
      : path.join(process.resourcesPath, "app/python/main.py");

    console.log("🔧 Running Python script:", scriptPath);

    // Ensure output directory exists and is writable
    if (options.outputDir) {
      try {
        const outputDir = path.resolve(options.outputDir);
        console.log(`Ensuring output directory exists: ${outputDir}`);
        
        fs.mkdirSync(outputDir, { recursive: true });
        
        try {
          const testFile = path.join(outputDir, '.write-test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          console.log('Output directory is writable');
        } catch (err) {
          console.error('Output directory is not writable:', err);
          return resolve({
            success: false,
            error: `Output directory is not writable: ${outputDir}`
          });
        }
        
        options.outputDir = outputDir;
      } catch (err: unknown) {
        console.error('Failed to create output directory:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return resolve({
          success: false,
          error: `Failed to create output directory: ${errorMessage}`
        });
      }
    } else {
      options.outputDir = process.cwd();
      console.log(`Using current working directory: ${options.outputDir}`);
    }

    const args = [scriptPath];
    args.push(url);
    
    const outputDir = path.normalize(options.outputDir || process.cwd());
    
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const testFile = path.join(outputDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (err: unknown) {
      const errorMsg = `Cannot write to output directory: ${outputDir}. ${err instanceof Error ? err.message : String(err)}`;
      console.error(errorMsg);
      return resolve({
        success: false,
        error: errorMsg
      });
    }

    args.push(outputDir);
    
    if (options.format) args.push('--format', options.format);
    if (options.quality) args.push('--quality', options.quality);
    if (options.processPlaylist) args.push('--process-playlist');
    
    console.log('Using output directory:', outputDir);
    console.log('Running command:', 'python', args.join(' '));

    const pythonProcess: PythonProcess = spawn('python', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    }) as PythonProcess;

    let stdoutBuffer = '';
    
    pythonProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      if (!output) return;
      
      stdoutBuffer += output;
      
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{')) continue;
        
        try {
          const parsed = JSON.parse(trimmed);
          
          if (parsed.type === 'progress' && parsed.data) {
            const progressData = parsed.data;
            
            const safeProgress = {
              status: String(progressData.status || 'downloading'),
              percentage: Number(progressData.percentage || 0),
              downloaded: Number(progressData.downloaded_bytes || progressData.downloaded || 0),
              total: Number(progressData.total_bytes || progressData.total || 0),
              speed: String(progressData._speed_str || progressData.speed || '0 B/s'),
              eta: Number(progressData.eta || 0),
              message: String(progressData.message || ''),
              _percent_str: String(progressData._percent_str || '0%'),
              _speed_str: String(progressData._speed_str || '0 B/s'),
              _eta_str: String(progressData._eta_str || '--:--'),
              filename: progressData.filename 
                ? String(progressData.filename).split(/[/\\]/).pop() 
                : (progressData.currentFile ? String(progressData.currentFile) : ''),
              currentFile: progressData.filename 
                ? String(progressData.filename).split(/[/\\]/).pop() 
                : (progressData.currentFile ? String(progressData.currentFile) : ''),
              downloaded_bytes: Number(progressData.downloaded_bytes || progressData.downloaded || 0),
              total_bytes: Number(progressData.total_bytes || progressData.total || 0)
            };
            
            console.log('[PROGRESS UPDATE]', {
              status: safeProgress.status,
              percentage: safeProgress.percentage,
              message: safeProgress.message
            });
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-progress', safeProgress);
            }
          }
          else if (parsed.type === 'result' && parsed.data) {
            const resultData = parsed.data;
            const result: DownloadResult = {
              success: Boolean(resultData.success),
              message: String(resultData.message || ''),
              outputPath: String(resultData.output_path || ''),
              error: String(resultData.error || '')
            };
            console.log('[DOWNLOAD RESULT]', result);
            resolve(result);
            return;
          }
        } catch (error) {
          console.error('[JSON Parse Error]', error);
          console.log('[Raw line]', trimmed);
        }
      }
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (!output) return;
      
      if (output.includes('[PROGRESS]') || output.includes('[INFO]')) {
        console.log('[PYTHON LOG]', output);
        return;
      }
      
      if (output.includes('[ERROR]')) {
        console.error('[PYTHON ERROR]', output);
        
        const errorMatch = output.match(/\[ERROR\]\s*(.+)/);
        if (errorMatch && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', {
            status: 'error',
            message: errorMatch[1],
            percentage: 0,
            downloaded: 0,
            total: 0,
            speed: '0 B/s',
            eta: 0,
            _percent_str: '0%',
            _speed_str: '0 B/s',
            _eta_str: '--:--',
            downloaded_bytes: 0,
            total_bytes: 0
          });
        }
        return;
      }
      
      try {
        if (output.startsWith('{')) {
          const parsed = JSON.parse(output);
          if (parsed.type === 'error') {
            console.error('[PYTHON JSON ERROR]', parsed.message);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-progress', {
                status: 'error',
                message: parsed.message || 'Unknown error',
                percentage: 0,
                downloaded: 0,
                total: 0,
                speed: '0 B/s',
                eta: 0
              });
            }
          }
        } else {
          console.error('[PYTHON STDERR]', output);
        }
      } catch {
        console.error('[PYTHON STDERR]', output);
      }
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: `Python script exited with code ${code}`
        });
      }
    });
  });
}

// --- IPC HANDLERS ---
function registerIPCHandlers() {
  ipcMain.handle("dialog:openFolder", async () => {
    if (!mainWindow) return null;
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Select Download Folder",
        buttonLabel: "Select Folder",
      });
      return result.canceled ? null : result.filePaths[0];
    } catch (error) {
      console.error("Error in dialog:openFolder:", error);
      return null;
    }
  });

  ipcMain.handle("download:youtube", async (_event, { url, options }: { url: string; options: DownloadOptions }): Promise<DownloadResult> => {
    return runDownloadScript(url, options);
  });

  ipcMain.handle("convert-youtube", async (_event, query: string, options: DownloadOptions = {}) => {
    const result = await runDownloadScript(query, options);
    return result;
  });

  ipcMain.on("window:minimize", () => {
    console.log("main: window:minimize received");
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on("window:maximize", () => {
    console.log("main: window:maximize received");
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    console.log("main: window:close received");
    if (mainWindow) mainWindow.close();
  });
}

// --- APP LIFECYCLE ---
app.whenReady().then(() => {
  createWindow();
  registerIPCHandlers();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});