import fs from 'fs';
import path from 'path';

export const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.mp4', '.flac', '.wav', '.opus', '.ogg', '.wma', '.aac',
]);

export function isAudioPath(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Stable comparison key for a path. Windows paths are case-insensitive. */
export function normalizePathKey(input: string): string {
  const resolved = path.normalize(path.resolve(input));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isPathInside(root: string, candidate: string): boolean {
  const rootKey = normalizePathKey(root);
  const candidateKey = normalizePathKey(candidate);
  if (rootKey === candidateKey) return true;
  const prefix = rootKey.endsWith(path.sep) ? rootKey : rootKey + path.sep;
  return candidateKey.startsWith(prefix);
}

export function resolveRealPath(target: string): string | null {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return null;
  }
}

/** Resolve symlinks and junctions before checking containment. */
export function isRealPathInside(root: string, candidate: string): boolean {
  const realRoot = resolveRealPath(root);
  const realCandidate = resolveRealPath(candidate);
  if (!realRoot || !realCandidate) return false;
  return isPathInside(realRoot, realCandidate);
}

export function assertPathInside(root: string, candidate: string): string {
  if (!isRealPathInside(root, candidate)) {
    throw new Error(`Path is outside the approved root: ${candidate}`);
  }
  return path.resolve(candidate);
}
