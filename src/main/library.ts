import * as fs from 'fs';
import path from 'path';
import { app, nativeImage } from 'electron';
import isDev from 'electron-is-dev';
import { logToFile } from './logger';
import type { LibraryCache, LibraryScanResult, Track, TrackArt, WriteTagFields, WriteTagResult } from '../types/electron';
import { initDb, listTracks, upsertTracks, getRoots, getMeta, importLibraryCache, applyLibraryScan } from './db';
import { isApprovedDirectory, isApprovedFile } from './approved-paths';
import { normalizePathKey } from './path-policy';
import { ART_TIMEOUT_MS, SCAN_TIMEOUT_MS, TAG_TIMEOUT_MS, runSidecar } from './sidecar-runner';

const CACHE_VERSION = 1;

function getCachePath(): string {
  try {
    return path.join(app.getPath('userData'), 'audit-library.json');
  } catch {
    return path.join(process.cwd(), 'audit-library.json');
  }
}

function readLegacyCache(): LibraryCache {
  const empty: LibraryCache = { version: CACHE_VERSION, roots: [], scannedAt: 0, tracks: [] };
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LibraryCache>;
    if (!parsed || !Array.isArray(parsed.tracks) || !Array.isArray(parsed.roots)) return empty;
    const tracks = (parsed.tracks as unknown[]).filter(
      (t): t is Track => !!t && typeof (t as Track).path === 'string' && typeof (t as Track).title === 'string'
    );
    const roots = (parsed.roots as unknown[]).filter((r): r is string => typeof r === 'string');
    return { version: CACHE_VERSION, roots, scannedAt: Number(parsed.scannedAt) || 0, tracks };
  } catch {
    return empty;
  }
}

export function loadLibraryCache(): LibraryCache {
  try {
    initDb();
    const tracks = listTracks();
    if (tracks.length > 0) {
      return {
        version: CACHE_VERSION,
        roots: getRoots(),
        scannedAt: Number(getMeta('scannedAt') || 0),
        tracks,
      };
    }
    // First run with SQLite: import the legacy JSON cache once.
    const legacy = readLegacyCache();
    if (legacy.tracks.length > 0) {
      importLibraryCache(legacy);
      return {
        version: CACHE_VERSION,
        roots: getRoots(),
        scannedAt: Number(getMeta('scannedAt') || 0),
        tracks: listTracks(),
      };
    }
    return { version: CACHE_VERSION, roots: [], scannedAt: 0, tracks: [] };
  } catch (err) {
    logToFile(`[DB] load failed: ${err instanceof Error ? err.message : String(err)}`);
    return readLegacyCache();
  }
}

export function saveLibraryCache(cache: LibraryCache): boolean {
  try {
    initDb();
    applyLibraryScan(cache);
    // Keep the JSON as a human-readable backup while both stores coexist.
    const payload: LibraryCache = {
      version: CACHE_VERSION,
      roots: cache.roots,
      scannedAt: Date.now(),
      tracks: cache.tracks,
    };
    fs.mkdirSync(path.dirname(getCachePath()), { recursive: true });
    fs.writeFileSync(getCachePath(), JSON.stringify(payload));
    return true;
  } catch (err) {
    logToFile(`[LIB CACHE] save failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function resolveScanInvocation(): { python: string; script: string } {
  if (isDev) {
    return {
      python: 'python',
      script: path.join(__dirname, '..', '..', 'python', 'library', 'scan.py'),
    };
  }
  const extraResource = path.join(process.resourcesPath, 'python', 'library', 'scan.py');
  const asarUnpacked = path.join(
    process.resourcesPath, 'app.asar.unpacked', 'python', 'library', 'scan.py'
  );
  return {
    python: path.join(process.resourcesPath, 'python-runtime', 'python.exe'),
    script: fs.existsSync(extraResource) ? extraResource : asarUnpacked,
  };
}

export async function scanLibrary(dir: string): Promise<LibraryScanResult> {
  const fail = (error: string): LibraryScanResult => ({
    success: false, root: dir, count: 0, tracks: [], error,
  });

  if (typeof dir !== 'string' || !isApprovedDirectory(dir, true)) {
    return fail('Folder not approved. Choose it from the app first.');
  }

  let statOk = false;
  try {
    statOk = fs.statSync(dir).isDirectory();
  } catch {
    statOk = false;
  }
  if (!statOk) return fail(`Not a directory: ${dir}`);

  const { python, script } = resolveScanInvocation();
  if (!fs.existsSync(script)) return fail(`Scanner script missing: ${script}`);

  const result = await runSidecar(python, [script, dir], SCAN_TIMEOUT_MS);
  for (const line of result.stderr.split('\n')) {
    if (line.trim()) logToFile(`[LIB SCAN] ${line.trim()}`);
  }
  if (result.error) {
    logToFile(`[LIB SCAN ERROR] ${result.error}`);
    return fail(result.error);
  }

  for (const line of result.lines) {
    try {
      const parsed = JSON.parse(line) as { type?: string; data?: LibraryScanResult };
      if (parsed.type === 'scan-result' && parsed.data) {
        const data = parsed.data;
        return {
          success: Boolean(data.success),
          root: String(data.root || dir),
          count: Number(data.count || 0),
          tracks: Array.isArray(data.tracks) ? data.tracks : [],
          error: String(data.error || ''),
        };
      }
    } catch {
      // Ignore non-JSON lines; stderr already carries human diagnostics.
    }
  }

  logToFile(`[LIB SCAN CLOSED] exit code: ${result.code}`);
  return fail(`Scanner exited with code ${result.code}`);
}

const EMPTY_ART: TrackArt = { found: false, mime: '', dataUrl: '', source: '', error: '' };

export async function writeTrackTags(filePath: string, fields: WriteTagFields): Promise<WriteTagResult> {
  const fail = (error: string): WriteTagResult => ({ success: false, track: null, error });
  if (!isApprovedFile(filePath)) return fail('File is outside the approved library folders');
  const { python, script } = resolveScanInvocation();
  if (!fs.existsSync(script)) return fail('scanner missing');

  const result = await runSidecar(
    python,
    [script, '--set-tag', filePath, JSON.stringify(fields)],
    TAG_TIMEOUT_MS
  );
  for (const line of result.stderr.split('\n')) {
    if (line.trim()) logToFile(`[LIB TAGS] ${line.trim()}`);
  }
  if (result.error) return fail(result.error);

  for (const line of result.lines) {
    try {
      const parsed = JSON.parse(line) as { type?: string; data?: Record<string, unknown> };
      if (parsed.type === 'tag-result' && parsed.data) {
        const d = parsed.data;
        const track = d.track as Partial<Track> | null;
        const updated = track && typeof track.path === 'string' ? (track as Track) : null;
        logToFile(`[LIB TAGS] ${path.basename(filePath)} -> success=${Boolean(d.success)} err=${String(d.error || '')}`);
        if (d.success && updated) {
          try {
            upsertTracks([updated]);
            invalidateTrackArt(filePath);
          } catch (err) {
            logToFile(`[DB] tag upsert failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        return {
          success: Boolean(d.success),
          track: updated,
          error: String(d.error || ''),
        };
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return fail(`Tag writer exited with code ${result.code}`);
}

const ART_CACHE_LIMIT = 300;
const artCache = new Map<string, TrackArt>();
const artInFlight = new Map<string, Promise<TrackArt>>();

export function invalidateTrackArt(filePath: string): void {
  artCache.delete(normalizePathKey(filePath));
}

function rememberArt(key: string, art: TrackArt): TrackArt {
  artCache.delete(key);
  artCache.set(key, art);
  if (artCache.size > ART_CACHE_LIMIT) {
    const oldest = artCache.keys().next().value;
    if (oldest) artCache.delete(oldest);
  }
  return art;
}

function shrinkArtwork(art: TrackArt): TrackArt {
  if (!art.found || !art.dataUrl) return art;
  const comma = art.dataUrl.indexOf(',');
  if (comma < 0) return art;
  try {
    const buffer = Buffer.from(art.dataUrl.slice(comma + 1), 'base64');
    if (buffer.length <= 200_000) return art;
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) return art;
    const size = image.getSize();
    const width = Math.min(256, size.width || 256);
    const resized = image.resize({ width, quality: 'good' });
    if (resized.isEmpty()) return art;
    const jpeg = resized.toJPEG(82);
    if (!jpeg || jpeg.length === 0) return art;
    return {
      ...art,
      mime: 'image/jpeg',
      dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    };
  } catch {
    return art;
  }
}

async function getTrackArtRaw(filePath: string): Promise<TrackArt> {
  const { python, script } = resolveScanInvocation();
  if (!fs.existsSync(script)) return { ...EMPTY_ART, error: 'scanner missing' };

  const result = await runSidecar(python, [script, '--art', filePath], ART_TIMEOUT_MS);
  if (result.error) {
    logToFile(`[LIB ART] ${path.basename(filePath)} -> ${result.error}`);
    return { ...EMPTY_ART, error: result.error };
  }

  for (const line of result.lines) {
    try {
      const parsed = JSON.parse(line) as { type?: string; data?: Record<string, unknown> };
      if (parsed.type === 'art-result' && parsed.data) {
        const d = parsed.data;
        const src = String(d.source || '');
        const art: TrackArt = {
          found: Boolean(d.found),
          mime: String(d.mime || ''),
          dataUrl: String(d.data_url || ''),
          source: src === 'embedded' || src === 'folder' ? src : '',
          error: String(d.error || ''),
        };
        const shrunk = shrinkArtwork(art);
        logToFile(`[LIB ART] ${path.basename(filePath)} -> found=${shrunk.found} source=${shrunk.source} bytes=${shrunk.dataUrl.length}`);
        return shrunk;
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return { ...EMPTY_ART, error: 'no art data' };
}

export function getTrackArt(filePath: string): Promise<TrackArt> {
  if (!isApprovedFile(filePath)) {
    return Promise.resolve({ ...EMPTY_ART, error: 'File is outside the approved library folders' });
  }
  const key = normalizePathKey(filePath);
  const cached = artCache.get(key);
  if (cached) {
    artCache.delete(key);
    artCache.set(key, cached);
    return Promise.resolve(cached);
  }
  const pending = artInFlight.get(key);
  if (pending) return pending;

  const request = getTrackArtRaw(filePath)
    .then((art) => rememberArt(key, art))
    .finally(() => artInFlight.delete(key));
  artInFlight.set(key, request);
  return request;
}
