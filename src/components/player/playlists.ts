// Named playlists + queue helpers (renderer-only, localStorage).
// A playlist stores absolute file paths in order; tracks are resolved
// against the current library scan so missing files are skipped.

import type { Track } from '@/types/electron';

export interface Playlist {
  id: string;
  name: string;
  paths: string[];
  createdAt: number;
}

const STORE_KEY = 'audit-playlists-v1';

function uid(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Partial<Playlist>[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => p && typeof p.name === 'string' && Array.isArray(p.paths))
      .map((p) => ({
        id: typeof p.id === 'string' ? p.id : uid(),
        name: p.name as string,
        paths: (p.paths as unknown[]).filter((x) => typeof x === 'string') as string[],
        createdAt: Number(p.createdAt) || 0,
      }));
  } catch {
    return [];
  }
}

export function savePlaylists(playlists: Playlist[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(playlists));
  } catch {
    // persistence unavailable: playlists still work for this session
  }
}

export function createPlaylist(name: string, paths: string[] = []): Playlist {
  return { id: uid(), name: name.trim() || 'Untitled', paths: [...paths], createdAt: Date.now() };
}

/** Resolve a playlist to existing tracks, preserving order. */
export function resolvePlaylist(pl: Playlist, tracks: Track[]): Track[] {
  const byPath = new Map(tracks.map((t) => [t.path, t]));
  const out: Track[] = [];
  for (const p of pl.paths) {
    const t = byPath.get(p);
    if (t) out.push(t);
  }
  return out;
}

/** Which root a track belongs to (longest prefix match), or null. */
export function trackRoot(trackPath: string, roots: string[]): string | null {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const tp = norm(trackPath);
  let best: string | null = null;
  for (const r of roots) {
    const rp = norm(r);
    if ((tp === rp || tp.startsWith(rp + '/')) && (!best || rp.length > norm(best).length)) {
      best = r;
    }
  }
  return best;
}
