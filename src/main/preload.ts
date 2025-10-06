import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { DownloadProgress, DownloadOptions } from '../types/electron.js';

// Log that preload script is running
console.log('Preload script loaded');

// Expose protected methods to the renderer
const electronAPI = {
  selectFolder: (): Promise<string> => {
    console.log('selectFolder called from renderer');
    return ipcRenderer.invoke('dialog:openFolder').catch((error: Error) => {
      console.error('Error in selectFolder:', error);
      throw error;
    });
  },

  // Nuove funzioni per i controlli finestra
  windowMinimize: (): void => {
    console.log('windowMinimize called');
    ipcRenderer.send('window:minimize');
  },
  windowMaximize: (): void => {
    console.log('windowMaximize called');
    ipcRenderer.send('window:maximize');
  },
  windowClose: (): void => {
    console.log('windowClose called');
    ipcRenderer.send('window:close');
  },

  onDownloadProgress: (callback: (progress: DownloadProgress) => void): ((event: IpcRendererEvent, progress: DownloadProgress) => void) => {
    const listener = (_event: IpcRendererEvent, progress: DownloadProgress) => {
      callback(progress);
    };
    ipcRenderer.on('download-progress', listener);
    return listener;
  },
  removeProgressListener: (listener: (event: IpcRendererEvent, progress: DownloadProgress) => void): void => {
    ipcRenderer.removeListener('download-progress', listener);
  },
  downloadYoutube: (url: string, options: DownloadOptions): Promise<{ output: string }> => {
    return ipcRenderer.invoke('download:youtube', { url, options });
  },
  // Funzione per la conversione YouTube
  convertYoutube: (query: string): Promise<string> => {
    return ipcRenderer.invoke('convert-youtube', query);
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Electron API exposed to renderer');