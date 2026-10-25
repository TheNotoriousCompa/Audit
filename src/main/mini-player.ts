import { BrowserWindow, ipcMain, screen } from 'electron';
import { getMainWindow } from './window';
import { logToFile } from './logger';
import type { MiniCommand } from '../types/electron';

let miniWindow: BrowserWindow | null = null;
let quitting = false;
let loadMiniContent: ((win: BrowserWindow) => void) | null = null;

/** Mini player (floating window) remote-control surface. */
export function registerQuitHooks(): void {
  // Reserved: quit bypass is armed via armQuitBypass() on before-quit.
}

/** Call once at startup (before quit) so close-to-mini can be bypassed on real quit. */
export function armQuitBypass(): void {
  quitting = true;
}

export function getMiniWindow(): BrowserWindow | null {
  return miniWindow;
}

/** How the mini window loads its content (dev URL vs prod bundle). Set by main.ts. */
export function setMiniLoader(loader: (win: BrowserWindow) => void): void {
  loadMiniContent = loader;
}

export function isMiniOpen(): boolean {
  return !!miniWindow && !miniWindow.isDestroyed();
}

export function toggleMiniPlayer(): void {
  if (isMiniOpen()) closeMiniPlayer();
  else ensureMiniPlayer();
}

let miniPreloadPath: string | null = null;

export function setMiniPreload(preloadPath: string): void {
  miniPreloadPath = preloadPath;
}

export function ensureMiniPlayer(): BrowserWindow | null {
  if (isMiniOpen()) {
    miniWindow?.show();
    miniWindow?.focus();
    return miniWindow;
  }
  try {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const W = 344;
    const H = 152;
    miniWindow = new BrowserWindow({
      width: W,
      height: H,
      x: Math.max(0, width - W - 24),
      y: Math.max(0, height - H - 48),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      title: 'Audit Mini Player',
      webPreferences: {
        preload: miniPreloadPath || undefined,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    if (loadMiniContent) loadMiniContent(miniWindow);
    else logToFile('[MINI] no loader set; mini window created without content');

    miniWindow.once('ready-to-show', () => {
      miniWindow?.show();
    });
    miniWindow.webContents.on('did-finish-load', () => {
      miniWindow?.webContents.send('mini:mode');
    });
    miniWindow.on('closed', () => {
      miniWindow = null;
    });
    return miniWindow;
  } catch (err) {
    logToFile(`[MINI] create failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function closeMiniPlayer(): void {
  if (isMiniOpen()) {
    miniWindow?.destroy();
    miniWindow = null;
  }
}

/** Intercept main-window close: hide to tray + pop the mini player instead of quitting. */
export function setupCloseToMini(mainWindow: BrowserWindow, onFirstHide?: () => void): void {
  let hinted = false;
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
    ensureMiniPlayer();
    if (!hinted) {
      hinted = true;
      onFirstHide?.();
    }
  });
}

/** Wire remote-control forwarding between main and mini renderers. */
export function registerMiniIpc(): void {
  ipcMain.on('mini:control', (_event, cmd: MiniCommand) => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send('mini:command', cmd);
    }
  });
  ipcMain.on('player:state', (_event, state: unknown) => {
    if (isMiniOpen()) {
      miniWindow?.webContents.send('player:state', state);
    }
  });
  ipcMain.on('mini:expand', () => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.show();
      main.focus();
    }
    closeMiniPlayer();
  });
  ipcMain.on('mini:close', () => {
    closeMiniPlayer();
  });
  ipcMain.on('mini:show', () => {
    ensureMiniPlayer();
  });
}
