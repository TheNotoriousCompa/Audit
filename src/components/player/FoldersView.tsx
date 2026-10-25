"use client";
import React, { useMemo, useState } from 'react';
import { FolderOpen, FolderPlus, X, Play, Shuffle, ListPlus, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import type { Track } from '@/types/electron';
import TrackRow, { PlaylistRef } from './TrackRow';

interface Props {
  roots: string[];
  tracks: Track[];
  scanning: boolean;
  playlists: PlaylistRef[];
  onAddRoot: () => void;
  onRemoveRoot: (root: string) => void;
  onScanAll: () => void;
  onPlayTracks: (list: Track[]) => void;
  onPlayShuffled: (list: Track[]) => void;
  onEnqueueTracks: (list: Track[]) => void;
  onPlay: (track: Track, context: Track[]) => void;
  onPlayNext: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onEditTags: (track: Track) => void;
}

function shortDir(p: string): string {
  const parts = p.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

export default function FoldersView({
  roots, tracks, scanning, playlists,
  onAddRoot, onRemoveRoot, onScanAll,
  onPlayTracks, onPlayShuffled, onEnqueueTracks,
  onPlay, onPlayNext, onAddToQueue, onAddToPlaylist, onEditTags,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const folders = useMemo(() => {
    const m = new Map<string, { dir: string; items: Track[] }>();
    for (const t of tracks) {
      const dir = t.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      const entry = m.get(dir) || { dir, items: [] as Track[] };
      entry.items.push(t);
      m.set(dir, entry);
    }
    return [...m.values()].sort((a, b) => a.dir.localeCompare(b.dir));
  }, [tracks]);

  const toggle = (dir: string) => setExpanded((e) => ({ ...e, [dir]: !e[dir] }));

  return (
    <div className="w-full glass-inset rounded-xl p-3 sm:p-4 space-y-2">
      <div className="text-sm text-gray-200 font-medium">
        Music Folders <span className="text-gray-500 font-normal">· {roots.length} roots · {tracks.length} songs</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {roots.map((r) => (
          <span key={r} className="flex items-center gap-1 pl-2.5 pr-1 py-1 text-[11px] sm:text-xs bg-black/40 border border-gray-800/60 rounded-lg text-gray-200">
            <FolderOpen className="w-3.5 h-3.5 acc-text" />
            <span className="max-w-40 truncate" title={r}>{shortDir(r)}</span>
            <button onClick={() => onRemoveRoot(r)} title={`Remove ${r}`}
              className="p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <button onClick={onAddRoot} title="Add music folder"
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] sm:text-xs acc-soft-20 acc-hover-40 border acc-border rounded-lg acc-text transition-colors">
          <FolderPlus className="w-3.5 h-3.5" /> Add folder
        </button>
        <button onClick={onScanAll} disabled={scanning || roots.length === 0} title="Scan all folders"
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] sm:text-xs bg-black/40 hover:bg-black border border-gray-800/60 rounded-lg text-gray-200 acc-hover-text transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Scan all'}
        </button>
      </div>

      {roots.length === 0 && (
        <div className="text-[11px] sm:text-xs text-gray-500">
          No music folders yet — add one (tip: your Audit download folder) then scan.
        </div>
      )}

      <div className="rounded-lg border border-gray-800/40 divide-y divide-gray-800/40 max-h-72 overflow-y-auto">
        {folders.map((f) => {
          const open = !!expanded[f.dir];
          return (
            <div key={f.dir}>
              <div className="flex items-center gap-0.5 pr-1">
                <button onClick={() => toggle(f.dir)} className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-2 text-left">
                  {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-xs sm:text-sm text-gray-100 truncate" title={f.dir}>{shortDir(f.dir)}</span>
                    <span className="block text-[10px] text-gray-600 truncate" title={f.dir}>{f.dir}</span>
                  </span>
                  <span className="text-[11px] text-gray-500 tabular-nums shrink-0 ml-1">{f.items.length}</span>
                </button>
                <button onClick={() => onPlayTracks(f.items)} title="Play folder"
                  className="p-1.5 rounded-lg text-gray-300 acc-hover-text transition-colors">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={() => onPlayShuffled(f.items)} title="Shuffle folder"
                  className="p-1.5 rounded-lg text-gray-400 acc-hover-text transition-colors">
                  <Shuffle className="w-4 h-4" />
                </button>
                <button onClick={() => onEnqueueTracks(f.items)} title="Enqueue folder"
                  className="p-1.5 rounded-lg text-gray-400 acc-hover-text transition-colors">
                  <ListPlus className="w-4 h-4" />
                </button>
              </div>
              {open && (
                <div className="border-t border-gray-800/40 divide-y divide-gray-800/30">
                  {f.items.map((t) => (
                    <TrackRow key={t.path} track={t} playlists={playlists}
                      onPlay={() => onPlay(t, f.items)}
                      onPlayNext={() => onPlayNext(t)}
                      onAddToQueue={() => onAddToQueue(t)}
                      onAddToPlaylist={(id) => onAddToPlaylist(id, t)}
                      onEditTags={() => onEditTags(t)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {folders.length === 0 && roots.length > 0 && (
          <div className="p-4 text-center text-xs text-gray-500">No tracks — hit Scan all.</div>
        )}
      </div>
    </div>
  );
}
