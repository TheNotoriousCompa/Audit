// Per-track ratings 1..5 (Poweramp-style), persisted locally.

const STORE_KEY = 'audit-ratings-v1';

export function loadRatings(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 5) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRatings(ratings: Record<string, number>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ratings));
  } catch {
    // session-only fallback
  }
}
