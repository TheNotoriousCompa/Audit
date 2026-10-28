"use client";
import React from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { Track } from '@/types/electron';
import { useArt } from './useArt';
import Visualizer from './Visualizer';
import DiskPlaceholder from './DiskPlaceholder';

interface Props {
  track: Track | undefined;
  queuePosition: string;
  lineColor: string;
  playing: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function NowPlaying({
  track, queuePosition, lineColor, playing, onToggle, onPrev, onNext,
}: Props) {
  const art = useArt(track?.path);

  return (
    <div className="w-full glass-inset rounded-xl p-2.5">
      <div className="flex items-center gap-2.5">
        <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center">
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} alt="Album art" className="w-full h-full object-cover" />
          ) : (
            <DiskPlaceholder className="w-full h-full" spinning={playing} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 tabular-nums">{queuePosition || '—'}</div>
          <div className="text-sm font-semibold text-gray-100 truncate">
            {track?.title || 'Nothing playing'}
          </div>
          <div className="text-[11px] acc-text truncate">{track?.artist || '—'}</div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onPrev} title="Previous" disabled={!track}
            className="p-1 rounded-lg text-gray-300 acc-hover-text transition-colors disabled:opacity-30">
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggle} title={playing ? 'Pause' : 'Play'} disabled={!track}
            className="p-1.5 rounded-full acc-soft-40 acc-hover-60 border acc-border text-white transition-colors disabled:opacity-30">
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onNext} title="Next" disabled={!track}
            className="p-1 rounded-lg text-gray-300 acc-hover-text transition-colors disabled:opacity-30">
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2">
        <Visualizer lineColor={lineColor} height={36} />
      </div>
    </div>
  );
}
