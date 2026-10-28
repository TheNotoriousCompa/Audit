'use client';
import React, { useEffect, useRef, useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

const PRESETS = ['#ffffff', '#50C878', '#38BDF8', '#A78BFA', '#F5B942', '#FB7185'];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function normalizeHex(input: string): string | null {
  let h = input.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}

function hexToRgb(hex: string) {
  const h = normalizeHex(hex);
  if (!h) return { r: 80, g: 200, b: 120 };
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hsv, setHsv] = useState(() => {
    const { r, g, b } = hexToRgb(value);
    return rgbToHsv(r, g, b);
  });
  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<'sv' | 'hue' | null>(null);
  const rafRef = useRef(0);
  const pendingRef = useRef<string | null>(null);
  const lastEmittedRef = useRef(value);

  // Keep the picker in sync with external changes (preset click, hex typing),
  // but never fight the pointer while dragging.
  useEffect(() => {
    if (draggingRef.current) return;
    if (value.toLowerCase() === lastEmittedRef.current.toLowerCase()) return;
    const { r, g, b } = hexToRgb(value);
    const next = rgbToHsv(r, g, b);
    setHsv((prev) => ({ ...next, h: next.s === 0 ? prev.h : next.h }));
    lastEmittedRef.current = value;
  }, [value]);

  const emit = (hex: string) => {
    pendingRef.current = hex;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next && next !== lastEmittedRef.current) {
        lastEmittedRef.current = next;
        onChange(next);
      }
    });
  };

  const applyHsv = (h: number, s: number, v: number) => {
    setHsv({ h, s, v });
    const rgb = hsvToRgb(h, s, v);
    emit(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const pointerToSv = (e: PointerEvent | React.PointerEvent) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp01((e.clientX - rect.left) / rect.width);
    const v = 1 - clamp01((e.clientY - rect.top) / rect.height);
    applyHsv(hsv.h, s, v);
  };

  const pointerToHue = (e: PointerEvent | React.PointerEvent) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = clamp01((e.clientX - rect.left) / rect.width) * 360;
    applyHsv(h, hsv.s || 1, hsv.v || 1);
  };

  const startDrag = (mode: 'sv' | 'hue') => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = mode;
    if (mode === 'sv') pointerToSv(e);
    else pointerToHue(e);

    const move = (ev: PointerEvent) => {
      if (draggingRef.current !== mode) return;
      if (mode === 'sv') pointerToSv(ev);
      else pointerToHue(ev);
    };
    const up = () => {
      draggingRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const hueColor = `hsl(${hsv.h} 100% 50%)`;
  const solid = rgbToHex(...(Object.values(hsvToRgb(hsv.h, hsv.s, hsv.v)) as [number, number, number]));

  return (
    <div className="space-y-2.5">
      {/* Saturation / value square */}
      <div
        ref={svRef}
        onPointerDown={startDrag('sv')}
        className="relative h-24 w-full rounded-lg overflow-hidden cursor-crosshair touch-none ring-1 ring-white/10"
        style={{ backgroundColor: hueColor }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))',
          }}
        />
        <span
          className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] pointer-events-none"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: solid }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        onPointerDown={startDrag('hue')}
        className="relative h-3 w-full rounded-full cursor-pointer touch-none ring-1 ring-white/10"
        style={{
          background:
            'linear-gradient(to right, #ff0000, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000)',
        }}
      >
        <span
          className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border border-black/30 shadow pointer-events-none"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      {/* Presets */}
      <div className="flex items-center gap-1.5 pt-0.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            title={p}
            onClick={() => {
              const { r, g, b } = hexToRgb(p);
              const next = rgbToHsv(r, g, b);
              setHsv(next);
              emit(p);
            }}
            className={`w-5 h-5 rounded-full ring-1 transition-transform hover:scale-110 ${
              value.toLowerCase() === p.toLowerCase() ? 'ring-white/80' : 'ring-white/15'
            }`}
            style={{ background: p }}
          />
        ))}
      </div>
    </div>
  );
}
