// On-demand album art with in-memory cache.
// Returns undefined while loading, null when no art found.

import { useEffect, useState } from 'react';

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();
const MAX_CACHE_ENTRIES = 400;

function remember(filePath: string, url: string | null): void {
  cache.delete(filePath);
  cache.set(filePath, url);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function invalidateArt(filePath: string): void {
  cache.delete(filePath);
  inFlight.delete(filePath);
}

function loadArt(filePath: string): Promise<string | null> {
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    const pending = api?.getTrackArt?.(filePath);
    if (!pending) return Promise.resolve(null);
    return pending
      .then((res) => (res && res.found && res.dataUrl ? res.dataUrl : null))
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

export function useArt(filePath: string | null | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(
    filePath ? cache.get(filePath) : null
  );

  useEffect(() => {
    if (!filePath) {
      setUrl(null);
      return;
    }
    if (cache.has(filePath)) {
      setUrl(cache.get(filePath) ?? null);
      return;
    }
    let live = true;
    setUrl(undefined);

    let request = inFlight.get(filePath);
    if (!request) {
      request = loadArt(filePath);
      inFlight.set(filePath, request);
      void request.finally(() => inFlight.delete(filePath));
    }

    void request.then((value) => {
      remember(filePath, value);
      if (live) setUrl(value);
    });

    return () => {
      live = false;
    };
  }, [filePath]);

  return url;
}
