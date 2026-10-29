import { ipcMain, dialog, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { getMainWindow } from './window';
import { runDownload, stopDownload } from './python-bridge';
import { scanLibrary, getTrackArt, writeTrackTags, loadLibraryCache, saveLibraryCache } from './library';
import { queryTracks, libraryStats, recordDownload } from './db';
import { approveRoot, isApprovedFile } from './approved-paths';
import { getFfmpegStatus } from './ffmpeg-status';
import { assertTrustedSender, isTrustedSender } from './trust';
import type { DownloadOptions, DownloadResult, LibraryQuery } from '../types/electron';

function guard(event: IpcMainInvokeEvent): void {
  assertTrustedSender(event, false);
}

function guardOn(event: IpcMainEvent): boolean {
  return isTrustedSender(event.sender.id, false);
}

export function registerIPCHandlers(): void {
  ipcMain.handle('dialog:openFolder', async (event) => {
    guard(event);
    const win = getMainWindow();
    if (!win) return null;
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Download Folder',
        buttonLabel: 'Select Folder',
      });
      if (result.canceled) return null;
      const folder = result.filePaths[0] ?? null;
      if (folder) approveRoot(folder);
      return folder;
    } catch (error) {
      console.error('Error in dialog:openFolder:', error);
      return null;
    }
  });

  ipcMain.handle('system:ffmpegStatus', async (event, force?: boolean) => {
    guard(event);
    return getFfmpegStatus(Boolean(force));
  });

  ipcMain.handle('system:ffmpegHelp', async (event) => {
    guard(event);
    try {
      await shell.openExternal('https://ffmpeg.org/download.html');
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    'download:youtube',
    async (event, { url, options }: { url: string; options: DownloadOptions }): Promise<DownloadResult> => {
      guard(event);
      if (!url || typeof url !== 'string') {
        return { success: false, error: 'Invalid download query' };
      }
      return runDownload(url, options);
    }
  );

  ipcMain.handle(
    'convert-youtube',
    async (event, query: string, options: DownloadOptions = {}): Promise<DownloadResult> => {
      guard(event);
      if (!query || typeof query !== 'string') {
        return { success: false, error: 'Invalid download query' };
      }
      return runDownload(query, options);
    }
  );

  ipcMain.handle('library:scan', async (event, dir: string) => {
    guard(event);
    return scanLibrary(dir);
  });

  ipcMain.handle('library:loadCache', async (event) => {
    guard(event);
    return loadLibraryCache();
  });

  ipcMain.handle('library:saveCache', async (event, cache: unknown) => {
    guard(event);
    const c = (cache || {}) as Partial<import('../types/electron').LibraryCache>;
    return saveLibraryCache({
      version: 1,
      roots: Array.isArray(c.roots) ? c.roots.filter((r): r is string => typeof r === 'string') : [],
      scannedAt: Number(c.scannedAt) || 0,
      tracks: Array.isArray(c.tracks) ? c.tracks : [],
    });
  });

  ipcMain.handle('library:art', async (event, filePath: string) => {
    guard(event);
    return getTrackArt(String(filePath));
  });

  ipcMain.handle('library:writeTags', async (event, filePath: string, fields: unknown) => {
    guard(event);
    const f = (fields || {}) as Record<string, unknown>;
    return writeTrackTags(String(filePath), {
      title: typeof f.title === 'string' ? f.title : '',
      artist: typeof f.artist === 'string' ? f.artist : '',
      album: typeof f.album === 'string' ? f.album : '',
      genre: typeof f.genre === 'string' ? f.genre : '',
    });
  });

  ipcMain.on('window:minimize', (event) => {
    if (!guardOn(event)) return;
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', (event) => {
    if (!guardOn(event)) return;
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); }
  });

  ipcMain.on('window:close', (event) => {
    if (!guardOn(event)) return;
    getMainWindow()?.close();
  });

  ipcMain.on('download:stop', (event) => {
    if (!guardOn(event)) return;
    stopDownload();
  });

  // SQLite-backed library queries (sort/filter/pagination without loading
  // the whole library into the renderer).
  ipcMain.handle('library:query', (event, options: LibraryQuery | undefined) => {
    guard(event);
    return queryTracks(options || {});
  });
  ipcMain.handle('library:stats', (event) => {
    guard(event);
    return libraryStats();
  });
  ipcMain.handle('library:recordDownload', (event, filePath: string, sourceUrl?: string) => {
    guard(event);
    if (!isApprovedFile(String(filePath))) return false;
    recordDownload(String(filePath), sourceUrl ? String(sourceUrl) : undefined);
    return true;
  });
}
