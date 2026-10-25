// Web Audio 10-band equalizer engine (clean-room).
// Graph: <audio> -> MediaElementSource -> preamp Gain -> 10x peaking
// BiquadFilter -> AnalyserNode -> destination.
// One engine per app; attach() binds a single <audio> element once.

import { clampGain } from './eq-presets';

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const BAND_COUNT = EQ_FREQS.length;

const Q_BY_INDEX = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

class EQEngine {
  private ctx: AudioContext | null = null;
  private bands: BiquadFilterNode[] = [];
  private preamp: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private boundElement: HTMLAudioElement | null = null;
  private lastGains: number[] = new Array(BAND_COUNT).fill(0);
  private lastPreampDb = 0;

  private ensure(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AC = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.preamp = this.ctx.createGain();
      let head: AudioNode = this.preamp;
      this.bands = EQ_FREQS.map((freq, i) => {
        const f = this.ctx!.createBiquadFilter();
        f.type = 'peaking';
        f.frequency.value = freq;
        f.Q.value = Q_BY_INDEX[i];
        f.gain.value = 0;
        head.connect(f);
        head = f;
        return f;
      });
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      head.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);
    }
    return true;
  }

  /** Bind an <audio> element to the EQ graph (idempotent per element). */
  attach(audio: HTMLAudioElement): boolean {
    if (!this.ensure() || !this.ctx || !this.preamp) return false;
    if (this.boundElement === audio) return true;
    try {
      const src = this.ctx.createMediaElementSource(audio);
      src.connect(this.preamp);
      this.boundElement = audio;
      // Re-apply persisted gains (panel may have run before attach).
      this.lastGains.forEach((db, i) => {
        if (this.bands[i]) this.bands[i].gain.value = clampGain(db);
      });
      this.setPreamp(this.lastPreampDb);
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      // Element already bound (e.g. StrictMode remount): keep existing graph.
      return this.boundElement === audio;
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setBand(index: number, db: number): void {
    this.lastGains[index] = clampGain(db);
    const band = this.bands[index];
    if (band) band.gain.value = clampGain(db);
  }

  applyPreset(gains: number[]): void {
    gains.slice(0, BAND_COUNT).forEach((db, i) => this.setBand(i, db));
  }

  setPreamp(db: number): void {
    this.lastPreampDb = clampGain(db);
    if (this.preamp) this.preamp.gain.value = Math.pow(10, clampGain(db) / 20);
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }
}

export const eqEngine = new EQEngine();

export function mediaUrlFor(absPath: string): string {
  return `media://audio?path=${encodeURIComponent(absPath)}`;
}
