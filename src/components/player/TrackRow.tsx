"use client";
import React, { useEffect, useRef, useState } from 'react';
import { FileMusic, Mic, MoreVertical, Play, ListPlus, ListVideo, ListPlus as QueueNext, Pencil } from 'lucide-react';
import type { Track } from '@/types/electron';

export interface PlaylistRef {
  id: string;
  name: string;
}

interface Props {
  track: Track;
  active?: boolean;
  playlists: PlaylistRef[];
  onPlay: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onAddToPlaylist: (playlistId: string) => void;
  onEditTags?: () => void;
  trailing?: React.ReactNode;
}

export function fmtDur(sec: number): string {
  if (!sec || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrackRow({
  track, active, playlists, onPlay, onPlayNext, onAddToQueue, onAddToPlaylist, onEditTags, trailing,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [pickPl, setPickPl] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false);
        setPickPl(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const item =
    'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs sm:text-sm text-gray-200 hover:bg-white/5 transition-colors';

  return (
    <div className={`cv-row relative flex items-center gap-1 pr-1 ${active ? 'acc-soft-20' : ''}`} style={{ containIntrinsicSize: 'auto 44px' }}>
      <button onClick={onPlay} className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left">
        <FileMusic className={`w-4 h-4 shrink-0 ${active ? 'acc-text' : 'text-gray-500'}`} />
        <span className="flex-1 min-w-0">
          <span className="block text-xs sm:text-sm text-gray-100 truncate">{track.title}</span>
          <span className="block text-[11px] text-gray-500 truncate">
            {[track.artist, track.album].filter(Boolean).join(' · ') || track.filename}
          </span>
        </span>
        {track.lrc && <Mic className="w-3.5 h-3.5 shrink-0 text-gray-600" />}
        <span className="text-[11px] text-gray-500 tabular-nums shrink-0">{fmtDur(track.duration)}</span>
      </button>
      {trailing}
      <div className="relative shrink-0" ref={menuRef}>
        <button onClick={() => { setMenu((m) => !m); setPickPl(false); }} title="Track actions"
          className="p-1.5 rounded-lg text-gray-400 acc-hover-text transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
        {menu && (
          <div className="absolute right-0 top-full mt-1 w-48 z-30 bg-zinc-900 border border-gray-700/60 rounded-xl shadow-2xl overflow-hidden">
            <button className={item} onClick={() => { setMenu(false); onPlay(); }}>
              <Play className="w-3.5 h-3.5 acc-text" /> Play
            </button>
            <button className={item} onClick={() => { setMenu(false); onPlayNext(); }}>
              <QueueNext className="w-3.5 h-3.5 text-gray-400" /> Play next
            </button>
            <button className={item} onClick={() => { setMenu(false); onAddToQueue(); }}>
              <ListPlus className="w-3.5 h-3.5 text-gray-400" /> Add to queue
            </button>
            <button className={item} onClick={() => setPickPl((p) => !p)}>
              <ListVideo className="w-3.5 h-3.5 text-gray-400" /> Add to playlist ▸
            </button>
            {onEditTags && (
              <button className={item} onClick={() => { setMenu(false); onEditTags(); }}>
                <Pencil className="w-3.5 h-3.5 text-gray-400" /> Edit tags
              </button>
            )}
            {pickPl && (
              <div className="border-t border-gray-700/60 max-h-32 overflow-y-auto">
                {playlists.length === 0 && (
                  <div className="px-3 py-1.5 text-[11px] text-gray-500">No playlists — create one in the Playlists tab.</div>
                )}
                {playlists.map((p) => (
                  <button key={p.id} className={`${item} pl-5`} onClick={() => { setMenu(false); onAddToPlaylist(p.id); }}>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
