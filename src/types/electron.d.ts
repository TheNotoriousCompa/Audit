// electron.d.ts
import { IpcRendererEvent } from 'electron';

// Supported output formats
export type DownloadFormat = 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus' | 'best';

// Download options type
export interface DownloadOptions {
  outputDir?: string;
  format?: DownloadFormat;
  quality?: string;
  bitrate?: number;
  skipExisting?: boolean;
  timeout?: number;
  processPlaylist?: boolean;
}

// Download result type
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  output_path?: string;
  error?: string;
  [key: string]: string | number | boolean | undefined; // Allow additional properties with specific types
  duration?: number;
  fileSize?: number;
}

// Download progress type
export type DownloadStatus = 'idle' | 'starting' | 'downloading' | 'converting' | 'finished' | 'error';

export interface DownloadProgress {
  percentage: number;
  downloaded: number;
  total: number;
  speed: string;
  eta: number; // in seconds
  status: DownloadStatus;
  message?: string;
  isPlaylist?: boolean;
  // Additional fields for more detailed progress tracking
  _percent_str?: string;
  downloaded_bytes?: number;
  total_bytes?: number;
  _speed_str?: string;
  _eta_str?: string;
  currentItem?: number;
  totalItems?: number;
  currentFile?: string;
}

// Types for the Electron API
export interface ElectronAPI {
  // Funzioni per i controlli finestra
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;

  // Funzioni esistenti
  selectFolder: () => Promise<string>;
  downloadYoutube: (url: string, options: DownloadOptions) => Promise<DownloadResult>;
  onDownloadProgress: (callback: (event: IpcRendererEvent, progress: DownloadProgress) => void) => void;
  removeProgressListener: (listener: (event: IpcRendererEvent, progress: DownloadProgress) => void) => void;
  
  // Nuova funzione per convertire YouTube
  convertYoutube: (query: string, options?: DownloadOptions) => Promise<DownloadResult | string>;
}

// Estendi React CSSProperties per proprietà personalizzate
declare global {
  interface Window {
    electronAPI: ElectronAPI; // ✅ Usa il tipo definito sopra
  }

  namespace React {
    interface CSSProperties {
      WebkitAppRegion?: 'drag' | 'no-drag';
      WebkitUserSelect?: 'none' | 'auto' | 'text';
      WebkitFontSmoothing?: 'antialiased' | 'subpixel-antialiased';
      WebkitOverflowScrolling?: 'touch' | 'auto';
    }
  }
}

export {};