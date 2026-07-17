import path from 'path';
import * as fs from 'fs';
import isDev from 'electron-is-dev';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { updateElectronApp } = require('update-electron-app');
import { logToFile } from './logger';

export function initAutoUpdater(): void {
  if (isDev) return;

  const updateExe = path.join(path.dirname(process.execPath), '..', 'Update.exe');
  if (!fs.existsSync(updateExe)) {
    logToFile('[UPDATER] Skipped — Squirrel Update.exe not found');
    return;
  }

  try {
    updateElectronApp();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logToFile(`[WARNING] Failed to initialize updateElectronApp: ${errMsg}`);
  }
}
