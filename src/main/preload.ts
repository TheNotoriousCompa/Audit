// preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
// Importa i tipi dal file centrale
import type { DownloadProgress, DownloadOptions, ElectronAPI, LibraryScanResult, TrackArt, MiniCommand, PlayerMiniState, WriteTagFields, WriteTagResult, LibraryCache, LibraryQuery, LibraryQueryResult, LibraryStats } from '../types/electron.d.ts';

// Log che preload script è caricato
console.log('Preload script loaded');

// The mini window is tagged at creation time via additionalArguments, so the
// renderer knows what to display immediately (the old #mini hash + IPC signal
// only worked in dev and raced with React mounting in packaged builds).
const isMiniWindow = process.argv.includes('--audit-mini');

// Implementazione dell'API
const electronAPI: ElectronAPI = {
  isMiniWindow,
  windowMinimize: () => {
    console.log('windowMinimize called');
    ipcRenderer.send('window:minimize');
  },
  windowMaximize: () => {
    console.log('windowMaximize called');
    ipcRenderer.send('window:maximize');
  },
  windowClose: () => {
    console.log('windowClose called');
    ipcRenderer.send('window:close');
  },
  selectFolder: (): Promise<string | null> => {
    console.log('selectFolder called from renderer');
    return ipcRenderer.invoke('dialog:openFolder').catch((error: Error) => {
      console.error('Error in selectFolder:', error);
      throw error;
    });
  },
  ffmpegStatus: (force = false) => {
    return ipcRenderer.invoke('system:ffmpegStatus', force);
  },
  openFfmpegHelp: (): Promise<boolean> => {
    return ipcRenderer.invoke('system:ffmpegHelp');
  },
  openVideoExternally: (filePath: string) => {
    return ipcRenderer.invoke('system:openVideo', filePath);
  },
  onDownloadProgress: (callback: (event: IpcRendererEvent, progress: Partial<DownloadProgress> & Record<string, unknown>) => void): void => {
    ipcRenderer.on('download-progress', callback);
  },
  removeProgressListener: (callback: (event: IpcRendererEvent, progress: Partial<DownloadProgress> & Record<string, unknown>) => void): void => {
    ipcRenderer.removeListener('download-progress', callback);
  },
  convertYoutube: (query: string, options: DownloadOptions = {}) => {
    console.log('convertYoutube called with query:', query, 'and options:', options);
    return ipcRenderer.invoke('convert-youtube', query, options);
  },
  stopDownload: () => {
    console.log('stopDownload called');
    ipcRenderer.send('download:stop');
  },
  scanLibrary: (dir: string): Promise<LibraryScanResult> => {
    console.log('scanLibrary called for:', dir);
    return ipcRenderer.invoke('library:scan', dir);
  },
  getTrackArt: (filePath: string): Promise<TrackArt> => {
    return ipcRenderer.invoke('library:art', filePath);
  },
  writeTags: (filePath: string, fields: WriteTagFields): Promise<WriteTagResult> => {
    return ipcRenderer.invoke('library:writeTags', filePath, fields);
  },
  loadLibraryCache: (): Promise<LibraryCache> => {
    return ipcRenderer.invoke('library:loadCache');
  },
  saveLibraryCache: (cache: LibraryCache): Promise<boolean> => {
    return ipcRenderer.invoke('library:saveCache', cache);
  },
  libraryQuery: (options?: LibraryQuery): Promise<LibraryQueryResult> => {
    return ipcRenderer.invoke('library:query', options ?? {});
  },
  libraryStats: (): Promise<LibraryStats> => {
    return ipcRenderer.invoke('library:stats');
  },
  recordDownload: (filePath: string, sourceUrl?: string): Promise<boolean> => {
    return ipcRenderer.invoke('library:recordDownload', filePath, sourceUrl);
  },
  onMiniCommand: (cb: (cmd: MiniCommand) => void): void => {
    ipcRenderer.on('mini:command', (_event, cmd: MiniCommand) => cb(cmd));
  },
  sendPlayerState: (state: PlayerMiniState): void => {
    ipcRenderer.send('player:state', state);
  },
  onPlayerState: (cb: (state: PlayerMiniState) => void): void => {
    ipcRenderer.on('player:state', (_event, state: PlayerMiniState) => cb(state));
  },
  miniControl: (cmd: MiniCommand): void => {
    ipcRenderer.send('mini:control', cmd);
  },
  expandApp: (): void => {
    ipcRenderer.send('mini:expand');
  },
  closeMini: (): void => {
    ipcRenderer.send('mini:close');
  },
  toggleMini: (): void => {
    ipcRenderer.send('mini:toggle');
  },
  queryMini: (): void => {
    ipcRenderer.send('mini:query');
  },
  onMiniState: (cb: (open: boolean) => void): void => {
    ipcRenderer.on('mini:state', (_event, state: { open?: boolean }) => cb(Boolean(state?.open)));
  },
  onMiniMode: (cb: () => void): void => {
    ipcRenderer.once('mini:mode', () => cb());
  }
};

// Esporre l'API al processo renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Electron API exposed to renderer');