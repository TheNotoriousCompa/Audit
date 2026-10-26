"use client";
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize2, X, Volume2 } from 'lucide-react';
import type { PlayerMiniState } from '@/types/electron';
import DiskPlaceholder from './DiskPlaceholder';

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

  return (
    <div ref={wrapRef} className={`overflow-hidden whitespace-nowrap ${className || ''}`}>
      <span ref={innerRef} className={overflow ? 'mini-marquee' : undefined}>
        {text}
        {overflow && (
          <>
            <span className="mx-8 inline-block">•</span>
            {text}
            <span className="mx-8 inline-block">•</span>
          </>
        )}
      </span>
    </div>
  );
}

// Floating mini player: remote-controls the main window, audio keeps playing there.
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

  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  return (
    <div
      className="w-screen h-screen flex flex-col select-none overflow-hidden rounded-xl border border-white/10 text-gray-100"
      style={{
        WebkitAppRegion: 'drag',
        backgroundColor: 'rgba(14, 14, 17, 0.94)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
        '--audit-accent': state?.accent || '#50C878',
      } as React.CSSProperties}
    >
      {/* Artwork + title + window actions */}
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <div className="w-11 h-11 shrink-0 overflow-hidden rounded-lg bg-black/50 ring-1 ring-white/10 flex items-center justify-center">
          {state?.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.art} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <DiskPlaceholder className="w-full h-full" spinning={!!state?.playing} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <Marquee text={state?.title || 'Audit'} className="text-[12px] font-semibold text-white" />
          <Marquee
            text={state?.artist || (state ? '—' : 'waiting for playback…')}
            className="text-[10px] text-gray-400"
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0" style={noDrag}>
          <button
            onClick={() => api?.expandApp?.()}
            title="Back to Audit"
            className="p-1 rounded-lg text-gray-500 hover:text-white transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => api?.closeMini?.()}
            title="Close mini player"
            className="p-1 rounded-lg text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Seek bar + times */}
      <div className="px-3 mt-2" style={noDrag}>
        <div
          ref={barRef}
          onClick={seekFromClick}
          title="Seek"
          className="h-1 rounded-full cursor-pointer overflow-hidden bg-white/10"
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, backgroundColor: 'var(--audit-accent)' }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-gray-500 tabular-nums">
          <span>{fmt(state?.pos || 0)}</span>
          <span>{fmt(state?.dur || 0)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="group mt-auto flex items-center justify-center gap-2.5 px-3 pb-2.5" style={noDrag}>
        <button
          onClick={() => api?.miniControl?.('prev')}
          title="Previous"
          className="p-1.5 rounded-full text-gray-400 hover:text-white transition-colors"
        >
          <SkipBack className="w-4 h-4" fill="currentColor" />
        </button>

        <button
          onClick={() => api?.miniControl?.('toggle')}
          title={state?.playing ? 'Pause' : 'Play'}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-105"
          style={{ backgroundColor: 'var(--audit-accent)', color: '#0b0b0d' }}
        >
          {state?.playing ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
        </button>

        <button
          onClick={() => api?.miniControl?.('next')}
          title="Next"
          className="p-1.5 rounded-full text-gray-400 hover:text-white transition-colors"
        >
          <SkipForward className="w-4 h-4" fill="currentColor" />
        </button>

        <span
          className="flex items-center gap-1 overflow-hidden whitespace-nowrap transition-all duration-300 opacity-0 max-w-0 hover:opacity-100 group-hover:opacity-100 group-hover:max-w-[64px]"
          title="Volume"
        >
          <Volume2 className="w-3.5 h-3.5 text-gray-500" />
          <input
            type="range" min={0} max={1} step={0.01} value={state?.vol ?? 0.9}
            onChange={(e) => api?.miniControl?.({ type: 'volume', vol: Number(e.target.value) })}
            className="w-12 h-1 cursor-pointer mini-vol"
          />
        </span>
      </div>
    </div>
  );
}
