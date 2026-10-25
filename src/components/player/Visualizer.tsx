"use client";
import React, { useEffect, useRef } from 'react';
import { eqEngine } from './EQEngine';

// Live spectrum from the EQ analyser. Idle bars when nothing is attached.
// Drop-in point for .milk rendering: a future MilkCanvas can consume the
// same AnalyserNode (see docs/PLAYER.md).
export default function Visualizer({ lineColor, height = 72 }: { lineColor: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let phase = 0;
    let skip = 0;
    // Reused buffers: allocating + resizing the canvas every frame was the
    // single most expensive part of the player UI (forced layout + full
    // canvas reset per frame).
    let data: Uint8Array<ArrayBuffer> | null = null;
    let lastW = 0;
    const sizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.offsetWidth * 2;
      if (w > 0 && w !== lastW) {
        lastW = w;
        canvas.width = w;
        canvas.height = height * 2;
      }
    };
    const ro = new ResizeObserver(sizeCanvas);
    if (canvasRef.current) ro.observe(canvasRef.current);
    sizeCanvas();
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const analyser = eqEngine.getAnalyser();
      const N = 48;
      const w = canvas.width;
      const h = canvas.height;
      const bw = w / N;
      if (analyser) {
        if (!data || data.length !== analyser.frequencyBinCount) {
          data = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(data);
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < N; i++) {
          const v = data[Math.floor((i / N) * data.length)] / 255;
          const bh = Math.max(4, v * h);
          ctx.fillStyle = lineColor;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(i * bw + 2, h - bh, bw - 4, bh);
        }
        ctx.globalAlpha = 1;
      } else {
        // Idle bars are decorative: run them at ~15fps instead of 60fps.
        skip = (skip + 1) % 4;
        if (skip !== 1) {
          raf = requestAnimationFrame(draw);
          return;
        }
        phase += 0.06;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = lineColor;
        for (let i = 0; i < N; i++) {
          const v = (Math.sin(phase + i * 0.45) + 1) / 2;
          const bh = 6 + v * h * 0.25;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(i * bw + 2, h - bh, bw - 4, bh);
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [lineColor, height]);

  return <canvas ref={canvasRef} className="w-full rounded-lg bg-black/30 border border-gray-800/40" style={{ height }} />;
}
