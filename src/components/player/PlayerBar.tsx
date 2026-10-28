"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import type { Track } from '@/types/electron';
import { eqEngine, mediaUrlFor } from './EQEngine';

type RepeatMode = 'off' | 'all' | 'one';

interface Props {
  queue: Track[];
  queueIndex: number;
  onAdvance: (nextIndex: number) => void;
  onAudioReady?: (audio: HTMLAudioElement | null) => void;
  controlRef: React.MutableRefObject<TransportControls | null>;
  onPlayingChange?: (playing: boolean) => void;
  volume: number;
  onVolumeChange?: (vol: number) => void;
}

export interface TransportControls {
  toggle: () => void;
  prev: () => void;
  next: () => void;
  seek: (pos: number) => void;
  setVolume: (vol: number) => void;
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerBar({ queue, queueIndex, onAdvance, onAudioReady, controlRef, onPlayingChange, volume, onVolumeChange }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVolState] = useState(volume);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  // Volume is lifted (mini player shares it); keep local echo for the slider.
  useEffect(() => {
    setVolState(volume);
  }, [volume]);

  const setVol = (v: number) => {
    setVolState(v);
    onVolumeChange?.(v);
  };

  const current = queue[queueIndex];
  const src = current ? mediaUrlFor(current.path) : '';

  // Attach EQ graph once the element exists.
  useEffect(() => {
    if (audioRef.current) {
      eqEngine.attach(audioRef.current);
      onAudioReady?.(audioRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load + autoplay on track change.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    el.src = src;
    el.load();
    eqEngine.resume();
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = vol;
      el.muted = muted;
    }
  }, [vol, muted]);

  const pickNext = useCallback((dir: 1 | -1): number => {
    if (queue.length === 0) return -1;
    if (shuffle && queue.length > 1) {
      let n = queueIndex;
      while (n === queueIndex) n = Math.floor(Math.random() * queue.length);
      return n;
    }
    const n = queueIndex + dir;
    if (n < 0) return repeat === 'all' ? queue.length - 1 : 0;
    if (n >= queue.length) return repeat === 'all' ? 0 : -1;
    return n;
  }, [queue, queueIndex, shuffle, repeat]);

  const handleEnded = useCallback(() => {
    if (repeat === 'one') {
      const el = audioRef.current;
      if (el) {
        el.currentTime = 0;
        void el.play();
      }
      return;
    }
    const n = pickNext(1);
    if (n >= 0) onAdvance(n);
    else setPlaying(false);
  }, [repeat, pickNext, onAdvance]);

  const toggle = () => {
    const el = audioRef.current;
    if (!current) {
      // nothing selected yet: start from the first queued track
      if (queue.length > 0) onAdvance(0);
      return;
    }
    if (!el) return;
    eqEngine.resume();
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  // Expose transport to siblings (NowPlaying) and publish state for mini player.
  useEffect(() => {
    controlRef.current = {
      toggle,
      prev: () => {
        const n = pickNext(-1);
        if (n >= 0) onAdvance(n);
      },
      next: () => {
        const n = pickNext(1);
        if (n >= 0) onAdvance(n);
      },
      seek: (seekPos: number) => {
        const el = audioRef.current;
        if (el && isFinite(el.duration) && el.duration > 0) {
          el.currentTime = Math.max(0, Math.min(seekPos, el.duration));
        }
      },
      setVolume: (v: number) => {
        setVol(Math.max(0, Math.min(1, v)));
        setMuted(false);
      },
    };
  });

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  return (
    <div className="w-full glass-inset rounded-xl px-3 py-2">
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        preload="auto"
      />
      <div className="text-[11px] sm:text-xs text-gray-200 truncate mb-1">
        {current ? (
          <span><span className="acc-text font-medium">{current.artist || 'Unknown artist'}</span>
            {' — '}{current.title}</span>
        ) : (
          <span className="text-gray-500">No track selected — scan your folder and pick a song</span>
        )}
      </div>
      <input
        type="range" min={0} max={dur || 0} step={0.1} value={pos}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (audioRef.current) audioRef.current.currentTime = v;
          setPos(v);
        }}
        className="w-full acc-range h-1 cursor-pointer"
        disabled={!current}
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-gray-400 tabular-nums">{fmt(pos)} / {fmt(dur || current?.duration || 0)}</span>
        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={() => setShuffle((s) => !s)} title="Shuffle"
            className={`p-1.5 rounded-lg transition-colors ${shuffle ? 'acc-text bg-white/10' : 'text-gray-300 acc-hover-text'}`}>
            <Shuffle className="w-4 h-4" />
          </button>
          <button onClick={() => { const n = pickNext(-1); if (n >= 0) onAdvance(n); }} title="Previous"
            className="p-1.5 rounded-lg text-gray-200 acc-hover-text transition-colors" disabled={!current}>
            <SkipBack className="w-5 h-5" />
          </button>
          <button onClick={toggle} title={playing ? 'Pause' : 'Play'}
            className="p-2 rounded-full acc-soft-40 acc-hover-60 border acc-border acc-on-accent transition-colors" disabled={!current}>
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={() => { const n = pickNext(1); if (n >= 0) onAdvance(n); }} title="Next"
            className="p-1.5 rounded-lg text-gray-200 acc-hover-text transition-colors" disabled={!current}>
            <SkipForward className="w-5 h-5" />
          </button>
          <button
            onClick={() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))}
            title={`Repeat: ${repeat}`}
            className={`p-1.5 rounded-lg transition-colors ${repeat !== 'off' ? 'acc-text bg-white/10' : 'text-gray-300 acc-hover-text'}`}>
            {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute' : 'Mute'}
            className="p-1.5 rounded-lg text-gray-300 acc-hover-text transition-colors">
            {muted || vol === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : vol}
            onChange={(e) => { setVol(Number(e.target.value)); setMuted(false); }}
            className="w-16 sm:w-20 acc-range h-1 cursor-pointer" />
        </div>
      </div>
    </div>
  );
}
