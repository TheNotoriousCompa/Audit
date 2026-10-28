import { app, BrowserWindow } from 'electron';
import isDev from 'electron-is-dev';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const isSquirrelShim = Boolean(require('electron-squirrel-startup'));

import { logToFile, setupCrashHandler } from './logger';
import { initRenderer, createWindow, loadMainContent, getMiniPreloadPath, getIconPath } from './window';
import { registerIPCHandlers } from './ipc-handlers';
import { initAutoUpdater } from './auto-updater';
import { registerMediaProtocolScheme, handleMediaProtocol } from './media-protocol';
import { initDb, closeDb } from './db';
import {
  registerMiniIpc, setupMinimizeToMini, setMiniLoader, setMiniPreload, armQuitBypass,
} from './mini-player';
import { setupTray, showMiniHint } from './tray';

registerMediaProtocolScheme();

setupCrashHandler();
logToFile(`--- App Booting (argv: ${process.argv.join(' ')}) ---`);

if (isSquirrelShim) {
  logToFile('--- Squirrel shim handled; skipping UI/updater bootstrap ---');
} else {
  initAutoUpdater();
  initRenderer();
  logToFile(`--- App Starting (isDev: ${isDev}) ---`);

  app.whenReady().then(() => {
    try {
      initDb();
    } catch (err) {
      logToFile(`[DB] startup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    handleMediaProtocol();
    registerMiniIpc();
    setMiniPreload(getMiniPreloadPath());
    setMiniLoader((mini) => loadMainContent(mini, true));
    const win = createWindow();
    setupMinimizeToMini(win, () => showMiniHint());
    // Closing the main window quits the app (Windows/Linux). The mini window
    // is an accessory, so it must not keep the process alive.
    win.on('closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
    registerIPCHandlers();
    setupTray(getIconPath(), () => {
      armQuitBypass();
      app.quit();
    });
    app.on('before-quit', () => armQuitBypass());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    closeDb();
  });
}
