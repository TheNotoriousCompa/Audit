"use client";
import React, { useState, useEffect } from "react";
import ParticlesBackground from "@/components/background";
import DownloadProgressComponent from "@/components/DownloadProgress";
import { Settings, Download, FolderOpen, FileSpreadsheet, FileText, Minus, Square, X } from "lucide-react";
import type { DownloadProgress, DownloadStatus } from '@/types/electron';

export default function Home() {
  const [url, setUrl] = useState("");
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bitrate, setBitrate] = useState(320);
  const [format, setFormat] = useState('mp3');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [timeout, setTimeoutVal] = useState(300);
  const [progress, setProgress] = useState<DownloadProgress>({
    percentage: 0,
    downloaded: 0,
    total: 0,
    speed: 0,
    speed_str: '0 B/s',
    eta: 0,
    status: 'ready',
    message: '',
    _percent_str: '0%',
    _speed_str: '0 B/s',
    _eta_str: '--:--',
    downloaded_bytes: 0,
    total_bytes: 0,
    currentItem: 0,
    totalItems: 0,
    currentFile: '',
    isPlaylist: false,
    filename: '',
    speed_raw: 0,
    timestamp: Date.now()
  });
  const [processPlaylist, setProcessPlaylist] = useState(false);
  const [isPlaylist, setIsPlaylist] = useState(false);

  // Register progress listener from Python script
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onDownloadProgress) {
      const handleProgress = (event: unknown, data: Partial<DownloadProgress> & Record<string, unknown>) => {
        try {
          // Log raw data for debugging
          console.log('[Progress] Raw data:', JSON.stringify(data, null, 2));
          
          // Normalize the progress data
          const now = Date.now();
          const timestamp = now;
          
          // Extract and calculate values
          const percentage = data.percentage !== undefined ? 
            Number(data.percentage) : 
            (data._percent_str ? 
              parseFloat(data._percent_str.replace(/[^\d.]/g, '')) || 0 : 0);
              
          const downloaded = Number(data.downloaded_bytes || data.downloaded || 0);
          const total = Number(data.total_bytes || data.total || 0);
          
          // Calculate speed (convert from string like "1.2 MB/s" to bytes/s)
          let speed = 0;
          const speed_str = data.speed_str || data._speed_str || '0 B/s';
          if (data.speed) {
            speed = Number(data.speed);
          } else if (data._speed_str) {
            // Parse speed string (e.g., "1.2 MB/s")
            const speedMatch = data._speed_str.match(/([\d.]+)\s*([KMG]?B)\/s/);
            if (speedMatch) {
              const value = parseFloat(speedMatch[1]);
              const unit = speedMatch[2];
              const multiplier = 
                unit === 'KB' ? 1024 :
                unit === 'MB' ? 1024 * 1024 :
                unit === 'GB' ? 1024 * 1024 * 1024 : 1;
              speed = value * multiplier;
            }
          }
          
          // Parse ETA (can be in seconds or MM:SS format)
          let eta = 0;
          if (typeof data.eta === 'number') {
            eta = data.eta;
          } else if (data._eta_str && data._eta_str !== '--:--') {
            // Parse MM:SS format
            const [minutes, seconds] = String(data._eta_str).split(':').map(Number);
            eta = (minutes * 60) + (seconds || 0);
          }
          
          // Build the normalized progress object
          // Safely get totalItems, defaulting to 0 if undefined
          const totalItems = typeof data.totalItems === 'number' ? data.totalItems : 0;
          
          const newProgress: DownloadProgress = {
            percentage: Math.min(100, Math.max(0, percentage)),
            downloaded,
            total,
            speed,
            speed_str: typeof data.speed_str === 'string' ? data.speed_str : 
                      typeof data._speed_str === 'string' ? data._speed_str : '0 B/s',
            eta,
            status: (typeof data.status === 'string' ? data.status : 'downloading') as DownloadStatus,
            message: typeof data.message === 'string' ? data.message : '',
            _percent_str: typeof data._percent_str === 'string' ? data._percent_str : `${percentage}%`,
            _speed_str: typeof data._speed_str === 'string' ? data._speed_str : speed_str,
            _eta_str: typeof data._eta_str === 'string' ? data._eta_str : '--:--',
            downloaded_bytes: downloaded,
            total_bytes: total,
            currentItem: typeof data.currentItem === 'number' ? data.currentItem : 0,
            totalItems,
            currentFile: typeof data.currentFile === 'string' ? data.currentFile : 
                        typeof data.filename === 'string' ? data.filename : '',
            isPlaylist: Boolean(data.isPlaylist || totalItems > 1),
            filename: typeof data.filename === 'string' ? data.filename : 
                     typeof data.currentFile === 'string' ? data.currentFile : '',
            speed_raw: speed,
            timestamp
          };
          
          console.log('[Progress] Normalized:', newProgress);
          setProgress(prev => ({
            ...prev,
            ...newProgress
          }));
          
        } catch (error) {
          console.error('Error processing progress update:', error, 'Data:', data);
        }
      };

      window.electronAPI.onDownloadProgress(handleProgress);

      // Cleanup listener
      return () => {
        if (window.electronAPI?.removeProgressListener) {
          window.electronAPI.removeProgressListener(handleProgress);
        }
      };
    }
  }, []);

  // Load the last used output folder on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastFolder = localStorage.getItem('lastOutputFolder');
      if (lastFolder) {
        setOutputFolder(lastFolder);
        console.log('Loaded last used folder:', lastFolder);
      }
    }
  }, []);

  // Detect playlist URLs when URL changes
  useEffect(() => {
    if (url.trim()) {
      const playlistDetected = hasPlaylistParams(url);
      setIsPlaylist(playlistDetected);
      // Auto-enable playlist processing if a playlist is detected
      if (playlistDetected) {
        setProcessPlaylist(true);
      }
    } else {
      setIsPlaylist(false);
      setProcessPlaylist(false);
    }
  }, [url]);

  // Helper: check if URL has playlist parameters
  function hasPlaylistParams(str: string): boolean {
    try {
      const url = new URL(str);
      return url.searchParams.has('list') || url.pathname.includes('/playlist');
    } catch {
      return false;
    }
  }

  const handleSelectFolder = async () => {
    try {
      // Check if we're running in Electron
      if (typeof window !== 'undefined' && window.electronAPI?.selectFolder) {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
          setOutputFolder(folder);
          console.log('Selected folder:', folder);
          // Save the selected folder to local storage
          localStorage.setItem('lastOutputFolder', folder);
        }
      } else {
        console.warn('Electron API not available - running in browser mode');
        // Fallback for browser testing
        if (process.env.NODE_ENV === 'development') {
          // Mock folder selection for development
          const mockFolder = 'C:/Users/Public/Downloads';
          console.log('Using mock folder for development:', mockFolder);
          setOutputFolder(mockFolder);
        } else {
          alert("Folder selection is only available in the desktop app.");
        }
      }
    } catch {
      console.error('Error selecting folder:');
      alert('Error selecting folder: Unknown error');
    }
  };

  // Handle file import (CSV/TXT) - Usa solo API per il batch
  const handleImportFile = async (file: File) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setProgress({
      percentage: 0,
      downloaded: 0,
      total: 0,
      speed: 0,  // speed is a number (bytes/second)
      speed_str: '0 B/s',  // human-readable speed
      eta: 0,  // eta is a number (seconds)
      status: 'starting',
      message: 'Starting batch download...',
      _percent_str: '0%',
      _speed_str: '0 B/s',
      _eta_str: '--:--',
      downloaded_bytes: 0,
      total_bytes: 0,
      currentItem: 0,
      totalItems: 0,
      currentFile: '',
      isPlaylist: false,
      filename: '',
      speed_raw: 0,
      timestamp: Date.now()
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bitrate", bitrate.toString());
      formData.append("timeout", timeout.toString());
      formData.append("skipExisting", skipExisting ? "1" : "0");
      if (outputFolder) formData.append("outputFolder", outputFolder);
      
      const res = await fetch("/api/download?batch=1", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Batch download failed.");
        setProgress(prev => ({
          ...prev,
          status: 'error',
          message: data.error || 'Batch download failed'
        }));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error or server not reachable';
      setError(errorMessage);
      setProgress(prev => ({
        ...prev,
        status: 'error',
        message: errorMessage
      }));
    } finally {
      setLoading(false);
      // Keep the final progress state for a few seconds before resetting
      setTimeout(() => {
        setProgress(prev => ({
          ...prev,
          status: 'idle' as DownloadStatus,
          percentage: 0,
          message: ''
        }));
      }, 5000);
    }
  };

  // File input refs
  const csvInputRef = React.useRef<HTMLInputElement>(null);
  const txtInputRef = React.useRef<HTMLInputElement>(null);

  // Handle download
  const handleDownload = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL or search query');
      return;
    }

    if (!outputFolder) {
      setError('Please select an output folder');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Prepare the query string
      let query = url.trim();
      const isYoutubeUrl = query.match(/(youtube\.com|youtu\.be)/i);
      if (!isYoutubeUrl) {
        query = `ytsearch1:${query}`;
      }

      // Prepare options object with proper typing
      const options: {
        outputDir?: string;
        bitrate: number;
        timeout: number;
        skipExisting: boolean;
        processPlaylist: boolean;
        format: 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus' | 'best';
      } = {
        outputDir: outputFolder || undefined,
        bitrate,
        timeout,
        skipExisting,
        processPlaylist,
        format: format as 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus' | 'best'
      };

      // Call Electron API with proper type assertion
      if (typeof window !== 'undefined' && window.electronAPI?.convertYoutube) {
        const result = await window.electronAPI.convertYoutube(query, options) as 
          | { success: true; filePath?: string }
          | { success: false; error?: string }
          | string;
        
        // Handle the response with proper type checking
        if (typeof result === 'string') {
          setResult(result);
        } else if (result.success) {
          setResult(`Downloaded successfully to: ${result.filePath || outputFolder}`);
        } else {
          setError(result.error || 'Failed to download');
        }
      } else {
        setError('Electron API not available');
      }
    } catch (err) {
      console.error('Error during download:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred during download');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <ParticlesBackground />
      
      {/* Draggable Header with Native Window Controls */}
      <div 
        className="absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-4 bg-transparent z-50"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div className="text-sm text-gray-400">MP3 Downloader</div>
        
        {/* Window Controls - Not draggable */}
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center space-x-2">
        <button 
          onClick={() => window.electronAPI?.windowMinimize?.()}
          className="p-1 text-gray-300 hover:text-white transition-colors"
          title="Minimize"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button 
          onClick={() => window.electronAPI?.windowMaximize?.()}
          className="p-1 text-gray-300 hover:text-white transition-colors"
          title="Maximize"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => window.electronAPI?.windowClose?.()}
          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 pt-16">
        {/* Settings Button */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`absolute top-12 right-4 sm:top-16 sm:right-6 p-3 rounded-full transition-all duration-200 ${
            showAdvanced ? 'bg-black/1 text-white' : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/70 hover:text-white'
          }`}
          title="Settings"
        >
          <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        <div className="w-full max-w-3xl bg-gray-900/60 backdrop-blur-xs rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl border border-gray-700/50 mx-2 sm:mx-4">
          <div className="space-y-4 w-full">
            <div className="flex gap-2 w-full">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Paste YouTube link or 'Artist - Song Name'..."
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="w-full px-4 py-3 sm:px-5 sm:py-4 text-sm sm:text-base bg-gray-800/50 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-100 placeholder-gray-500 transition-all duration-200"
                  disabled={loading}
                />
              </div>
              {isPlaylist && (
                <div className="flex items-center bg-purple-600/30 rounded-xl px-4 border border-purple-500/30">
                  <input
                    type="checkbox"
                    id="processPlaylist"
                    checked={processPlaylist}
                    onChange={(e) => setProcessPlaylist(e.target.checked)}
                    className="h-5 w-5 text-purple-500 rounded border-gray-600 bg-gray-700 focus:ring-purple-500"
                  />
                  <label htmlFor="processPlaylist" className="ml-2 text-sm font-medium text-white whitespace-nowrap">
                    Download Playlist
                  </label>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={handleSelectFolder}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 bg-gray-800/50 hover:bg-gray-700/70 border border-gray-700 rounded-xl text-gray-200 hover:text-white transition-colors duration-200 font-medium text-xs sm:text-sm"
              >
                <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="truncate">{outputFolder ? `Output: ${outputFolder.split('\\').pop()?.split('/').pop() || 'Selected'}` : "Choose Folder"}</span>
              </button>
              <button 
                onClick={() => csvInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 rounded-xl text-blue-200 hover:text-white transition-colors duration-200 font-medium text-xs sm:text-sm"
                disabled={loading}
              >
                <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden xs:inline">Import from</span> CSV
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) handleImportFile(e.target.files[0]);
                  }}
                />
              </button>
              <button 
                onClick={() => txtInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 bg-green-600/30 hover:bg-green-600/50 border border-green-500/50 rounded-xl text-green-200 hover:text-white transition-colors duration-200 font-medium text-xs sm:text-sm"
                disabled={loading}
              >
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden xs:inline">Import from</span> TXT
                <input
                  ref={txtInputRef}
                  type="file"
                  accept=".txt"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) handleImportFile(e.target.files[0]);
                  }}
                />
              </button>
            </div>

            {/* Download Button */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleDownload}
                disabled={loading || (!url.trim() && !csvInputRef.current?.files?.length && !txtInputRef.current?.files?.length)}
                className={`w-full py-3 px-6 rounded-xl font-semibold text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-2 ${
                  loading || (!url.trim() && !csvInputRef.current?.files?.length && !txtInputRef.current?.files?.length)
                    ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white hover:shadow-lg hover:shadow-blue-500/20 transform hover:-translate-y-0.5'
                }`}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-white/30 border-t-white"></div>
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>{url.trim() ? 'Download MP3' : 'Process Imported Files'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Advanced Options */}
            {showAdvanced && (
              <div className="mt-4 p-4 bg-gray-800/30 rounded-xl border border-gray-700/50 space-y-4">
                <h3 className="text-sm font-medium text-gray-300">Advanced Options</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Format
                      </label>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                      >
                        <option value="mp3">MP3 (Best compatibility)</option>
                        <option value="m4a">M4A (AAC)</option>
                        <option value="flac">FLAC (Lossless)</option>
                        <option value="wav">WAV (Uncompressed)</option>
                        <option value="opus">Opus (Efficient)</option>
                        <option value="best">Best Available</option>
                      </select>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Bitrate (kbps)
                      </label>
                      <select
                        value={bitrate}
                        onChange={(e) => setBitrate(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                        disabled={!['mp3', 'opus'].includes(format)}
                      >
                        <option value="128">128 kbps</option>
                        <option value="192">192 kbps</option>
                        <option value="256">256 kbps</option>
                        <option value="320">320 kbps (Best)</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs sm:text-sm text-gray-400">Timeout (seconds)</label>
                    <input
                      type="number"
                      value={timeout}
                      onChange={(e) => setTimeoutVal(Number(e.target.value))}
                      min="30"
                      step="30"
                      className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="skipExisting"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    className="h-4 w-4 text-blue-500 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                  />
                  <label htmlFor="skipExisting" className="ml-2 text-xs sm:text-sm text-gray-300">
                    Skip existing files
                  </label>
                </div>
              </div>
            )}

            {/* Progress Bar - Always show if there's any progress data */}
            <div className="w-full mt-6">
              <DownloadProgressComponent progress={progress} />
            </div>

            {/* Results and Errors */}
            <div className="w-full mt-6 space-y-4">
              {result && (
                <div className="p-4 bg-green-900/30 border border-green-800/50 rounded-xl">
                  <p className="text-green-400 font-medium">
                    <span className="font-bold">Success:</span> {result}
                  </p>
                </div>
              )}
              
              {error && (
                <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-xl">
                  <p className="text-red-400 font-medium">
                    <span className="font-bold">Error:</span> {error}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-gray-500">
              <div className="inline-grid grid-cols-2 gap-x-8 gap-y-2 text-left">
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                  <span>MP3 up to 320kbps</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                  <span>Playlist support</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                  <span>Batch processing</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></div>
                  <span>Cross-platform</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="mt-8 text-center text-sm text-gray-500">
        Made by <span className="text-emerald-500"></span>MC<span className="text-emerald-500">/</span>
      </footer>
    </main>
  );
}