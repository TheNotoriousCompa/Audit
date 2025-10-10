// preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
// Importa i tipi dal file centrale
import type { DownloadProgress, DownloadOptions, DownloadResult, ElectronAPI } from '../types/electron.d.ts';

// Log che preload script è caricato
console.log('Preload script loaded');

// Implementazione dell'API
const electronAPI: ElectronAPI = {
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
  selectFolder: (): Promise<string> => {
    console.log('selectFolder called from renderer');
    return ipcRenderer.invoke('dialog:openFolder').catch((error: Error) => {
      console.error('Error in selectFolder:', error);
      throw error;
    });
  },
  downloadYoutube: (url: string, options: DownloadOptions): Promise<DownloadResult> => {
    return ipcRenderer.invoke('download:youtube', { url, options });
  },
  onDownloadProgress: (callback: (event: IpcRendererEvent, progress: DownloadProgress) => void): void => {
    ipcRenderer.on('download-progress', callback);
  },
  removeProgressListener: (callback: (event: IpcRendererEvent, progress: DownloadProgress) => void): void => {
    ipcRenderer.removeListener('download-progress', callback);
  },
  convertYoutube: (query: string, options: DownloadOptions = {}) => {
    console.log('convertYoutube called with query:', query, 'and options:', options);
    return ipcRenderer.invoke('convert-youtube', query, options);
  }
};

// Esporre l'API al processo renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Electron API exposed to renderer');