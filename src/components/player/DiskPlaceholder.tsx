"use client";
import React from 'react';

// Black spinning vinyl shown when a track has no cover art.
// Pure CSS (the Lottie plate was white and barely rotated): dark disc with
// grooves + sheen wedge so the spin reads clearly on dark surfaces.
export default function DiskPlaceholder({
  className = '',
  spinning = true,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <div
      className={`${className} rounded-full relative overflow-hidden`}
      title="No cover art"
      style={{ backgroundColor: '#0a0a0a' }}>
      <div
        className={`absolute inset-0 rounded-full ${spinning ? 'animate-[spin_5s_linear_infinite]' : ''}`}
        style={{
          background:
            'repeating-radial-gradient(circle at 50% 50%, #050505 0px, #050505 2px, #1e1e1e 3px, #050505 4px)',
        }}
      />
      <div
        className={`absolute inset-0 rounded-full ${spinning ? 'animate-[spin_5s_linear_infinite]' : ''}`}
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, transparent 140deg, rgba(255,255,255,0.10) 165deg, transparent 190deg, transparent 360deg)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '34%',
          height: '34%',
          top: '33%',
          left: '33%',
          backgroundColor: '#2a2a2a',
          boxShadow: 'rgba(0,0,0,0.5) 0px 2px 6px',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '8%',
          height: '8%',
          top: '46%',
          left: '46%',
          backgroundColor: '#0a0a0a',
        }}
      />
    </div>
  );
}
