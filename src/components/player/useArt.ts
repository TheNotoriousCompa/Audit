// On-demand album art with in-memory cache.
// Returns undefined while loading, null when no art found.

import { useEffect, useState } from 'react';

const cache = new Map<string, string | null>();

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
    try {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const p = api?.getTrackArt?.(filePath);
      if (!p) {
        cache.set(filePath, null);
        setUrl(null);
        return;
      }
      void p
        .then((res) => {
          const u = res && res.found && res.dataUrl ? res.dataUrl : null;
          cache.set(filePath, u);
          if (live) setUrl(u);
        })
        .catch(() => {
          cache.set(filePath, null);
          if (live) setUrl(null);
        });
    } catch {
      cache.set(filePath, null);
      setUrl(null);
    }
    return () => {
      live = false;
    };
  }, [filePath]);

  return url;
}
