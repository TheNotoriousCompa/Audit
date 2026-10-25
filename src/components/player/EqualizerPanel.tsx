"use client";
import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { eqEngine, EQ_FREQS } from './EQEngine';
import { EQ_PRESETS, EQ_PRESET_NAMES, EQPresetName, clampGain } from './eq-presets';

const STORE_KEY = 'audit-eq-v1';

interface Stored {
  gains: number[];
  preamp: number;
  preset: string;
}

function loadStored(): Stored {
  const fallback: Stored = { gains: [...EQ_PRESETS.Flat], preamp: 0, preset: 'Flat' };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Stored>;
    const gains = Array.isArray(p.gains) && p.gains.length === EQ_FREQS.length
      ? p.gains.map(clampGain)
      : [...fallback.gains];
    return {
      gains,
      preamp: clampGain(Number(p.preamp) || 0),
      preset: typeof p.preset === 'string' ? p.preset : 'Flat',
    };
  } catch {
    return fallback;
  }
}

function fmtFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export default function EqualizerPanel() {
  const [open, setOpen] = useState(false);
  const [gains, setGains] = useState<number[]>([...EQ_PRESETS.Flat]);
  const [preamp, setPreamp] = useState(0);
  const [preset, setPreset] = useState('Flat');

  useEffect(() => {
    const s = loadStored();
    setGains(s.gains);
    setPreamp(s.preamp);
    setPreset(s.preset);
    eqEngine.applyPreset(s.gains);
    eqEngine.setPreamp(s.preamp);
  }, []);

  useEffect(() => {
    eqEngine.applyPreset(gains);
    eqEngine.setPreamp(preamp);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ gains, preamp, preset }));
    } catch {
      // storage unavailable: EQ still applies for this session
    }
  }, [gains, preamp, preset]);

  const applyPreset = (name: EQPresetName) => {
    setPreset(name);
    setGains([...EQ_PRESETS[name]]);
  };

  const setBand = (i: number, v: number) => {
    setPreset('Custom');
    setGains((g) => g.map((old, j) => (j === i ? clampGain(v) : old)));
  };

  return (
    <div className="w-full glass-inset rounded-xl p-3 sm:p-4">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-gray-200 acc-hover-text transition-colors text-sm font-medium">
        <SlidersHorizontal className="w-4 h-4" />
        Equalizer — 10 bands{!open && <span className="text-gray-500 font-normal"> · {preset}</span>}
      </button>
      {open && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {EQ_PRESET_NAMES.map((n) => (
              <button key={n} onClick={() => applyPreset(n)}
                className={`px-2 py-1 text-[11px] rounded-lg border transition-colors ${preset === n
                  ? 'acc-soft-40 acc-border text-white'
                  : 'bg-black/30 border-gray-800/60 text-gray-300 acc-hover-text'}`}>
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-end justify-between gap-1 sm:gap-2">
            {gains.map((g, i) => (
              <div key={EQ_FREQS[i]} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] acc-text tabular-nums">{g > 0 ? `+${g}` : g}</span>
                <input type="range" min={-12} max={12} step={0.5} value={g}
                  onChange={(e) => setBand(i, Number(e.target.value))}
                  className="acc-range cursor-pointer h-24 sm:h-28"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' } as React.CSSProperties}
                  aria-label={`${EQ_FREQS[i]} Hz`} />
                <span className="text-[10px] text-gray-500">{fmtFreq(EQ_FREQS[i])}</span>
              </div>
            ))}
            <div className="flex-1 flex flex-col items-center gap-1 border-l border-gray-800/60 pl-1 sm:pl-2">
              <span className="text-[10px] text-amber-400 tabular-nums">{preamp > 0 ? `+${preamp}` : preamp}</span>
              <input type="range" min={-12} max={12} step={0.5} value={preamp}
                onChange={(e) => setPreamp(clampGain(Number(e.target.value)))}
                className="accent-amber-500 cursor-pointer h-24 sm:h-28"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' } as React.CSSProperties}
                aria-label="Preamp" />
              <span className="text-[10px] text-gray-500">pre</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
