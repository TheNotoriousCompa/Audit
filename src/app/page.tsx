"use client";
import React, { useState, useEffect } from "react";
import ParticlesBackground from "@/components/background";
import { Settings, Download, DownloadCloud, FolderOpen, FileSpreadsheet, FileText, Minus, Square, X } from "lucide-react";

// Import types from the centralized type definitions
// The ElectronAPI is available globally via window.electronAPI
export default function Home() {
  const [url, setUrl] = useState("");
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bitrate, setBitrate] = useState(320);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [log, setLog] = useState<string>("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [timeout, setTimeoutVal] = useState(300);
  const [progress, setProgress] = useState<number>(0);

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
    } catch (error) {
      console.error('Error selecting folder:', error);
      alert(`Error selecting folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Helper: check if string is a valid URL
  function isValidUrl(str: string) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  // Handle file import (CSV/TXT)
  const handleImportFile = async (file: File) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setLog("");
    setProgress(0);
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
      if (res.body && res.body.getReader) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let fullText = "";
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value);
            fullText += chunk;
            setLog(fullText);
            // Optionally parse progress from chunk
            const match = chunk.match(/PROGRESS:([0-9.]+)/);
            if (match) setProgress(Number(match[1]));
          }
        }
        setResult("Batch download complete!");
      } else {
        const data = await res.json();
        if (res.ok) {
          setResult(data.output || "Batch download complete!");
        } else {
          setError(data.error || "Batch download failed.");
        }
      }
    } catch {
      setError("Network error or server not reachable.");
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // File input refs
  const csvInputRef = React.useRef<HTMLInputElement>(null);
  const txtInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownload = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    setLog("");
    setProgress(0);
    try {
      const query = url.trim();
      const isUrl = isValidUrl(query);
      const params: Record<string, string> = { 
        bitrate: bitrate.toString(), 
        skipExisting: skipExisting ? "1" : "0", 
        timeout: timeout.toString() 
      };
      if (outputFolder) params.outputFolder = outputFolder;
      if (isUrl) {
        params.url = query;
      } else {
        params.url = `ytsearch1:${query}`;
      }
      const res = await fetch(`/api/download?${new URLSearchParams(params).toString()}`);
      if (res.body && res.body.getReader) {
        // Stream log/progress if supported
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let fullText = "";
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value);
            fullText += chunk;
            setLog(fullText);
            // Try to parse progress from chunk (if backend sends it)
            const match = chunk.match(/PROGRESS:([0-9.]+)/);
            if (match) setProgress(Number(match[1]));
          }
        }
        try {
          const data = JSON.parse(fullText.split("\n").pop() || "{}");
          if (res.ok) {
            setResult(data.output || "Download complete!");
          } else {
            setError(data.error || "Download failed.");
          }
        } catch {
          setResult("Download complete!");
        }
      } else {
        // Fallback: no streaming
        const data = await res.json();
        if (res.ok) {
          setResult(data.output || "Download complete!");
        } else {
          setError(data.error || "Download failed.");
        }
      }
    } catch {
      setError("Network error or server not reachable.");
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <ParticlesBackground />
      
      {/* Draggable Header */}
      <div 
        className="absolute top-0 left-0 right-0 h-8 flex items-center justify-between px-4 bg-transparent z-50"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div className="text-sm text-gray-400">MP3 Downloader</div>
        
        {/* Window Controls - Not draggable */}
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center space-x-2">
          <button 
            onClick={() => window.electronAPI?.minimizeWindow?.()}
            className="p-1 text-gray-300 hover:text-white transition-colors"
            title="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={() => window.electronAPI?.maximizeWindow?.()}
            className="p-1 text-gray-300 hover:text-white transition-colors"
            title="Maximize"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => window.electronAPI?.closeWindow?.()}
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
          className={`absolute top-28 right-6 p-2 rounded-full transition-all duration-200 ${
            showAdvanced ? 'bg-blue-600/50 text-white' : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/70 hover:text-white'
          }`}
          title="Settings"
        >
          <Settings className="w-6 h-6" />
        </button>

        <div className="w-full max-w-3xl bg-gray-900/60 backdrop-blur-xs rounded-2xl p-8 shadow-2xl border border-gray-700/50">
          <h1 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Simple MP3 Downloader
          </h1>
          <div className="space-y-4 w-full">
            <div className="relative">
              <input
                type="text"
                placeholder="Paste YouTube link or 'Artist - Song Name'..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full px-5 py-4 text-base bg-gray-800/50 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-100 placeholder-gray-500 transition-all duration-200"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={handleSelectFolder}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-800/50 hover:bg-gray-700/70 border border-gray-700 rounded-xl text-gray-200 hover:text-white transition-colors duration-200 font-medium text-sm"
              >
                <FolderOpen className="w-5 h-5" />
                {outputFolder ? `Output: ${outputFolder.split('/').pop() || 'Selected'}` : "Choose Folder"}
              </button>
              <button 
                onClick={() => csvInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 rounded-xl text-blue-200 hover:text-white transition-colors duration-200 font-medium text-sm"
                disabled={loading}
              >
                <FileSpreadsheet className="w-5 h-5" />
                Import from CSV
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
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600/30 hover:bg-green-600/50 border border-green-500/50 rounded-xl text-green-200 hover:text-white transition-colors duration-200 font-medium text-sm"
                disabled={loading}
              >
                <FileText className="w-5 h-5" />
                Import from TXT
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
              
              <button
                onClick={handleDownload}
                disabled={loading || !url}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <Download className="w-5 h-5" />
                {loading ? `Downloading...${progress ? ` (${progress}%)` : ''}` : "Download"}
              </button>
              
              <button
                onClick={() => {/* TODO: Implement batch download */}}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <DownloadCloud className="w-5 h-5" />
                Batch Download
              </button>
            </div>
          </div>
        {/* Settings Panel */}
        {showAdvanced && (
          <div className="mt-6 p-6 bg-gray-800/50 border border-gray-700 rounded-xl backdrop-blur-lg">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Advanced Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Bitrate (kbps)</label>
                <input 
                  type="number" 
                  min={64} 
                  max={320} 
                  step={8} 
                  value={bitrate} 
                  onChange={e => setBitrate(Number(e.target.value))} 
                  className="w-full px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Timeout (seconds)</label>
                <input 
                  type="number" 
                  min={30} 
                  max={1200} 
                  step={10} 
                  value={timeout} 
                  onChange={e => setTimeoutVal(Number(e.target.value))} 
                  className="w-full px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  id="skip-existing"
                  checked={skipExisting} 
                  onChange={e => setSkipExisting(e.target.checked)} 
                  className="h-4 w-4 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                />
                <label htmlFor="skip-existing" className="text-sm font-medium text-gray-300">
                  Skip existing files
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {progress > 0 && loading && (
          <div className="w-full mt-6">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>Downloading...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Log Output */}
        {log && (
          <div className="w-full mt-6">
            <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 max-h-48 overflow-y-auto">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{log}</pre>
            </div>
          </div>
        )}

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
      <footer className="mt-8 text-center text-sm text-gray-500">
        Made by <span className="text-emerald-500">&lt;</span>MC<span className="text-emerald-500">/&gt;</span>
      </footer>
    </main>
  );
}
