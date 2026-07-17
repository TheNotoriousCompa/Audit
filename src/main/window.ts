import { BrowserWindow, app } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import serve from 'electron-serve';
import { logToFile } from './logger';

let mainWindow: BrowserWindow | null = null;
let loadURL: ReturnType<typeof serve> | null = null;

export function initRenderer(): void {
  loadURL = serve({ directory: 'dist/renderer' });
}

export function createWindow(): BrowserWindow {
  const appRoot = app.getAppPath();
  let preloadPath: string;
  let iconPath: string;

  if (isDev) {
    preloadPath = path.join(__dirname, '..', '..', 'dist', 'preload', 'preload.js');
    iconPath = path.join(__dirname, '..', '..', 'Public', 'AUDIT.png');
  } else {
    preloadPath = path.join(appRoot, 'dist', 'preload', 'preload.js');
    iconPath = path.join(appRoot, 'Public', 'AUDIT.png');
  }

  if (!path.isAbsolute(preloadPath)) preloadPath = path.resolve(preloadPath);
  if (!path.isAbsolute(iconPath)) iconPath = path.resolve(iconPath);

  logToFile(`Final preload path: ${preloadPath}`);
  logToFile(`Final icon path: ${iconPath}`);

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    icon: iconPath,
    show: false,
    transparent: true,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    if (!loadURL) {
      logToFile('electron-serve not initialized');
      throw new Error('electron-serve not initialized');
    }
    loadURL(mainWindow).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logToFile(`Failed to load production HTML: ${errMsg}`);
      console.error('Failed to load production HTML:', err);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev && mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
