import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as fs from 'fs';
import path from "path";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import isDev from "electron-is-dev";
import type { DownloadOptions, DownloadProgress, DownloadResult } from '../types/electron';

// Define local types
type PythonProcess = ChildProcessWithoutNullStreams & {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
};

// In CommonJS, __dirname e __filename sono disponibili globalmente
// Non è necessario ridefinirli usando import.meta.url
let mainWindow: BrowserWindow | null = null;

// --- Function to create the main window ---
function createWindow() {
  // Get the correct path for the preload script
  let preloadPath: string;
  
  if (isDev) {
    // In development, preload.js is in dist/preload/ after compilation
    preloadPath = path.join(__dirname, '..', '..', 'dist', 'preload', 'preload.js');
    console.log('Development preload path:', preloadPath);
  } else {
    // In production, use the built file
    preloadPath = path.join(process.resourcesPath, 'app/dist/preload/preload.js');
  }
  
  // Ensure the path is absolute
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

  // Load Next.js or built output
  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../../../out/index.html")}`; // Modificato per CJS

  console.log("Loading URL:", url);

  // Function to load the URL with retry logic
  const loadApp = (retryCount = 0) => {
    if (!mainWindow) return;
    
    const maxRetries = 10;
    const retryDelay = 1000; // 1 second

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

  // Start loading the app
  loadApp();

  // Open the DevTools in development mode
  if (isDev && mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Funzione ausiliaria per eseguire lo script Python ---
async function runDownloadScript(url: string, options: DownloadOptions): Promise<DownloadResult> {
  return new Promise((resolve) => {
    // Point to the main Python script
    const scriptPath = isDev
      ? path.join(__dirname, "../../python/main.py")
      : path.join(process.resourcesPath, "app/python/main.py");

    console.log("🔧 Running Python script:", scriptPath);

    // Ensure output directory exists and is writable
    if (options.outputDir) {
      try {
        // Normalize and resolve the output directory path
        const outputDir = path.resolve(options.outputDir);
        console.log(`Ensuring output directory exists: ${outputDir}`);
        
        // Create directory recursively if it doesn't exist
        fs.mkdirSync(outputDir, { recursive: true });
        
        // Verify the directory is writable
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
        
        // Update the outputDir in options to use the normalized path
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
      // Use current working directory if no output directory is specified
      options.outputDir = process.cwd();
      console.log(`Using current working directory: ${options.outputDir}`);
    }

    const args = [scriptPath];
    
    // Add URL (required)
    args.push(url);
    
    // Normalize and add output directory (positional argument)
    const outputDir = path.normalize(options.outputDir || process.cwd());
    
    // Ensure the output directory exists and is writable
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      // Test write access
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
    
    // Add other options
    if (options.format) args.push('--format', options.format);
    if (options.quality) args.push('--quality', options.quality);
    if (options.processPlaylist) args.push('--process-playlist');
    
    console.log('Using output directory:', outputDir);
    console.log('Running command:', 'python', args.join(' '));

    // Spawn the Python process
    const pythonProcess: PythonProcess = spawn('python', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    }) as PythonProcess;

    // Handle stdout data
    let buffer = '';
    pythonProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      if (!output) return;
      
      // Append to buffer in case of partial JSON
      buffer += output;
      
      // Process complete JSON objects in the buffer
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex).trim();
        buffer = buffer.substring(newlineIndex + 1);
        
        if (!line) continue;
        
        try {
          // Handle both JSON and non-JSON lines
          if (line.startsWith('{')) {
            const data = JSON.parse(line);
            
            // Handle progress updates
            if (data.type === 'progress' && data.data) {
              const progressData = data.data;
              // Validate progress data structure
              if (typeof progressData === 'object') {
                // Ensure required fields exist with proper types
                const safeProgress: DownloadProgress & { filename?: string } = {
                  status: progressData.status || 'downloading',
                  percentage: typeof progressData.percentage === 'number' 
                    ? progressData.percentage 
                    : parseFloat(progressData.percentage) || 0,
                  downloaded: typeof progressData.downloaded === 'number'
                    ? progressData.downloaded
                    : Number(progressData.downloaded) || 0,
                  total: typeof progressData.total === 'number'
                    ? progressData.total
                    : Number(progressData.total) || 0,
                  speed: progressData.speed ? String(progressData.speed) : '0 KB/s',
                  eta: typeof progressData.eta === 'number' ? progressData.eta : -1,
                  filename: progressData.filename ? String(progressData.filename) : '',
                  message: progressData.message ? String(progressData.message) : ''
                };
                
                console.log('[PROGRESS]', safeProgress.status, safeProgress.percentage + '%');
                
                // Send progress to renderer
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('download-progress', safeProgress);
                }
              }
            }
            // Handle final result
            else if (data.type === 'result' && data.data) {
              const resultData = data.data;
              console.log('Download completed:', resultData);
              const result: DownloadResult = {
                success: resultData.success,
                message: resultData.message || '',
                outputPath: resultData.output_path || '',
                error: resultData.error || ''
              };
              resolve(result);
              return;
            }
          } else {
            // Handle non-JSON lines (log messages)
            console.log('[PYTHON]', line);
          }
        } catch (error) {
          console.error('Error parsing data:', error);
          console.log('Raw data that caused error:', line);
        }
      }
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (!output) return;

      // Handle progress messages from Python
      if (output.includes('[PROGRESS]')) {
        const match = output.match(/\[PROGRESS\]\s*(\w+)\s*-\s*([\d.]+)%/);
        if (match) {
          const status = match[1];
          const percentage = parseFloat(match[2]);
          
          if (mainWindow && !mainWindow.isDestroyed()) {
            const progressData = {
              status: status,
              percentage: percentage,
              _percent_str: `${percentage}%`,
              message: status === 'finished' ? 'Download completed' : `${status}...`,
              speed: '0 B/s',
              eta: '--:--',
              downloaded: 0,
              total: 0,
              filename: ''
            };
            
            console.log('Progress update:', progressData);
            mainWindow.webContents.send('download-progress', progressData);
          }
          return;
        }
      }
      
      // Handle download progress from yt-dlp
      const downloadMatch = output.match(/\[download\]\s*([\d.]+)% of/);
      if (downloadMatch) {
        const percentage = parseFloat(downloadMatch[1]);
        if (!isNaN(percentage) && mainWindow && !mainWindow.isDestroyed()) {
          const progressData = {
            status: 'downloading',
            percentage: percentage,
            _percent_str: `${percentage}%`,
            message: `Downloading... ${percentage}%`,
            speed: '0 B/s',
            eta: '--:--',
            downloaded: 0,
            total: 0,
            filename: ''
          };
          
          console.log('Download progress:', progressData);
          mainWindow.webContents.send('download-progress', progressData);
          return;
        }
      }
      
      // Handle JSON messages
      try {
        const data = JSON.parse(output);
        console.log('JSON message:', data);
        
        if (data.type === 'error' && data.message) {
          console.error(`[ERROR] ${data.message}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', {
              status: 'error',
              message: data.message,
              percentage: 0
            });
          }
        }
      } catch {
        // Log non-JSON, non-PROGRESS, non-download messages
        if (!output.startsWith('[INFO]') && 
            !output.includes('[PROGRESS]') && 
            !output.startsWith('[download]')) {
          console.log(`[PYTHON] ${output}`);
        }
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

  // Handler per download:youtube
  ipcMain.handle("download:youtube", async (_event, { url, options }: { url: string; options: DownloadOptions }): Promise<DownloadResult> => {
    return runDownloadScript(url, options);
  });

  // Nuova funzione convert-youtube che usa la stessa logica
  ipcMain.handle("convert-youtube", async (_event, query: string, options: DownloadOptions = {}) => {
    // Utilizza direttamente la funzione ausiliaria
    const result = await runDownloadScript(query, options);
    return result;
  });

  // Nuovi handlers per i controlli finestra
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