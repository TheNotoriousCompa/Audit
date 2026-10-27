import * as fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { app } from 'electron';
import isDev from 'electron-is-dev';
import { logToFile } from './logger';
import type { LibraryCache, LibraryScanResult, Track, TrackArt, WriteTagFields, WriteTagResult } from '../types/electron';
import { initDb, listTracks, upsertTracks, replaceRoots, getRoots, getMeta, setMeta, importLibraryCache } from './db';

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
    upsertTracks(cache.tracks);
    replaceRoots(cache.roots);
    setMeta('scannedAt', String(Date.now()));
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

export function scanLibrary(dir: string): Promise<LibraryScanResult> {
  return new Promise((resolve) => {
    const fail = (error: string): void => {
      resolve({ success: false, root: dir, count: 0, tracks: [], error });
    };

    let statOk = false;
    try {
      statOk = fs.statSync(dir).isDirectory();
    } catch {
      statOk = false;
    }
    if (!statOk) return fail(`Not a directory: ${dir}`);

    const { python, script } = resolveScanInvocation();
    if (!fs.existsSync(script)) return fail(`Scanner script missing: ${script}`);

    let proc;
    try {
      proc = spawn(python, [script, dir], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Failed to start scanner: ${msg}`);
    }

    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) logToFile(`[LIB SCAN] ${line}`);
    });
    proc.on('error', (err) => {
      logToFile(`[LIB SCAN SPAWN ERROR] ${err.message}`);
      fail(`Failed to start scanner: ${err.message}`);
    });
    proc.on('close', (code) => {
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'scan-result' && parsed.data) {
            const data = parsed.data as LibraryScanResult;
            return resolve({
              success: Boolean(data.success),
              root: String(data.root || dir),
              count: Number(data.count || 0),
              tracks: Array.isArray(data.tracks) ? data.tracks : [],
              error: String(data.error || ''),
            });
          }
        } catch {
          // keep scanning lines
        }
      }
      logToFile(`[LIB SCAN CLOSED] exit code: ${code}`);
      fail(`Scanner exited with code ${code}`);
    });
  });
}

const EMPTY_ART: TrackArt = { found: false, mime: '', dataUrl: '', source: '', error: '' };

export function writeTrackTags(filePath: string, fields: WriteTagFields): Promise<WriteTagResult> {
  return new Promise((resolve) => {
    const fail = (error: string): void => resolve({ success: false, track: null, error });
    const { python, script } = resolveScanInvocation();
    if (!fs.existsSync(script)) return fail('scanner missing');

    let proc;
    try {
      proc = spawn(python, [script, '--set-tag', filePath, JSON.stringify(fields)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
    } catch (err) {
      return fail(`Failed to start tag writer: ${err instanceof Error ? err.message : String(err)}`);
    }

    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) logToFile(`[LIB TAGS] ${line}`);
    });
    proc.on('error', (err) => fail(`Tag writer failed: ${err.message}`));
    proc.on('close', (code) => {
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'tag-result' && parsed.data) {
            const d = parsed.data;
            const t = d.track as Partial<Track> | null;
            logToFile(`[LIB TAGS] ${filePath.split(/[/\\]/).pop()} -> success=${Boolean(d.success)} err=${String(d.error || '')}`);
            return resolve({
              success: Boolean(d.success),
              track: t && typeof t.path === 'string' ? (t as Track) : null,
              error: String(d.error || ''),
            });
          }
        } catch {
          // keep scanning lines
        }
      }
      fail(`Tag writer exited with code ${code}`);
    });
  });
}

export function getTrackArt(filePath: string): Promise<TrackArt> {
  return new Promise((resolve) => {
    const { python, script } = resolveScanInvocation();
    if (!fs.existsSync(script)) return resolve({ ...EMPTY_ART, error: 'scanner missing' });

    let proc;
    try {
      proc = spawn(python, [script, '--art', filePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return resolve({ ...EMPTY_ART, error: msg });
    }

    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.on('error', () => resolve({ ...EMPTY_ART, error: 'spawn failed' }));
    proc.on('close', () => {
      let outcome = 'no art data';
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'art-result' && parsed.data) {
            const d = parsed.data;
            const src = String(d.source || '');
            outcome = `found=${Boolean(d.found)} source=${src} bytes=${String(d.data_url || '').length} err=${String(d.error || '')}`;
            logToFile(`[LIB ART] ${filePath.split(/[/\\]/).pop()} -> ${outcome}`);
            return resolve({
              found: Boolean(d.found),
              mime: String(d.mime || ''),
              dataUrl: String(d.data_url || ''),
              source: src === 'embedded' || src === 'folder' ? src : '',
              error: String(d.error || ''),
            });
          }
        } catch {
          // keep scanning lines
        }
      }
      logToFile(`[LIB ART] ${filePath.split(/[/\\]/).pop()} -> ${outcome}`);
      resolve({ ...EMPTY_ART, error: 'no art data' });
    });
  });
}
