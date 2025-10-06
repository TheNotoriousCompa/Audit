// Type definitions for the Electron API and CSS properties
declare global {
  // Extend the Window interface to include electronAPI
  interface Window {
    electronAPI: {
      // Window controls
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      
      // File system operations
      selectFolder: () => Promise<string | undefined>;
      
      // YouTube download operations
      downloadYoutube: (url: string, options: DownloadOptions) => Promise<DownloadResult>;
      
      // Progress events
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => void;
      removeProgressListener: () => void;
    };
  }

  // Download options type
  interface DownloadOptions {
    outputDir: string;
    format: 'mp3' | 'mp4';
    quality?: string;
    bitrate?: number;
  }

  // Download result type
  interface DownloadResult {
    success: boolean;
    filePath?: string;
    error?: string;
    duration?: number;
    fileSize?: number;
  }

  // Download progress type
  interface DownloadProgress {
    percentage: number;
    downloaded: number;
    total: number;
    speed: number;
    eta: number;
    status: 'downloading' | 'converting' | 'finished' | 'error';
  }

  // Extend React CSSProperties for custom properties
  namespace React {
    interface CSSProperties {
      WebkitAppRegion?: 'drag' | 'no-drag';
      WebkitUserSelect?: 'none' | 'auto' | 'text';
      WebkitFontSmoothing?: 'antialiased' | 'subpixel-antialiased';
      WebkitOverflowScrolling?: 'touch' | 'auto';
    }
  }

  // Global Node.js variables for webpack
  declare const __dirname: string;
  declare const __filename: string;
  declare const process: NodeJS.Process;
}

// This file is a module
export {};
