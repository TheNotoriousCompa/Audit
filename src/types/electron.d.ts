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
  message?: string;
  outputPath?: string;
  error?: string;
}

// Download progress type - FIXED: changed 'idle' to 'ready' to match Python
export type DownloadStatus = 'ready' | 'starting' | 'downloading' | 'converting' | 'finished' | 'error';

export interface DownloadProgress {
  // Core progress fields
  percentage: number;         // 0-100
  downloaded: number;         // bytes
  total: number;              // bytes
  speed: number;              // bytes/second
  speed_str: string;          // human-readable speed (e.g., "1.2 MB/s")
  eta: number;                // estimated seconds remaining
  status: DownloadStatus;     // current status
  message?: string;           // optional status message
  
  // Playlist information
  isPlaylist?: boolean;       // whether this is part of a playlist
  currentItem?: number;       // current item index (1-based)
  totalItems?: number;        // total items in playlist
  currentFile?: string;       // current filename being processed
  
  // Raw data from yt-dlp (for debugging)
  _percent_str?: string;      // formatted percentage (e.g., "50.0%")
  _speed_str?: string;        // original speed string from yt-dlp
  _eta_str?: string;          // formatted ETA (e.g., "01:23")
  downloaded_bytes?: number;  // raw downloaded bytes
  total_bytes?: number;       // raw total bytes
  
  // Additional metadata
  filename?: string;          // output filename
  speed_raw?: number;         // raw speed in bytes/s (for calculations)
  timestamp?: number;         // when this update was received (Date.now())
}

// Type for progress callback that can handle partial progress data
type ProgressCallback = (event: IpcRendererEvent, progress: Partial<DownloadProgress> & Record<string, unknown>) => void;

// Types for the Electron API
export interface ElectronAPI {
  // Window control functions
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  
  // Download functions
  convertYoutube: (query: string, options?: DownloadOptions) => Promise<DownloadResult>;
  onDownloadProgress: (callback: ProgressCallback) => void;
  removeProgressListener: (callback: ProgressCallback) => void;
  selectFolder: () => Promise<string | null>;
  downloadYoutube: (url: string, options: DownloadOptions) => Promise<DownloadResult>;
}

// Extend React CSSProperties for custom properties
declare global {
  interface Window {
    electronAPI: ElectronAPI;
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