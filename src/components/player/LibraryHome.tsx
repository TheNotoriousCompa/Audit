"use client";
import React, { useMemo, useState } from 'react';
import { Search, ChevronLeft, Music2, Users, Disc3, Tags, Clock, Star } from 'lucide-react';
import type { Track } from '@/types/electron';
import TrackRow, { PlaylistRef } from './TrackRow';

export type CategoryKind = 'all' | 'artists' | 'albums' | 'genres' | 'recent' | 'top';

interface Props {
  tracks: Track[];
  ratings: Record<string, number>;
  playlists: PlaylistRef[];
  onPlay: (track: Track, context: Track[]) => void;
  onPlayNext: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onEditTags: (track: Track) => void;
}

function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+-\s+topic\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupBy(tracks: Track[], key: (t: Track) => string): { name: string; items: Track[] }[] {
  const m = new Map<string, { name: string; items: Track[] }>();
  const counts = new Map<string, Map<string, number>>();
  for (const t of tracks) {
    const raw = (key(t) || 'Unknown').trim() || 'Unknown';
    const k = normKey(raw) || 'unknown';
    let g = m.get(k);
    if (!g) {
      g = { name: raw, items: [] };
      m.set(k, g);
      counts.set(k, new Map());
    }
    g.items.push(t);
    const cm = counts.get(k)!;
    cm.set(raw, (cm.get(raw) || 0) + 1);
    // Display the most common original spelling.
    let best = g.name;
    let bestN = -1;
    for (const [spelling, n] of cm) {
      if (n > bestN) {
        best = spelling;
        bestN = n;
      }
    }
    g.name = best;
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function LibraryHome({
  tracks, ratings, playlists, onPlay, onPlayNext, onAddToQueue, onAddToPlaylist, onEditTags,
}: Props) {
  const [cat, setCat] = useState<CategoryKind | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const tiles = useMemo(() => {
    const artists = new Set(tracks.map((t) => normKey(t.artist || 'Unknown'))).size;
    const albums = new Set(tracks.map((t) => normKey(t.album || 'Unknown'))).size;
    const genres = new Set(
      tracks.map((t) => (t.genre_guess || '').trim()).filter((g) => g.length > 0)
    ).size;
    const top = tracks.filter((t) => (ratings[t.path] || 0) >= 4).length;
    return [
      { kind: 'all' as CategoryKind, label: 'All Songs', count: tracks.length, Icon: Music2 },
      { kind: 'artists' as CategoryKind, label: 'Artists', count: artists, Icon: Users },
      { kind: 'albums' as CategoryKind, label: 'Albums', count: albums, Icon: Disc3 },
      { kind: 'genres' as CategoryKind, label: 'Genres', count: genres, Icon: Tags },
      { kind: 'recent' as CategoryKind, label: 'Recently Added', count: Math.min(50, tracks.length), Icon: Clock },
      { kind: 'top' as CategoryKind, label: 'Top Rated', count: top, Icon: Star },
    ];
  }, [tracks, ratings]);

  const groups = useMemo(() => {
    if (!cat) return null;
    if (cat === 'artists') return groupBy(tracks, (t) => t.artist);
    if (cat === 'albums') return groupBy(tracks, (t) => t.album);
    if (cat === 'genres') return groupBy(tracks, (t) => t.genre_guess || t.genre);
    return null;
  }, [cat, tracks]);

  const list: Track[] = useMemo(() => {
    if (!cat) return [];
    const q = filter.trim().toLowerCase();
    const match = (t: Track) =>
      !q || `${t.title} ${t.artist} ${t.album} ${t.genre} ${t.genre_guess} ${t.filename}`.toLowerCase().includes(q);
    if (cat === 'all') return tracks.filter(match);
    if (cat === 'recent') return [...tracks].sort((a, b) => b.mtime - a.mtime).slice(0, 50).filter(match);
    if (cat === 'top') {
      return tracks
        .filter((t) => (ratings[t.path] || 0) > 0 && match(t))
        .sort((a, b) => (ratings[b.path] || 0) - (ratings[a.path] || 0) || a.title.localeCompare(b.title));
    }
    if (group) return (groups?.find((g) => g.name === group)?.items || []).filter(match);
    return [];
  }, [cat, group, groups, tracks, ratings, filter]);

  const open = (kind: CategoryKind) => {
    setCat(kind);
    setGroup(null);
    setFilter('');
  };
  const back = () => {
    if (group) setGroup(null);
    else setCat(null);
  };

  return (
    <div className="w-full glass-inset rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        {(cat) && (
          <button onClick={back} title="Back" className="p-1.5 rounded-lg text-gray-300 acc-hover-text transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className="text-sm text-gray-200 font-medium">
          {!cat ? 'Library' : group || tiles.find((t) => t.kind === cat)?.label}
          <span className="text-gray-500 font-normal"> · {tracks.length} songs</span>
        </div>
      </div>

      {!cat && (
        <div className="grid grid-cols-3 gap-1">
          {tiles.map(({ kind, label, count, Icon }) => (
            <button key={kind} onClick={() => open(kind)}
              className="flex items-center gap-1.5 px-2 py-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 rounded-lg transition-colors text-left">
              <Icon className="w-4 h-4 acc-text shrink-0" />
              <span className="min-w-0">
                <span className="block text-[11px] text-gray-100 truncate">{label}</span>
                <span className="block text-[10px] text-gray-500 tabular-nums">{count}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {cat && !group && groups && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
          {groups.map((g) => (
            <button key={g.name} onClick={() => setGroup(g.name)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5 transition-colors">
              <span className="flex-1 min-w-0 text-xs text-gray-100 truncate">{g.name}</span>
              <span className="text-[10px] text-gray-500 tabular-nums">{g.items.length}</span>
            </button>
          ))}
          {groups.length === 0 && <div className="p-4 text-center text-xs text-gray-500">Empty.</div>}
        </div>
      )}

      {cat && (group || cat === 'all' || cat === 'recent' || cat === 'top') && (
        <>
          <div className="relative my-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search…"
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-black/30 border border-gray-800/50 rounded-xl outline-none text-gray-100 placeholder-gray-500 acc-focus" />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-800/40 divide-y divide-gray-800/40">
            {list.length === 0 && <div className="p-4 text-center text-xs text-gray-500">No matches.</div>}
            {list.map((t) => (
              <TrackRow key={t.path} track={t} playlists={playlists}
                onPlay={() => onPlay(t, list)}
                onPlayNext={() => onPlayNext(t)}
                onAddToQueue={() => onAddToQueue(t)}
                onAddToPlaylist={(id) => onAddToPlaylist(id, t)}
                onEditTags={() => onEditTags(t)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
