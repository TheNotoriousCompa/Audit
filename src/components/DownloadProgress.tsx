import React, { useEffect, useState } from 'react';
import { Download, Music, AlertCircle, CheckCircle2, FileAudio, Folder } from 'lucide-react';
import type { DownloadProgress as DownloadProgressType } from '@/types/electron';

interface DownloadProgressProps {
  progress?: DownloadProgressType;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 truncate">{label}</div>
      <div className={`text-sm font-semibold tabular-nums truncate ${accent ? 'acc-text' : 'text-gray-100'}`}>
        {value}
      </div>
    </div>
  );
}

const DownloadProgressComponent: React.FC<DownloadProgressProps> = ({ progress }) => {
  const [internalProgress, setInternalProgress] = useState(progress);

  useEffect(() => {
    setInternalProgress(progress);
  }, [progress]);

  if (!internalProgress || (internalProgress.status === 'ready' && internalProgress.percentage === 0 && !internalProgress.message)) return null;

  const isPlaylist = internalProgress.isPlaylist;
  const status = internalProgress.status || 'starting';
  const speed = internalProgress.speed_str || internalProgress._speed_str || '0 B/s';

  const filePercent = Math.min(100, Math.max(0, internalProgress.file_percent || 0));
  const playlistPercent = Math.min(100, Math.max(0, internalProgress.playlist_percent || 0));
  const displayPercent = isPlaylist ? playlistPercent : filePercent;

  const currentFile = internalProgress.filename || internalProgress.currentFile || '';
  const playlistName = internalProgress.playlistName;
  const currentItem = Math.max(1, internalProgress.currentItem || 0);
  const totalItems = Math.max(1, internalProgress.totalItems || 0);

  // One accent for everything in progress; red stays semantic for failures.
  const failed = status === 'error';
  const done = status === 'finished';
  const StatusIcon = failed ? AlertCircle : done ? CheckCircle2 : status === 'converting' ? Music : Download;
  const iconClass = failed
    ? 'text-red-400 bg-red-500/10 border-red-500/30'
    : 'acc-text acc-soft-20 acc-border';

  const title = done
    ? 'Download complete'
    : failed
      ? 'Download failed'
      : status === 'cancelled'
        ? 'Download cancelled'
        : status === 'info'
          ? internalProgress.message || 'Processing…'
          : isPlaylist
            ? 'Downloading playlist'
            : 'Downloading';

  return (
    <div className="w-full glass-inset rounded-xl p-4">
      {/* Header: icon + title + overall percentage (fills the card width) */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconClass}`}>
          <StatusIcon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
            <span className="text-lg font-semibold acc-text tabular-nums shrink-0">
              {Math.round(displayPercent)}%
            </span>
          </div>

          {isPlaylist && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400 min-w-0">
              <Folder className="w-3 h-3 shrink-0" />
              <span className="truncate">{playlistName || 'Playlist'}</span>
              {status === 'downloading' && totalItems > 1 && (
                <>
                  <span className="text-gray-600 shrink-0">·</span>
                  <span className="tabular-nums shrink-0">{currentItem}/{totalItems}</span>
                </>
              )}
            </div>
          )}

          {currentFile && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500 min-w-0">
              <FileAudio className="w-3 h-3 shrink-0" />
              <span className="truncate">{currentFile.replace(/\.(webm|m4a|webp)$/, '.mp3')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Current file bar (thin) */}
      {status === 'downloading' && currentFile && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            <span>{isPlaylist ? 'Current track' : 'Progress'}</span>
            <span className="acc-text tabular-nums">{filePercent.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full acc-bg transition-all duration-300" style={{ width: `${filePercent}%` }} />
          </div>
        </div>
      )}

      {/* Stats: one row, dividers instead of boxes */}
      {status === 'downloading' && (
        <div className="mt-3 grid grid-cols-3 divide-x divide-white/5 rounded-lg border border-white/5">
          <Stat label="Speed" value={speed} />
          <Stat label={isPlaylist ? 'Playlist' : 'Progress'} value={`${Math.round(displayPercent)}%`} accent />
          <Stat label={isPlaylist ? 'Track' : 'Done'} value={isPlaylist ? `${currentItem}/${totalItems}` : `${filePercent.toFixed(0)}%`} />
        </div>
      )}

      {/* Overall bar (playlist) or main bar (single file) */}
      {status === 'downloading' && (
        <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: `${displayPercent}%`,
              background: 'linear-gradient(90deg, var(--audit-accent), color-mix(in srgb, var(--audit-accent) 80%, black))'
            }}
          />
        </div>
      )}

      {internalProgress.message && failed && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{internalProgress.message}</span>
        </div>
      )}
    </div>
  );
};

export default DownloadProgressComponent;
