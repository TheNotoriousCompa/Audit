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

/** True when the window exists AND is actually on screen. */
export function isMiniVisible(): boolean {
  return isMiniOpen() && !!miniWindow?.isVisible();
}

function notifyMain(): void {
  const main = getMainWindow();
  if (main && !main.isDestroyed()) {
    main.webContents.send('mini:state', { open: isMiniVisible() });
  }
}

export function toggleMiniPlayer(): void {
  if (isMiniVisible()) hideMiniPlayer();
  else ensureMiniPlayer();
  notifyMain();
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
        // Detected by the preload at startup: no hash/IPC race in production,
        // where the renderer is served from the app:// protocol.
        additionalArguments: ['--audit-mini'],
      },
    });
    if (loadMiniContent) loadMiniContent(miniWindow);
    else logToFile('[MINI] no loader set; mini window created without content');

    miniWindow.once('ready-to-show', () => {
      miniWindow?.show();
      notifyMain();
    });
    miniWindow.webContents.on('did-finish-load', () => {
      miniWindow?.webContents.send('mini:mode');
    });
    miniWindow.on('closed', () => {
      miniWindow = null;
      notifyMain();
    });
    return miniWindow;
  } catch (err) {
    logToFile(`[MINI] create failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Hide (not destroy) so reopening is instant: the renderer keeps its state
 * and the last player:state snapshot. The window is destroyed only on quit.
 */
export function hideMiniPlayer(): void {
  if (isMiniOpen()) {
    miniWindow?.hide();
    notifyMain();
  }
}

export function closeMiniPlayer(): void {
  if (isMiniOpen()) {
    miniWindow?.destroy();
    miniWindow = null;
    notifyMain();
  }
}

/** Show the floating player when the main window is minimised. Closing the
 *  main window quits the app instead (what users expect from a desktop app). */
export function setupMinimizeToMini(mainWindow: BrowserWindow, onFirstHide?: () => void): void {
  let hinted = false;
  mainWindow.on('minimize', () => {
    if (quitting) return;
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
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    }
    hideMiniPlayer();
  });
  ipcMain.on('mini:close', () => {
    // Closing the mini player brings the app back instead of leaving it
    // hidden with no visible window.
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    }
    hideMiniPlayer();
  });
  ipcMain.on('mini:toggle', () => {
    toggleMiniPlayer();
  });
  ipcMain.on('mini:query', (event) => {
    event.sender.send('mini:state', { open: isMiniVisible() });
  });
  ipcMain.on('mini:show', () => {
    ensureMiniPlayer();
    notifyMain();
  });
}
