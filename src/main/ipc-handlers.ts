import { ipcMain, dialog } from 'electron';
import { getMainWindow } from './window';
import { runDownload, stopDownload } from './python-bridge';
import { scanLibrary, getTrackArt, writeTrackTags, loadLibraryCache, saveLibraryCache } from './library';
import { queryTracks, libraryStats, recordDownload } from './db';
import type { DownloadOptions, DownloadResult, LibraryQuery } from '../types/electron';

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

  ipcMain.handle('library:scan', async (_event, dir: string) => {
    return scanLibrary(dir);
  });

  ipcMain.handle('library:loadCache', async () => {
    return loadLibraryCache();
  });

  ipcMain.handle('library:saveCache', async (_event, cache: unknown) => {
    const c = (cache || {}) as Partial<import('../types/electron').LibraryCache>;
    return saveLibraryCache({
      version: 1,
      roots: Array.isArray(c.roots) ? c.roots.filter((r): r is string => typeof r === 'string') : [],
      scannedAt: Number(c.scannedAt) || 0,
      tracks: Array.isArray(c.tracks) ? c.tracks : [],
    });
  });

  ipcMain.handle('library:art', async (_event, filePath: string) => {
    return getTrackArt(filePath);
  });

  ipcMain.handle('library:writeTags', async (_event, filePath: string, fields: unknown) => {
    const f = (fields || {}) as Record<string, unknown>;
    return writeTrackTags(filePath, {
      title: typeof f.title === 'string' ? f.title : '',
      artist: typeof f.artist === 'string' ? f.artist : '',
      album: typeof f.album === 'string' ? f.album : '',
      genre: typeof f.genre === 'string' ? f.genre : '',
    });
  });

  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); }
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  ipcMain.on('download:stop', stopDownload);

  // SQLite-backed library queries (sort/filter/pagination without loading
  // the whole library into the renderer).
  ipcMain.handle('library:query', (_event, options: LibraryQuery | undefined) => {
    return queryTracks(options || {});
  });
  ipcMain.handle('library:stats', () => libraryStats());
  ipcMain.handle('library:recordDownload', (_event, filePath: string, sourceUrl?: string) => {
    recordDownload(String(filePath), sourceUrl ? String(sourceUrl) : undefined);
    return true;
  });
}
