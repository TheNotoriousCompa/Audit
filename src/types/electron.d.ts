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
  fps?: number;
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
export type DownloadStatus = 'ready' | 'starting' | 'downloading' | 'converting' | 'finished' | 'error' | 'cancelled' | 'info';

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
  playlistName?: string;      // name of the playlist being downloaded
  playlistFolder?: string;    // folder where playlist files are saved
  total_playlist_eta?: number; // ETA totale stimato per la playlist in secondi

  // Explicit percentages
  file_percent?: number;
  playlist_percent?: number;

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

// A single audio file in the local library.
export interface Track {
  path: string;
  filename: string;
  size: number;
  mtime: number;
  ext: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  has_art: boolean;
  lrc: boolean;
  /** Canonical genre inferred by the smart pass (tag/album/artist/folder). */
  genre_guess?: string;
  genre_confidence?: number;
  genre_source?: 'tag' | 'album' | 'artist' | 'folder' | 'filename' | 'artist_seed' | '';
  genre_rule?: string;
  /** When the scanner first saw the file (ms, optional). */
  added_at?: number;
  /** When Audit downloaded the file (ms, optional, from the downloads journal). */
  downloaded_at?: number;
}

export interface LibraryScanResult {
  success: boolean;
  root: string;
  count: number;
  tracks: Track[];
  error: string;
}

export interface LibraryCache {
  version: number;
  roots: string[];
  scannedAt: number;
  tracks: Track[];
}

// ---- Library queries (SQLite-backed) ----
export type LibrarySort = 'downloaded' | 'added' | 'title' | 'artist' | 'album' | 'duration';

export interface LibraryQuery {
  sort?: LibrarySort;
  filter?: string;
  /** Restrict to one canonical genre. */
  genre?: string;
  /** Only tracks downloaded by Audit (downloaded_at is present). */
  downloadedOnly?: boolean;
  /** Separate music files from .mp4 videos. */
  mediaType?: 'music' | 'videos';
  limit?: number;
  offset?: number;
}

export interface LibraryQueryResult {
  total: number;
  items: Track[];
}

export interface LibraryStats {
  total: number;
  withGenre: number;
  downloaded: number;
  artists: number;
  albums: number;
  genres: { genre: string; count: number }[];
}

export interface TrackArt {
  found: boolean;
  mime: string;
  dataUrl: string;
  source: 'embedded' | 'folder' | '';
  error: string;
}

export interface FfmpegStatus {
  found: boolean;
  path: string;
  version: string;
  error: string;
}

export interface OpenMediaResult {
  success: boolean;
  error: string;
}

export interface WriteTagFields {
  title: string;
  artist: string;
  album: string;
  genre: string;
}

export interface WriteTagResult {
  success: boolean;
  track: Track | null;
  error: string;
}

export type MiniCommand = 'toggle' | 'prev' | 'next' | { type: 'seek'; pos: number } | { type: 'volume'; vol: number };

export interface PlayerMiniState {
  playing: boolean;
  title: string;
  artist: string;
  pos: number;
  dur: number;
  vol: number;
  accent: string;
  art: string | null;
  artPath: string | null;
  hasQueue: boolean;
}

/** Declarative, offline-only theme data. No CSS or JavaScript is stored here. */
export interface AuditThemeTokens {
  background?: string;
  backgroundImage?: string;
  surface?: string;
  surfaceStrong?: string;
  text?: string;
  muted?: string;
  accent?: string;
  accentContrast?: string;
  border?: string;
  fontFamily?: string;
  radius?: number;
  glass?: boolean;
  waves?: boolean;
  decor?: 'pixel';
}

export interface AuditTheme {
  schemaVersion: 1;
  id: string;
  name: string;
  author?: string;
  version?: string;
  description?: string;
  tokens: AuditThemeTokens;
}

export interface ThemeImportResult {
  success: boolean;
  themes: AuditTheme[];
  imported?: AuditTheme;
  error?: string;
}

export interface ThemeBackgroundResult {
  success: boolean;
  dataUrl?: string;
  error?: string;
}

// Types for the Electron API
export interface ElectronAPI {
  /** True inside the floating mini-player window (set by the preload). */
  isMiniWindow: boolean;
  // Window control functions
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;

  // Download functions
  convertYoutube: (query: string, options?: DownloadOptions) => Promise<DownloadResult>;
  onDownloadProgress: (callback: ProgressCallback) => void;
  removeProgressListener: (callback: ProgressCallback) => void;
  selectFolder: () => Promise<string | null>;
  stopDownload: () => void;
  ffmpegStatus: (force?: boolean) => Promise<FfmpegStatus>;
  openFfmpegHelp: () => Promise<boolean>;
  openVideoExternally: (filePath: string) => Promise<OpenMediaResult>;

  // Local library (player)
  scanLibrary: (dir: string) => Promise<LibraryScanResult>;
  getTrackArt: (filePath: string) => Promise<TrackArt>;
  writeTags: (filePath: string, fields: WriteTagFields) => Promise<WriteTagResult>;
  loadLibraryCache: () => Promise<LibraryCache>;
  saveLibraryCache: (cache: LibraryCache) => Promise<boolean>;

  // SQLite-backed library queries
  libraryQuery: (options?: LibraryQuery) => Promise<LibraryQueryResult>;
  libraryStats: () => Promise<LibraryStats>;
  recordDownload: (filePath: string, sourceUrl?: string) => Promise<boolean>;

  // Mini player remote control
  onMiniCommand: (cb: (cmd: MiniCommand) => void) => void;
  sendPlayerState: (state: PlayerMiniState) => void;
  onPlayerState: (cb: (state: PlayerMiniState) => void) => void;
  miniControl: (cmd: MiniCommand) => void;
  expandApp: () => void;
  closeMini: () => void;
  toggleMini: () => void;
  queryMini: () => void;
  onMiniState: (cb: (open: boolean) => void) => void;
  onMiniMode: (cb: () => void) => void;

  // Offline themes
  listThemes: () => Promise<AuditTheme[]>;
  importTheme: () => Promise<ThemeImportResult>;
  exportTheme: (theme: AuditTheme) => Promise<boolean>;
  deleteTheme: (id: string) => Promise<AuditTheme[]>;
  openThemesFolder: () => Promise<boolean>;
  pickThemeBackground: () => Promise<ThemeBackgroundResult>;
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

export { };