import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as fs from 'fs';
import path from "path";
import { spawn } from "child_process";
import isDev from "electron-is-dev";
import { fileURLToPath, pathToFileURL } from "url";

// --- ESM equivalents of __dirname and __filename ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// --- Function to create the main window ---
function createWindow() {
  // Get the correct path for the preload script
  let preloadPath: string;
  
  if (isDev) {
    // In development, preload.js is in dist/main/ after compilation
    preloadPath = path.join(__dirname, 'preload.js'); // ✅ corretto
    console.log('Development preload path:', preloadPath);
  } else {
    // In production, use the built file
    preloadPath = path.join(process.resourcesPath, 'app/dist/main/preload.js');
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
    : pathToFileURL(path.join(__dirname, "../../../out/index.html")).href;

  console.log("Loading URL:", url);
  mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });

    mainWindow.webContents.on("did-finish-load", () => {
      console.log("✅ Window finished loading");
    });

    mainWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription) => {
        console.error("❌ Failed to load:", { errorCode, errorDescription });
      }
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
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

// --- PYTHON INTEGRATION ---
ipcMain.handle("convert-youtube", async (_event, query: string) => {
  return new Promise((resolve, reject) => {
    // Point to your actual Python script
    const scriptPath = isDev
      ? path.join(__dirname, "../../python/youtube_to_mp3_converter.py")
      : path.join(process.resourcesPath, "app/python/youtube_to_mp3_converter.py");

    console.log("🔧 Running Python script:", scriptPath);

    const py = spawn("python", [scriptPath, query], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    py.stdout.on("data", (data) => (out += data.toString()));
    py.stderr.on("data", (data) => (err += data.toString()));

    py.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(err.trim() || out.trim());
    });
  });
});

// --- APP LIFECYCLE ---
app.whenReady().then(() => {
  registerIPCHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});