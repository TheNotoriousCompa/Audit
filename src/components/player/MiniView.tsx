"use client";
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize2, X, Volume2 } from 'lucide-react';
import type { PlayerMiniState } from '@/types/electron';
import DiskPlaceholder from './DiskPlaceholder';

// Spotify DESIGN.md tokens: #121212 base, #ffffff title 700, #b3b3b3
// secondary, functional green #1ed760 (play only), circular 50% play,
// pill progress, 6px art radius, heavy shadow for elevation.

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Marquee({ text, className }: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    setOverflow(inner.scrollWidth > wrap.clientWidth + 4);
  }, [text]);

  if (!overflow) {
    return (
      <div ref={wrapRef} className={`overflow-hidden whitespace-nowrap ${className || ''}`}>
        <span ref={innerRef}>{text}</span>
      </div>
    );
  }
  return (
    <div ref={wrapRef} className={`overflow-hidden whitespace-nowrap ${className || ''}`}>
      <span ref={innerRef} className="mini-marquee">
        {text}
        <span className="mx-8 inline-block">•</span>
        {text}
        <span className="mx-8 inline-block">•</span>
      </span>
    </div>
  );
}

// Floating always-on-top mini player.
// Remote-controls the main window: audio keeps playing there.
export default function MiniView() {
  const [state, setState] = useState<PlayerMiniState | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    api?.onPlayerState?.((s) => setState(s));
  }, []);

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const pct = state && state.dur > 0 ? Math.min(100, (state.pos / state.dur) * 100) : 0;

  const seekFromClick = (e: React.MouseEvent) => {
    const bar = barRef.current;
    if (!bar || !state || state.dur <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    api?.miniControl?.({ type: 'seek', pos: ratio * state.dur });
  };

  return (
    <div
      className="w-screen h-screen text-gray-100 flex flex-col select-none overflow-hidden rounded-xl"
      style={{
        WebkitAppRegion: 'drag',
        backgroundColor: '#121212',
        boxShadow: 'rgba(0,0,0,0.5) 0px 8px 24px',
        '--audit-accent': state?.accent || '#50C878',
      } as React.CSSProperties}>
      <div className="relative flex flex-col items-center px-8 pt-1.5">
        <div className="absolute top-1 right-1 flex gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => api?.expandApp?.()} title="Back to Audit"
            className="p-1 rounded-full transition-colors hover:text-white" style={{ color: '#b3b3b3' }}>
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => api?.closeMini?.()} title="Close mini player (music keeps playing)"
            className="p-1 rounded-full transition-colors hover:text-white" style={{ color: '#b3b3b3' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div
          className="w-10 h-10 shrink-0 overflow-hidden bg-black/60 flex items-center justify-center"
          style={{ borderRadius: 6 }}>
          {state?.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.art} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <DiskPlaceholder className="w-full h-full" spinning={!!state?.playing} />
          )}
        </div>
        <div className="w-full min-w-0 text-center mt-1">
          <Marquee
            text={state?.title || 'Audit Mini Player'}
            className="text-sm font-bold text-white"
          />
          <Marquee
            text={state?.artist || (state ? '—' : 'waiting for playback…')}
            className="text-xs"
          />
        </div>
        <div className="w-full flex items-center gap-1.5 mt-1">
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: '#b3b3b3' }}>{fmt(state?.pos || 0)}</span>
          <div
            ref={barRef}
            onClick={seekFromClick}
            title="Seek"
            className="flex-1 h-1 overflow-hidden cursor-pointer"
            style={{
              WebkitAppRegion: 'no-drag',
              borderRadius: 9999,
              backgroundColor: '#4d4d4d',
            } as React.CSSProperties}>
            <div className="h-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: 'var(--audit-accent)' }} />
          </div>
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: '#b3b3b3' }}>{fmt(state?.dur || 0)}</span>
        </div>
      </div>
      <div className="group flex items-center justify-center gap-2.5 pb-2 pt-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: '#b3b3b3' }}>{fmt(state?.pos || 0)}</span>
        <button onClick={() => api?.miniControl?.('prev')} title="Previous"
          className="p-1.5 rounded-full transition-colors hover:text-white" style={{ color: '#b3b3b3' }}>
          <SkipBack className="w-4 h-4" fill="currentColor" />
        </button>
        <button onClick={() => api?.miniControl?.('toggle')} title={state?.playing ? 'Pause' : 'Play'}
          className="p-2.5 transition-transform hover:scale-105"
          style={{ borderRadius: '50%', backgroundColor: 'var(--audit-accent)', color: '#000000' }}>
          {state?.playing ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
        </button>
        <button onClick={() => api?.miniControl?.('next')} title="Next"
          className="p-1.5 rounded-full transition-colors hover:text-white" style={{ color: '#b3b3b3' }}>
          <SkipForward className="w-4 h-4" fill="currentColor" />
        </button>
        <span className="text-[10px] tabular-nums w-8" style={{ color: '#b3b3b3' }}>{fmt(state?.dur || 0)}</span>
        <span className="flex items-center gap-1 overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[76px]" title="Volume">
          <Volume2 className="w-3.5 h-3.5" style={{ color: '#b3b3b3' }} />
          <input type="range" min={0} max={1} step={0.01} value={state?.vol ?? 0.9}
            onChange={(e) => api?.miniControl?.({ type: 'volume', vol: Number(e.target.value) })}
            className="w-14 h-1 cursor-pointer mini-vol" />
        </span>
      </div>
    </div>
  );
}
