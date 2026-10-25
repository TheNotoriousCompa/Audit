// Hand-authored generic EQ presets (clean-room, dB per band).
// Bands match EQ_FREQS in EQEngine.ts. Values in [-12, +12].
// For headphone-specific correction, generate presets from the upstream
// AutoEq project with scripts/fetch-autoeq.js instead of copying
// any vendor database.

export const EQ_PRESET_NAMES = [
  'Flat',
  'Bass Boost',
  'Treble Boost',
  'Vocal',
  'Rock',
  'Pop',
  'Jazz',
  'Classical',
  'Electronic',
] as const;

export type EQPresetName = (typeof EQ_PRESET_NAMES)[number];

export const EQ_PRESETS: Record<EQPresetName, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
  Vocal: [-2, -1, 0, 1, 3, 4, 3, 1, 0, -1],
  Rock: [5, 4, 3, 1, 0, 0, 1, 3, 4, 5],
  Pop: [2, 3, 4, 2, 0, -1, 0, 2, 3, 4],
  Jazz: [3, 2, 1, 0, -1, 0, 1, 2, 3, 4],
  Classical: [4, 3, 2, 0, 0, 0, -1, 1, 3, 4],
  Electronic: [5, 4, 2, 0, -1, 0, 1, 3, 4, 5],
};

export function clampGain(db: number): number {
  return Math.max(-12, Math.min(12, db));
}
