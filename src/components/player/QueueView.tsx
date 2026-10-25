"use client";
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, X, ListX, Save } from 'lucide-react';
import type { Track } from '@/types/electron';
import { fmtDur } from './TrackRow';

interface Props {
  queue: Track[];
  queueIndex: number;
  onJump: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onSave: () => void;
}

const OVERSCAN = 8;
const DEFAULT_ROW_H = 32;

export default function QueueView({ queue, queueIndex, onJump, onMove, onRemove, onClear, onSave }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(224);
  const [rowH, setRowH] = useState(DEFAULT_ROW_H);

  // A 1400-track queue used to create ~10k DOM nodes and forced layout of
  // every row when the player opened (~500ms). Only the visible window is
  // rendered now.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      setViewportH(el.clientHeight || 224);
      const first = el.querySelector<HTMLElement>('[data-queue-row]');
      if (first) {
        const h = first.getBoundingClientRect().height;
        if (h > 8) setRowH(h);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [queue.length]);

  if (queue.length === 0) {
    return (
      <div className="w-full bg-black/30 border border-gray-800/50 rounded-xl p-4 text-center text-xs sm:text-sm text-gray-500">
        Queue is empty — play a track or add some with ＋.
      </div>
    );
  }

  const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const end = Math.min(queue.length, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN);
  const visible = queue.slice(start, end);

  return (
    <div className="w-full glass-inset rounded-xl p-2 sm:p-3">
      <div className="flex items-center gap-2 px-1 pb-2 text-sm text-gray-200 font-medium">
        Up next
        <span className="text-gray-500 font-normal">· {queue.length}</span>
        <span className="flex-1" />
        <button onClick={onSave} title="Save queue as playlist"
          className="flex items-center gap-1 px-2 py-1 text-[11px] bg-black/30 border border-gray-800/50 rounded-lg text-gray-300 acc-hover-text transition-colors">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        <button onClick={onClear} title="Clear queue"
          className="flex items-center gap-1 px-2 py-1 text-[11px] bg-black/30 border border-gray-800/50 rounded-lg text-gray-300 hover:text-red-400 transition-colors">
          <ListX className="w-3.5 h-3.5" /> Clear
        </button>
      </div>
      <div
        ref={listRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="max-h-56 overflow-y-auto rounded-lg border border-gray-800/40"
      >
        <div style={{ height: queue.length * rowH, position: 'relative' }}>
          <div style={{ transform: `translateY(${start * rowH}px)` }}>
            {visible.map((t, vi) => {
              const i = start + vi;
              return (
                <div key={`${t.path}-${i}`} data-queue-row className={`flex items-center gap-0.5 pr-1 border-b border-gray-800/30 last:border-b-0 ${i === queueIndex ? 'acc-soft-20' : ''}`}>
                  <button onClick={() => onJump(i)} className="flex-1 min-w-0 text-left px-2 py-1.5">
                    <span className="block text-xs sm:text-sm text-gray-100 truncate">
                      <span className="text-gray-500 tabular-nums mr-1.5">{i + 1}.</span>
                      {t.artist ? `${t.artist} — ` : ''}{t.title}
                    </span>
                  </button>
                  <span className="text-[11px] text-gray-500 tabular-nums shrink-0 mr-1">{fmtDur(t.duration)}</span>
                  <button onClick={() => onMove(i, -1)} disabled={i === 0} title="Move up"
                    className="p-1 rounded text-gray-500 acc-hover-text disabled:opacity-20 transition-colors">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onMove(i, 1)} disabled={i === queue.length - 1} title="Move down"
                    className="p-1 rounded text-gray-500 acc-hover-text disabled:opacity-20 transition-colors">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onRemove(i)} title="Remove from queue"
                    className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
