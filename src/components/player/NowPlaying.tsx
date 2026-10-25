"use client";
import React from 'react';
import { Star, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { Track } from '@/types/electron';
import { useArt } from './useArt';
import Visualizer from './Visualizer';
import DiskPlaceholder from './DiskPlaceholder';

interface Props {
  track: Track | undefined;
  queuePosition: string;
  rating: number;
  onRate: (stars: number) => void;
  lineColor: string;
  playing: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function NowPlaying({
  track, queuePosition, rating, onRate, lineColor, playing, onToggle, onPrev, onNext,
}: Props) {
  const art = useArt(track?.path);

  return (
    <div className="w-full glass-inset rounded-xl p-2.5 sm:p-3">
      <div className="flex gap-2.5">
        <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg overflow-hidden bg-black/50 border border-gray-800/50 flex items-center justify-center">
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} alt="Album art" className="w-full h-full object-cover" />
          ) : (
            <DiskPlaceholder className="w-full h-full" spinning={playing} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 tabular-nums">{queuePosition}</div>
          <div className="text-sm sm:text-base font-semibold text-gray-100 truncate">
            {track?.title || 'Nothing playing'}
          </div>
          <div className="text-xs acc-text truncate">{track?.artist || '—'}</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-0.5" title="Rating">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => track && onRate(rating === s ? 0 : s)}
                  className="p-0.5 transition-colors" title={`${s} star${s > 1 ? 's' : ''}`}>
                  <Star className={`w-3.5 h-3.5 ${s <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}`} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={onPrev} title="Previous" disabled={!track}
                className="p-1.5 rounded-lg text-gray-300 acc-hover-text transition-colors disabled:opacity-30">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={onToggle} title={playing ? 'Pause' : 'Play'} disabled={!track}
                className="p-1.5 rounded-full acc-soft-40 acc-hover-60 border acc-border text-white transition-colors disabled:opacity-30">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button onClick={onNext} title="Next" disabled={!track}
                className="p-1.5 rounded-lg text-gray-300 acc-hover-text transition-colors disabled:opacity-30">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2">
        <Visualizer lineColor={lineColor} height={44} />
      </div>
    </div>
  );
}
