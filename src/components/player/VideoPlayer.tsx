"use client";
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Track } from '@/types/electron';
import { mediaUrlFor } from './EQEngine';

interface Props {
  track: Track;
  onClose: () => void;
}

export default function VideoPlayer({ track, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-4xl glass-popover rounded-2xl p-3"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-1 pb-2">
          <span className="w-1.5 h-1.5 rounded-full acc-bg shrink-0" />
          <h2 className="text-sm font-semibold text-white truncate flex-1">{track.title}</h2>
          <button
            onClick={onClose}
            title="Close video"
            aria-label="Close video"
            className="p-1 -mr-1 rounded-lg text-gray-400 acc-hover-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <video
          key={track.path}
          src={mediaUrlFor(track.path)}
          controls
          autoPlay
          playsInline
          className="w-full max-h-[70vh] rounded-xl bg-black"
        />
        <div className="px-1 pt-2 text-[10px] text-gray-500 truncate">{track.filename}</div>
      </div>
    </div>,
    document.body
  );
}
