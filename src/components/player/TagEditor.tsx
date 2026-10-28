"use client";
import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { Track, WriteTagFields } from '@/types/electron';

interface Props {
  track: Track;
  onClose: () => void;
  onSaved: (updated: Track) => void;
}

// Edit embedded tags in place (Poweramp EditTagActivity equivalent).
// Writes via mutagen in the Python sidecar, then refreshes the row.
export default function TagEditor({ track, onClose, onSaved }: Props) {
  const [fields, setFields] = useState<WriteTagFields>({
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof WriteTagFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.writeTags) {
      setError('Tag writer unavailable — restart the desktop app.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.writeTags(track.path, fields);
      if (res.success && res.track) onSaved(res.track);
      else setError(res.error || 'Write failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Write failed');
    } finally {
      setSaving(false);
    }
  };

  const rows: { key: keyof WriteTagFields; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'artist', label: 'Artist' },
    { key: 'album', label: 'Album' },
    { key: 'genre', label: 'Genre' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-zinc-950 border border-gray-700/60 rounded-2xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <span className="flex-1 text-sm font-medium text-gray-100">Edit tags</span>
          <button onClick={onClose} title="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[11px] text-gray-500 truncate mb-3" title={track.path}>{track.filename}</div>
        <div className="space-y-2">
          {rows.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="text-[11px] text-gray-400">{label}</span>
              <input value={fields[key]} onChange={set(key)}
                className="mt-0.5 w-full px-3 py-1.5 text-sm bg-black/40 border border-gray-800/60 rounded-xl outline-none text-gray-100 acc-focus" />
            </label>
          ))}
        </div>
        {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
        <button onClick={save} disabled={saving}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm acc-soft-40 acc-hover-60 border acc-border rounded-xl acc-on-accent transition-colors disabled:opacity-40">
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save tags'}
        </button>
      </div>
    </div>
  );
}
