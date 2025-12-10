
import React, { useEffect, useState } from 'react';
import { Download, Music, AlertCircle, CheckCircle2, FileAudio, Folder, ListMusic } from 'lucide-react';
import type { DownloadProgress as DownloadProgressType } from '@/types/electron';

interface DownloadProgressProps {
  progress?: DownloadProgressType;
}

const DownloadProgressComponent: React.FC<DownloadProgressProps> = ({ progress }) => {
  const [internalProgress, setInternalProgress] = useState(progress);

  useEffect(() => {
    setInternalProgress(progress);
  }, [progress]);

  if (!internalProgress || (internalProgress.status === 'ready' && internalProgress.percentage === 0 && !internalProgress.message)) return null;

  // Ensure percentage is between 0 and 100
  const isPlaylist = internalProgress.isPlaylist;
  const percent = Math.min(100, Math.max(0, internalProgress.percentage || 0));
  const status = internalProgress.status || 'starting';
  const speed = internalProgress.speed_str || internalProgress._speed_str || '0 B/s';


  const currentFile = internalProgress.filename || internalProgress.currentFile || '';
  const playlistName = internalProgress.playlistName;
  const currentItem = internalProgress.currentItem || 0;
  const totalItems = internalProgress.totalItems || 0;

  // Determine status color and icon
  const getStatusInfo = () => {
    switch (status) {
      case 'finished':
        return { color: 'text-green-400', bg: 'bg-green-500', icon: CheckCircle2 };
      case 'error':
        return { color: 'text-red-400', bg: 'bg-red-500', icon: AlertCircle };
      case 'downloading':
        return { color: 'text-blue-400', bg: 'bg-blue-500', icon: Download };
      case 'converting':
        return { color: 'text-purple-400', bg: 'bg-purple-500', icon: Music };
      case 'cancelled':
        return { color: 'text-gray-400', bg: 'bg-gray-500', icon: AlertCircle };
      case 'info':
        return { color: 'text-yellow-400', bg: 'bg-yellow-500', icon: Download };
      default:
        return { color: 'text-blue-400', bg: 'bg-blue-500', icon: Download };
    }
  };

  const { color, bg, icon: Icon } = getStatusInfo();

  return (
    <div className="w-full bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-xl transition-all duration-300 hover:border-white/20 hover:shadow-2xl hover:bg-black/50">

      {/* Header Row: Icon + Main Info */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`p-2.5 rounded-xl bg-white/5 border border-white/10 ${color}`}>
            <Icon className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="font-bold text-white text-base truncate flex items-center gap-2">
              {status === 'finished' ? 'Download Complete!' :
                status === 'error' ? 'Download Failed' :
                  status === 'cancelled' ? 'Download Cancelled' :
                    status === 'info' ? (internalProgress.message || 'Processing...') :
                      isPlaylist ? 'Downloading Playlist...' : 'Downloading...'}
            </h3>

            {/* Playlist Info or Single File Info */}
            {isPlaylist ? (
              <div className="flex flex-col gap-0.5 mt-0.5">
                {playlistName && (
                  <div className="flex items-center gap-1.5 text-xs text-purple-300 font-medium overflow-hidden">
                    <Folder className="w-3 h-3 shrink-0" />
                    <span className="truncate">{playlistName}</span>
                  </div>
                )}
                {currentItem > 0 && totalItems > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-300 overflow-hidden">
                    <ListMusic className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      Song {currentItem} of {totalItems}
                      <span className="text-white/60 ml-1.5">• {Math.round(internalProgress.percentage || 0)}%</span>
                    </span>
                  </div>
                )}
                {currentFile && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 overflow-hidden mt-1">
                    <FileAudio className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-xs opacity-75">
                      {currentFile.replace(/\.(webm|m4a|webp)$/, '.mp3')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              currentFile && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 overflow-hidden mt-1">
                  <FileAudio className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[200px] sm:max-w-xs">
                    {currentFile.replace(/\.(webm|m4a|webp)$/, '.mp3')}
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Percentage Badge */}
        <div className="flex flex-col items-end">
          {status !== 'info' && (
            <div className="text-2xl font-bold text-white tabular-nums tracking-tight">
              {percent.toFixed(1)}%
            </div>
          )}
          <div className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${color}`}>
            {status}
          </div>
        </div>
      </div>

      {/* Progress Bar - Hide for info status */}
      {status !== 'info' && (
        <div className="relative h-2.5 bg-gray-800/50 rounded-full overflow-hidden mb-3 border border-white/5">
          {/* Background stripe pattern */}
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)',
              backgroundSize: '1rem 1rem'
            }}
          />

          {/* Active progress bar */}
          <div
            className={`absolute left-0 top-0 h-full ${bg} transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {/* Stats Row - Hide for info status */}
      {status !== 'info' && (
        <div className="flex items-center justify-center text-center text-xs text-gray-400 bg-white/5 rounded-lg py-3 border border-white/5">
          <div className="flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Download Speed</span>
            <span className="font-bold text-white tabular-nums text-lg tracking-wide">{speed}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {internalProgress.message && status === 'error' && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{internalProgress.message}</span>
        </div>
      )}
    </div>
  );
};

export default DownloadProgressComponent;
