import { IpcRendererEvent } from 'electron';

// Types for the Electron API
export interface DownloadProgress {
  percentage: number;
  downloaded: number;
  total: number;
  speed: number;
  eta: number;
}

export interface DownloadOptions {
  bitrate?: number;
  outputFolder?: string;
  skipExisting?: boolean;
  timeout?: number;
}

export interface ElectronAPI {
  // Funzioni per i controlli finestra (nuovi nomi)
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;

  // Funzioni esistenti
  selectFolder: () => Promise<string>;
  downloadYoutube: (url: string, options: DownloadOptions) => Promise<{ output: string }>;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => (event: IpcRendererEvent, progress: DownloadProgress) => void;
  removeProgressListener: (listener: (event: IpcRendererEvent, progress: DownloadProgress) => void) => void;

  // Nuova funzione per convertire YouTube
  convertYoutube: (query: string) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};