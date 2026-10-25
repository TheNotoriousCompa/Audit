"use client";
import React, { useState } from 'react';
import { ListMusic, Play, Plus, Trash2, X, Save } from 'lucide-react';
import type { Track } from '@/types/electron';
import { Playlist, resolvePlaylist } from './playlists';

interface Props {
  playlists: Playlist[];
  tracks: Track[];
  queue: Track[];
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onPlay: (playlist: Playlist) => void;
  onAppendQueue: (id: string) => void;
  onSaveQueue: (name: string) => void;
  onRemoveTrack: (playlistId: string, path: string) => void;
}

export default function PlaylistsPanel({
  playlists, tracks, queue, onCreate, onDelete, onPlay, onAppendQueue, onSaveQueue, onRemoveTrack,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const submitCreate = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName('');
  };

  return (
    <div className="w-full glass-inset rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2 text-gray-200 text-sm font-medium">
        <ListMusic className="w-4 h-4" />
        Playlists
        <span className="text-gray-500 font-normal">· {playlists.length}</span>
      </div>

      <div className="flex gap-1.5 mb-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); }}
          placeholder="New playlist name…"
          className="flex-1 px-3 py-1.5 text-xs sm:text-sm bg-black/30 border border-gray-800/50 rounded-xl outline-none text-gray-100 placeholder-gray-500 acc-focus" />
        <button onClick={submitCreate} disabled={!newName.trim()} title="Create playlist"
          className="px-3 py-1.5 text-xs sm:text-sm acc-soft-30 acc-hover-50 border acc-border rounded-xl acc-text transition-colors disabled:opacity-40">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={() => { if (queue.length > 0) onSaveQueue(`Queue ${new Date().toLocaleString()}`); }}
          disabled={queue.length === 0} title="Save current queue as playlist"
          className="px-3 py-1.5 text-xs sm:text-sm bg-black/30 hover:bg-black border border-gray-800/50 rounded-xl text-gray-200 acc-hover-text transition-colors disabled:opacity-40">
          <Save className="w-4 h-4" />
        </button>
      </div>

      {playlists.length === 0 && (
        <div className="text-[11px] sm:text-xs text-gray-500">
          No playlists yet. Create one, or save the current queue (scaletta) with the save button.
        </div>
      )}

      <div className="space-y-1.5">
        {playlists.map((pl) => {
          const resolved = resolvePlaylist(pl, tracks);
          const missing = pl.paths.length - resolved.length;
          const expanded = openId === pl.id;
          return (
            <div key={pl.id} className="border border-gray-800/40 rounded-lg">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button onClick={() => setOpenId(expanded ? null : pl.id)}
                  className="flex-1 min-w-0 text-left text-xs sm:text-sm text-gray-100 acc-hover-text truncate transition-colors">
                  {pl.name}
                  <span className="text-gray-500"> · {resolved.length}{missing > 0 ? ` (+${missing} missing)` : ''}</span>
                </button>
                <button onClick={() => onPlay(pl)} title="Play playlist" disabled={resolved.length === 0}
                  className="p-1.5 rounded-lg text-gray-200 acc-hover-text transition-colors disabled:opacity-30">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={() => onAppendQueue(pl.id)} title="Append current queue to this playlist" disabled={queue.length === 0}
                  className="p-1.5 rounded-lg text-gray-300 acc-hover-text transition-colors disabled:opacity-30">
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => onDelete(pl.id)} title="Delete playlist"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {expanded && (
                <div className="border-t border-gray-800/40 divide-y divide-gray-800/30 max-h-40 overflow-y-auto">
                  {resolved.length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-gray-500">Empty — append the queue or play tracks first.</div>
                  )}
                  {resolved.map((t) => (
                    <div key={t.path} className="flex items-center gap-2 px-3 py-1">
                      <span className="flex-1 min-w-0 text-[11px] sm:text-xs text-gray-300 truncate">
                        {t.artist ? `${t.artist} — ` : ''}{t.title}
                      </span>
                      <button onClick={() => onRemoveTrack(pl.id, t.path)} title="Remove from playlist"
                        className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
