'use client';
import React, { useEffect, useRef } from 'react';
import { eqEngine } from './EQEngine';

// Pixel-art spectrum: the canvas renders at a tiny internal resolution
// (1 unit ≈ 3 css px) and is scaled up with image-rendering: pixelated,
// so every bar is made of chunky, hard-edged blocks (LED style).
const BLOCK = 3;

type RGB = [number, number, number];

function parseColor(input: string): RGB {
  const raw = (input || '').trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return [parseInt(raw[0] + raw[0], 16), parseInt(raw[1] + raw[1], 16), parseInt(raw[2] + raw[2], 16)];
  }
  return [80, 200, 120];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const css = ([r, g, b]: RGB) => `rgb(${r},${g},${b})`;

export default function Visualizer({ lineColor, height = 72 }: { lineColor: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const widthRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let phase = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    let active = true;
    let intersecting = true;

    const base = parseColor(lineColor);
    const mid = mix(base, [255, 255, 255], 0.18);
    const peak = mix(base, [255, 255, 255], 0.42);
    const baseC = css(base);
    const midC = css(mid);
    const peakC = css(peak);

    const canvas = canvasRef.current;
    let roRef: ResizeObserver | null = null;
    let ioRef: IntersectionObserver | null = null;
    if (canvas) {
      const ro = new ResizeObserver((entries) => {
        widthRef.current = entries[0]?.contentRect.width ?? canvas.clientWidth;
        if (!document.hidden && intersecting && !raf && widthRef.current > 0) draw();
      });
      ro.observe(canvas);
      widthRef.current = canvas.clientWidth;
      roRef = ro;

      const io = new IntersectionObserver((entries) => {
        intersecting = entries[0]?.isIntersecting ?? true;
        if (!intersecting) {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        } else if (!document.hidden && !raf) {
          draw();
        }
      }, { threshold: 0.01 });
      io.observe(canvas);
      ioRef = io;
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else if (intersecting && !raf) {
        draw();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const draw = () => {
      raf = 0;
      if (!active || document.hidden || !intersecting) return;
      const el = canvasRef.current;
      if (!el) return;
      const cssW = widthRef.current;
      // Hidden sections report 0 width: keep waiting for the observer/resize
      // signal instead of running a busy rAF loop.
      if (cssW <= 0) return;

      // One art unit per BLOCK css px: crisp square pixels after scaling.
      const artW = Math.max(32, Math.round(cssW / BLOCK));
      const artH = Math.max(12, Math.round(height / BLOCK));
      if (el.width !== artW || el.height !== artH) {
        el.width = artW;
        el.height = artH;
      }

      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, artW, artH);

      const segments = Math.max(4, Math.floor(artH / 2)); // 1 filled + 1 gap unit
      const bars = Math.max(12, Math.min(64, Math.floor(artW / 3)));
      const pitch = artW / bars;
      const barW = Math.max(1, Math.floor(pitch) - 1);
      const analyser = eqEngine.getAnalyser();
      let drewSpectrum = false;

      if (analyser) {
        if (!data || data.length !== analyser.frequencyBinCount) {
          data = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(data);
        // Paused/silent audio still yields an (all-zero) analyser: fall back
        // to the idle animation instead of drawing nothing.
        let peakVal = 0;
        for (let i = 0; i < data.length; i++) if (data[i] > peakVal) peakVal = data[i];
        if (peakVal > 4) {
          drewSpectrum = true;
          ctx.globalAlpha = 0.95;
          for (let i = 0; i < bars; i++) {
            const idx = Math.min(data.length - 1, Math.floor(Math.pow(i / bars, 1.35) * data.length * 0.8));
            const v = (data[idx] || 0) / 255;
            const level = Math.min(segments, Math.round(v * segments));
            if (level <= 0) continue;
            const x = Math.floor(i * pitch);
            for (let s = 0; s < level; s++) {
              const y = artH - 1 - s * 2;
              if (y < 0) break;
              ctx.fillStyle = s >= segments * 0.8 ? peakC : s >= segments * 0.5 ? midC : baseC;
              ctx.fillRect(x, y, barW, 1);
            }
          }
          ctx.globalAlpha = 1;
        }
      }

      if (!drewSpectrum) {
        // Idle: blocky sine bars. Drawn every frame (the canvas is tiny) with
        // a slow phase so they move gently without flickering.
        phase += 0.012;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < bars; i++) {
          const v = (Math.sin(phase + i * 0.42) + 1) / 2;
          const level = Math.max(1, Math.round(v * segments * 0.45));
          const x = Math.floor(i * pitch);
          for (let s = 0; s < level; s++) {
            const y = artH - 1 - s * 2;
            if (y < 0) break;
            ctx.fillStyle = baseC;
            ctx.fillRect(x, y, barW, 1);
          }
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };

    if (!document.hidden) draw();

    return () => {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      if (roRef) roRef.disconnect();
      if (ioRef) ioRef.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lineColor, height]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg bg-black/30 border border-gray-800/40"
      style={{ height, imageRendering: 'pixelated' }}
    />
  );
}
