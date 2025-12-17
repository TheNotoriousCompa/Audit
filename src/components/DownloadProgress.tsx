import React, { useEffect, useState } from 'react';
import { Download, Music, AlertCircle, CheckCircle2, FileAudio, Folder } from 'lucide-react';
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

  // Calculate progress values
  const isPlaylist = internalProgress.isPlaylist;
  const status = internalProgress.status || 'starting';
  const speed = internalProgress.speed_str || internalProgress._speed_str || '0 B/s';

  // Get progress values, ensuring they're within 0-100 range
  const filePercent = Math.min(100, Math.max(0, internalProgress.file_percent || 0));
  const playlistPercent = Math.min(100, Math.max(0, internalProgress.playlist_percent || 0));
  const displayPercent = isPlaylist ? playlistPercent : filePercent;

  // Get file and playlist info
  const currentFile = internalProgress.filename || internalProgress.currentFile || '';
  const playlistName = internalProgress.playlistName;
  const currentItem = Math.max(1, internalProgress.currentItem || 0);
  const totalItems = Math.max(1, internalProgress.totalItems || 0);

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
          <div className={`p-2.5 rounded-xl bg-white/5 border ${color} border-opacity-30`}>
            <Icon className="w-6 h-6" />
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
              <div className="flex flex-col gap-1.5 mt-1 w-full">
                {/* Playlist Header */}
                <div className="flex flex-col w-full gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-purple-300 font-medium overflow-hidden">
                    <Folder className="w-3 h-3 shrink-0" />
                    <span className="truncate">{playlistName || 'Playlist'}</span>
                  </div>

                  {/* Canzone X di Y */}
                  {status === 'downloading' && totalItems > 0 && (
                    <div className="text-[11px] text-blue-200">
                      Canzone {currentItem} di {totalItems}
                    </div>
                  )}

                  {/* Nome canzone corrente */}
                  {currentFile && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-300 overflow-hidden">
                      <FileAudio className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[220px] sm:max-w-sm">
                        {currentFile.replace(/\.(webm|m4a|webp)$/, '.mp3')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Barra di avanzamento del file corrente (piccola) */}
                {status === 'downloading' && currentFile && (
                  <div className="w-full space-y-1 mt-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span className="opacity-70">Brano corrente</span>
                      <span className="text-blue-300 font-mono">{filePercent.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${filePercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              currentFile && (
                <div className="flex flex-col gap-1.5 mt-1 w-full">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FileAudio className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-xs">
                      {currentFile.replace(/\.(webm|m4a|webp)$/, '.mp3')}
                    </span>
                  </div>
                  {status === 'downloading' && isPlaylist && (
                    <div className="w-full flex items-center gap-2">
                      <div className="h-1.5 bg-gray-800/50 rounded-full flex-1 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${filePercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-emerald-300 font-mono w-10 text-right">
                        {filePercent.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>

        {/* Status on the right (REMOVED as requested) */}
        <div className="flex flex-col items-end">
        </div>
      </div>

      {/* Stats Row - Show for downloading status */}
      {status === 'downloading' && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-400 mb-3">
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Speed</div>
            <div className="font-bold text-white tabular-nums text-sm">{speed}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Percentage</div>
            <div className="font-bold text-white tabular-nums text-sm">
              {isPlaylist ?
                `${playlistPercent.toFixed(0)}%` :
                `${filePercent.toFixed(0)}%`
              }
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">
              {isPlaylist ? 'Playlist' : 'Progress'}
            </div>
            <div className="font-bold text-white tabular-nums text-sm">
              {isPlaylist ?
                `${currentItem}/${totalItems}` :
                `${filePercent.toFixed(0)}%`
              }
            </div>
          </div>
        </div>
      )}

      {/* Main Progress Bar - General Progress (Moved to bottom) */}
      {status === 'downloading' && (
        <div className="relative h-2.5 bg-gray-800/30 rounded-full overflow-hidden mb-1 border border-white/5">
          <div className="absolute inset-0 bg-linear-to-r from-emerald-500/10 via-emerald-400/10 to-emerald-500/10 opacity-30" />
          <div
            className={`absolute left-0 top-0 h-full ${bg} transition-all duration-300 ease-out`}
            style={{
              width: `${displayPercent}%`,
              background: 'linear-gradient(90deg, #50C878, #45b069)'
            }}
          />
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
