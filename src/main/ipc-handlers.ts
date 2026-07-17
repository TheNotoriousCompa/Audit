import { ipcMain, dialog } from 'electron';
import { getMainWindow } from './window';
import { runDownload, stopDownload } from './python-bridge';
import type { DownloadOptions, DownloadResult } from '../types/electron';

export function registerIPCHandlers(): void {
  ipcMain.handle('dialog:openFolder', async () => {
    const win = getMainWindow();
    if (!win) return null;
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Download Folder',
        buttonLabel: 'Select Folder',
      });
      return result.canceled ? null : result.filePaths[0];
    } catch (error) {
      console.error('Error in dialog:openFolder:', error);
      return null;
    }
  });

  ipcMain.handle(
    'download:youtube',
    async (_event, { url, options }: { url: string; options: DownloadOptions }): Promise<DownloadResult> => {
      return runDownload(url, options);
    }
  );

  ipcMain.handle(
    'convert-youtube',
    async (_event, query: string, options: DownloadOptions = {}): Promise<DownloadResult> => {
      return runDownload(query, options);
    }
  );

  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  ipcMain.on('download:stop', stopDownload);
}
