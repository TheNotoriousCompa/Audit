import fs from 'fs';
import path from 'path';
import { getMeta, getRoots, setMeta } from './db';
import { isAudioPath, isPathInside, normalizePathKey, resolveRealPath } from './path-policy';

const DOWNLOAD_DIRS_META_KEY = 'downloadDirs';
const sessionRoots = new Map<string, string>();
let downloadDirs: Map<string, string> | null = null;

function canonicalDirectory(dir: string): string | null {
  const real = resolveRealPath(dir);
  if (!real) return null;
  try {
    return fs.statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

function loadDownloadDirs(): Map<string, string> {
  if (downloadDirs) return downloadDirs;
  const next = new Map<string, string>();
  try {
    const raw = getMeta(DOWNLOAD_DIRS_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry !== 'string') continue;
          const real = canonicalDirectory(entry);
          if (real) next.set(normalizePathKey(real), real);
        }
      }
    }
  } catch {
    // A missing or corrupt metadata value only means no remembered output folders.
  }
  downloadDirs = next;
  return next;
}

function persistDownloadDirs(): void {
  try {
    setMeta(DOWNLOAD_DIRS_META_KEY, JSON.stringify([...loadDownloadDirs().values()]));
  } catch {
    // The in-memory allowlist still works for this session.
  }
}

/** Called only after a native folder dialog selected the directory. */
export function approveRoot(dir: string): string | null {
  const real = canonicalDirectory(dir);
  if (real) sessionRoots.set(normalizePathKey(real), real);
  return real;
}

export function rememberDownloadDir(dir: string): string | null {
  const real = canonicalDirectory(dir);
  if (!real) return null;
  loadDownloadDirs().set(normalizePathKey(real), real);
  persistDownloadDirs();
  return real;
}

function rootEntries(): string[] {
  const entries = new Map<string, string>();
  for (const root of getRoots()) {
    const real = resolveRealPath(root) ?? root;
    entries.set(normalizePathKey(real), real);
  }
  for (const [key, real] of sessionRoots) entries.set(key, real);
  return [...entries.values()];
}

function downloadEntries(): string[] {
  return [...loadDownloadDirs().values()];
}

export function isApprovedDirectory(dir: string, includeDownloads = true): boolean {
  const real = canonicalDirectory(dir);
  if (!real) return false;
  const roots = [...rootEntries(), ...(includeDownloads ? downloadEntries() : [])];
  return roots.some((root) => isPathInside(root, real));
}

export function isApprovedFile(filePath: string): boolean {
  const real = resolveRealPath(filePath);
  if (!real || !isAudioPath(real)) return false;
  return isApprovedDirectory(path.dirname(real));
}
