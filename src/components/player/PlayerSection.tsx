"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Disc3, Library, FolderOpen, ListMusic, SlidersHorizontal } from 'lucide-react';
import type { Track } from '@/types/electron';
import LibraryHome from './LibraryHome';
import FoldersView from './FoldersView';
import PlayerBar, { TransportControls } from './PlayerBar';
import EqualizerPanel from './EqualizerPanel';
import NowPlaying from './NowPlaying';
import QueueView from './QueueView';
import PlaylistsPanel from './PlaylistsPanel';
import TagEditor from './TagEditor';
import {
  Playlist, loadPlaylists, savePlaylists, createPlaylist, resolvePlaylist,
} from './playlists';

interface Props {
  outputFolder: string | null;
  lineColor: string;
  harvest: { since: number; autoplay: boolean } | null;
  onHarvestDone: () => void;
}

type View = 'player' | 'library' | 'folders' | 'playlists' | 'eq';

const ROOTS_KEY = 'auditLibraryRoots';
const LEGACY_ROOT_KEY = 'auditLibraryRoot';

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function PlayerSectionInner({ outputFolder, lineColor, harvest, onHarvestDone }: Props) {
  const [view, setView] = useState<View>('player');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const transportRef = React.useRef<TransportControls | null>(null);
  const miniArtCache = React.useRef(new Map<string, string | null>());

  useEffect(() => {
    let live = true;
    const boot = async () => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      let fromCache = false;
      // 1. Instant library from disk cache (Poweramp-style: no rescan on launch).
      try {
        const cache = await api?.loadLibraryCache?.();
        if (live && cache && (cache.tracks.length > 0 || cache.roots.length > 0)) {
          setRoots(cache.roots);
          setTracks(cache.tracks);
          fromCache = true;
        }
      } catch {
        // fall through to localStorage roots
      }
      if (!live) return;
      // 2. Fallback: previous localStorage roots (pre-cache versions).
      if (!fromCache) {
        try {
          const raw = localStorage.getItem(ROOTS_KEY);
          if (raw) {
            const arr = JSON.parse(raw) as unknown;
            if (Array.isArray(arr)) {
              setRoots(arr.filter((x): x is string => typeof x === 'string'));
            }
          } else {
            const legacy = localStorage.getItem(LEGACY_ROOT_KEY);
            if (legacy) setRoots([legacy]);
          }
        } catch {
          // start with no roots
        }
      }
      setPlaylists(loadPlaylists());
    };
    void boot();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ROOTS_KEY, JSON.stringify(roots));
    } catch {
      // session-only
    }
  }, [roots]);

  const persistPlaylists = (pls: Playlist[]) => {
    setPlaylists(pls);
    savePlaylists(pls);
  };

  const runScan = useCallback(async (targets: string[]): Promise<{ tracks: Track[]; error: string | null }> => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.scanLibrary) {
      return { tracks: [], error: 'Scanner unavailable — restart the desktop app (dev build was refreshed).' };
    }
    const all: Track[] = [];
    for (const dir of targets) {
      const res = await api.scanLibrary(dir);
      if (!res.success) {
        return { tracks: all, error: res.error || `Scan failed for ${dir}` };
      }
      all.push(...res.tracks);
    }
    return { tracks: all, error: null };
  }, []);

  const handleScan = useCallback(async () => {
    const targets = roots.length > 0 ? roots : outputFolder ? [outputFolder] : [];
    if (targets.length === 0) {
      setScanError('Add a music folder first (Folders tab).');
      return;
    }
    setScanning(true);
    setScanError(null);
    try {
      const { tracks: all, error } = await runScan(targets);
      if (error) setScanError(error);
      setTracks(all);
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      try {
        await api?.saveLibraryCache?.({ version: 1, roots: targets, scannedAt: Date.now(), tracks: all });
      } catch {
        // cache is best-effort
      }
      // Drop queue entries that no longer exist.
      setQueue((q) => {
        const live = new Set(all.map((t) => t.path));
        const next = q.filter((t) => live.has(t.path));
        if (next.length !== q.length) setQueueIndex(-1);
        return next;
      });
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [roots, outputFolder, runScan]);

  // Seamless download -> library harvest (Spotify-style: downloads land
  // in the library automatically, no manual rescan, optional autoplay).
  useEffect(() => {
    if (!harvest) return;
    let live = true;
    autoRefreshDone.current = true; // harvest scan replaces the boot refresh
    const run = async () => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      let targets = roots.length > 0 ? roots : [];
      if (targets.length === 0 && outputFolder) {
        targets = [outputFolder];
        setRoots([outputFolder]); // auto-register the download folder
      }
      if (targets.length === 0) {
        onHarvestDone();
        return;
      }
      setScanning(true);
      try {
        const { tracks: all, error } = await runScan(targets);
        if (!live) return;
        if (error) setScanError(error);
        setTracks(all);
        try {
          await api?.saveLibraryCache?.({ version: 1, roots: targets, scannedAt: Date.now(), tracks: all });
        } catch {
          // cache is best-effort
        }
        const fresh = all.filter((t) => t.mtime * 1000 >= harvest.since - 5000);
        if (fresh.length > 0) {
          setQueue(fresh);
          if (harvest.autoplay) {
            setQueueIndex(0);
          } else {
            setQueueIndex(-1);
            setNotice(`${fresh.length} new track${fresh.length > 1 ? 's' : ''} from your download — ready in queue`);
          }
        }
      } finally {
        if (live) setScanning(false);
      }
      onHarvestDone();
    };
    void run();
    return () => {
      live = false;
    };
  }, [harvest, roots, outputFolder, runScan, onHarvestDone]);

  // Background refresh once per launch (Poweramp ScanDispatcher-style):
  // library is already visible from cache; this only picks up changes.
  const autoRefreshDone = React.useRef(false);
  useEffect(() => {
    if (autoRefreshDone.current || roots.length === 0) return;
    autoRefreshDone.current = true;
    void handleScan();
  }, [roots, handleScan]);

  // Persist + restore the queue across launches; default to ALL tracks
  // when nothing was ever selected (user can change it anytime).
  const QUEUE_KEY = 'audit-queue-v1';
  const queueRestored = React.useRef(false);
  const manualEmpty = React.useRef(false); // user pressed Clear: don't refill
  useEffect(() => {
    try {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify({ paths: queue.map((t) => t.path), index: queueIndex })
      );
    } catch {
      // session-only
    }
  }, [queue, queueIndex]);
  useEffect(() => {
    if (tracks.length === 0 || queue.length > 0 || manualEmpty.current) return;
    if (!queueRestored.current) {
      queueRestored.current = true;
      try {
        const raw = localStorage.getItem(QUEUE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { paths?: unknown; index?: unknown };
          if (saved && Array.isArray(saved.paths)) {
            const byPath = new Map(tracks.map((t) => [t.path, t]));
            const restored: Track[] = [];
            for (const p of saved.paths) {
              if (typeof p === 'string') {
                const t = byPath.get(p);
                if (t) restored.push(t);
              }
            }
            if (restored.length > 0) {
              setQueue(restored);
              const idx = typeof saved.index === 'number' ? saved.index : 0;
              setQueueIndex(Math.max(0, Math.min(idx, restored.length - 1)));
              return;
            }
          }
        }
      } catch {
        // fall through to default fill
      }
    }
    setQueue(tracks);
    setQueueIndex(-1);
  }, [tracks, queue.length]);

  const handleAddRoot = useCallback(async () => {
    try {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const folder = await api?.selectFolder?.();
      if (folder && !roots.includes(folder)) setRoots((r) => [...r, folder]);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Folder error');
    }
  }, [roots]);

  // ---- queue ops ----
  const playList = useCallback((list: Track[], start = 0) => {
    if (list.length === 0) return;
    setQueue(list);
    setQueueIndex(Math.max(0, Math.min(start, list.length - 1)));
    setView('player');
  }, []);

  const playTrack = useCallback((track: Track, context: Track[]) => {
    const ctx = context.length > 0 ? context : [track];
    const idx = Math.max(0, ctx.findIndex((t) => t.path === track.path));
    playList(ctx, idx);
  }, [playList]);

  const playNext = useCallback((track: Track) => {
    setQueue((q) => {
      if (q.length === 0) {
        setQueueIndex(0);
        return [track];
      }
      const at = queueIndex < 0 ? 0 : queueIndex + 1;
      const next = [...q];
      next.splice(at, 0, track);
      return next;
    });
  }, [queueIndex]);

  const appendToQueue = useCallback(
    (t: Track | Track[]) => setQueue((q) => [...q, ...(Array.isArray(t) ? t : [t])]),
    []
  );

  const moveInQueue = useCallback((index: number, dir: -1 | 1) => {
    setQueue((q) => {
      const j = index + dir;
      if (index < 0 || j < 0 || j >= q.length) return q;
      const next = [...q];
      [next[index], next[j]] = [next[j], next[index]];
      setQueueIndex((qi) => {
        if (qi === index) return j;
        if (qi === j) return index;
        return qi;
      });
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((q) => q.filter((_, i) => i !== index));
    setQueueIndex((qi) => {
      if (qi === index) return -1;
      return qi > index ? qi - 1 : qi;
    });
  }, []);

  // ---- playlists ----
  const updatePlaylist = useCallback((id: string, fn: (pl: Playlist) => Playlist) => {
    persistPlaylists(playlists.map((p) => (p.id === id ? fn(p) : p)));
  }, [playlists]);

  const handleCreatePlaylist = useCallback((name: string) => {
    persistPlaylists([...playlists, createPlaylist(name)]);
  }, [playlists]);

  const handleAddToPlaylist = useCallback((id: string, track: Track) => {
    updatePlaylist(id, (pl) => (pl.paths.includes(track.path) ? pl : { ...pl, paths: [...pl.paths, track.path] }));
  }, [updatePlaylist]);

  const current = queueIndex >= 0 ? queue[queueIndex] : undefined;
  const queuePos = current ? `${queueIndex + 1} / ${queue.length}` : queue.length > 0 ? `${queue.length} in queue` : '';

  const handleTagSaved = useCallback((updated: Track) => {
    setTracks((ts) => ts.map((t) => (t.path === updated.path ? updated : t)));
    setQueue((q) => q.map((t) => (t.path === updated.path ? updated : t)));
    setEditingTrack(null);
  }, []);

  // ---- mini player bridge: commands in, state out ----
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    api?.onMiniCommand?.((cmd) => {
      if (typeof cmd === 'string') {
        if (cmd === 'toggle') transportRef.current?.toggle();
        else if (cmd === 'prev') transportRef.current?.prev();
        else transportRef.current?.next();
      } else if (cmd && typeof cmd === 'object') {
        if (cmd.type === 'seek') transportRef.current?.seek(cmd.pos);
        else if (cmd.type === 'volume') setVolume(Math.max(0, Math.min(1, cmd.vol)));
      }
    });
  }, []);

  useEffect(() => {
    const path = current?.path;
    if (!path || miniArtCache.current.has(path)) return;
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    api?.getTrackArt?.(path)
      .then((r) => miniArtCache.current.set(path, r && r.found ? r.dataUrl : null))
      .catch(() => miniArtCache.current.set(path, null));
  }, [current?.path]);

  useEffect(() => {
    const id = setInterval(() => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (!api?.sendPlayerState) return;
      const dur = audioEl && isFinite(audioEl.duration) && audioEl.duration > 0
        ? audioEl.duration
        : current?.duration || 0;
      api.sendPlayerState({
        playing,
        title: current?.title || '',
        artist: current?.artist || '',
        pos: audioEl?.currentTime ?? 0,
        dur,
        vol: volume,
        accent: lineColor,
        art: (current?.path && miniArtCache.current.get(current.path)) || null,
        artPath: current?.path || null,
        hasQueue: queue.length > 0,
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, current, queue.length, audioEl, volume, lineColor]);

  const nav: { id: View; label: string; Icon: typeof Disc3 }[] = [
    { id: 'player', label: 'Player', Icon: Disc3 },
    { id: 'library', label: 'Library', Icon: Library },
    { id: 'folders', label: 'Folders', Icon: FolderOpen },
    { id: 'playlists', label: 'Playlists', Icon: ListMusic },
    { id: 'eq', label: 'EQ', Icon: SlidersHorizontal },
  ];

  return (
    <div className="space-y-2 w-full">
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-black/25 border border-white/5 p-1">
        {nav.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors ${view === id ? 'acc-soft-20 acc-text' : 'text-gray-400 acc-hover-text'}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {scanError && (
        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{scanError}</div>
      )}
      {notice && (
        <div className="flex items-center gap-2 text-xs acc-text acc-soft-20 border acc-border rounded-lg px-3 py-2">
          <span className="flex-1">{notice}</span>
          {queue.length > 0 && queueIndex < 0 && (
            <button onClick={() => { setQueueIndex(0); setNotice(null); }}
              className="px-2 py-0.5 rounded-lg acc-soft-40 acc-hover-60 text-white transition-colors">
              Play
            </button>
          )}
          <button onClick={() => setNotice(null)} title="Dismiss"
            className="px-1 rounded acc-text-dim hover:acc-text transition-colors">
            ×
          </button>
        </div>
      )}

      <motion.div
        key={view}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
      {view === 'player' && (
        <>
          <NowPlaying
            track={current}
            queuePosition={queuePos}
            playing={playing}
            onToggle={() => transportRef.current?.toggle()}
            onPrev={() => transportRef.current?.prev()}
            onNext={() => transportRef.current?.next()}
            lineColor={lineColor}
          />
          <QueueView
            queue={queue}
            queueIndex={queueIndex}
            onJump={setQueueIndex}
            onMove={moveInQueue}
            onRemove={removeFromQueue}
            onClear={() => { manualEmpty.current = true; setQueue([]); setQueueIndex(-1); }}
            onSave={() => handleCreatePlaylist(`Queue ${new Date().toLocaleString()}`)}
          />
        </>
      )}

      {view === 'library' && (
        <LibraryHome
          tracks={tracks}
          playlists={playlists}
          onPlay={playTrack}
          onPlayNext={playNext}
          onAddToQueue={(t) => appendToQueue(t)}
          onAddToPlaylist={handleAddToPlaylist}
          onEditTags={setEditingTrack}
        />
      )}

      {view === 'folders' && (
        <FoldersView
          roots={roots}
          tracks={tracks}
          scanning={scanning}
          playlists={playlists}
          onAddRoot={handleAddRoot}
          onRemoveRoot={(r) => setRoots((xs) => xs.filter((x) => x !== r))}
          onScanAll={handleScan}
          onPlayTracks={(list) => playList(list)}
          onPlayShuffled={(list) => playList(shuffled(list))}
          onEnqueueTracks={(list) => appendToQueue(list)}
          onPlay={playTrack}
          onPlayNext={playNext}
          onAddToQueue={(t) => appendToQueue(t)}
          onAddToPlaylist={handleAddToPlaylist}
          onEditTags={setEditingTrack}
        />
      )}

      {view === 'playlists' && (
        <PlaylistsPanel
          playlists={playlists}
          tracks={tracks}
          queue={queue}
          onCreate={handleCreatePlaylist}
          onDelete={(id) => persistPlaylists(playlists.filter((p) => p.id !== id))}
          onPlay={(pl) => {
            const resolved = resolvePlaylist(pl, tracks);
            if (resolved.length > 0) playList(resolved);
          }}
          onAppendQueue={(id) => updatePlaylist(id, (pl) => ({
            ...pl,
            paths: [...pl.paths, ...queue.map((t) => t.path).filter((p) => !pl.paths.includes(p))],
          }))}
          onSaveQueue={(name) => persistPlaylists([...playlists, createPlaylist(name, queue.map((t) => t.path))])}
          onRemoveTrack={(plId, path) => updatePlaylist(plId, (pl) => ({ ...pl, paths: pl.paths.filter((p) => p !== path) }))}
        />
      )}

      {view === 'eq' && <EqualizerPanel />}
      </motion.div>

      <PlayerBar queue={queue} queueIndex={queueIndex} onAdvance={setQueueIndex}
        controlRef={transportRef} onPlayingChange={setPlaying} onAudioReady={setAudioEl}
        volume={volume} onVolumeChange={setVolume} />
      {editingTrack && (
        <TagEditor track={editingTrack} onClose={() => setEditingTrack(null)} onSaved={handleTagSaved} />
      )}
    </div>
  );
}

// Memoized: the downloader page re-renders on every keystroke/click, but the
// player tree (canvases, lists, EQ) is expensive. With stable props
// (clearHarvest is useCallback'd) the whole subtree is skipped on those renders.
const PlayerSection = React.memo(PlayerSectionInner);
export default PlayerSection;
