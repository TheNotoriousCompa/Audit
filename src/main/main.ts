import { app, BrowserWindow } from 'electron';
import isDev from 'electron-is-dev';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const isSquirrelShim = Boolean(require('electron-squirrel-startup'));

import { logToFile, setupCrashHandler } from './logger';
import { initRenderer, createWindow } from './window';
import { registerIPCHandlers } from './ipc-handlers';
import { initAutoUpdater } from './auto-updater';

setupCrashHandler();
logToFile(`--- App Booting (argv: ${process.argv.join(' ')}) ---`);

if (isSquirrelShim) {
  logToFile('--- Squirrel shim handled; skipping UI/updater bootstrap ---');
} else {
  initAutoUpdater();
  initRenderer();
  logToFile(`--- App Starting (isDev: ${isDev}) ---`);

  app.whenReady().then(() => {
    createWindow();
    registerIPCHandlers();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
