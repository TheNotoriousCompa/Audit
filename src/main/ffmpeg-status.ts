import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { logToFile } from './logger';
import { detachedOnUnix, killProcessTree } from './process-tree';
import type { FfmpegStatus } from '../types/electron';

const VERSION_TIMEOUT_MS = 3000;
let cached: FfmpegStatus | null = null;
let inFlight: Promise<FfmpegStatus> | null = null;

function executableName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function executableFromEnv(value: string): string[] {
  const raw = value.trim().replace(/^"(.*)"$/, '$1');
  if (!raw) return [];
  try {
    const stat = fs.statSync(raw);
    if (stat.isDirectory()) return [path.join(raw, executableName())];
  } catch {
    // Let the version check report a useful failure for a missing path.
  }
  return [raw];
}

function candidateDirectories(): string[] {
  const appRoot = app.getAppPath();
  const devRoot = path.join(__dirname, '..', '..');
  const dirs = [
    path.join(process.resourcesPath, 'ffmpeg', 'bin'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'ffmpeg', 'bin'),
    path.join(appRoot, 'ffmpeg', 'bin'),
    path.join(devRoot, 'ffmpeg', 'bin'),
    path.join(devRoot, 'ffmpeg'),
    path.join(process.resourcesPath, 'ffmpeg.exe'),
    path.join(appRoot, 'ffmpeg.exe'),
    path.join(devRoot, 'ffmpeg.exe'),
    path.join(process.cwd(), 'ffmpeg', 'bin'),
    path.join(process.cwd(), 'ffmpeg.exe'),
  ];
  try {
    dirs.push(path.join(app.getPath('userData'), 'ffmpeg', 'bin'));
  } catch {
    // app paths are unavailable before ready; the other candidates still work.
  }
  return dirs;
}

function pathCandidates(): string[] {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  return dirs.filter(Boolean).map((dir) => path.join(dir, executableName()));
}

function commonCandidates(): string[] {
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;
    return [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      path.join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
      path.join(programFilesX86, 'ffmpeg', 'bin', 'ffmpeg.exe'),
      ...(localAppData ? [path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')] : []),
      ...(userProfile ? [path.join(userProfile, 'scoop', 'shims', 'ffmpeg.exe')] : []),
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    ];
  }
  return [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ];
}

function candidates(): string[] {
  const env = process.env.AUDIT_FFMPEG_PATH;
  const list = env ? executableFromEnv(env) : [];
  list.push(
    ...candidateDirectories().map((dir) => path.join(dir, executableName())),
    ...pathCandidates(),
    ...commonCandidates()
  );
  return [...new Set(list.map((candidate) => path.resolve(candidate)))];
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function verify(candidate: string): Promise<FfmpegStatus> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(candidate, ['-version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: detachedOnUnix(),
      });
    } catch (err) {
      resolve({
        found: false,
        path: candidate,
        version: '',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let output = '';
    let settled = false;
    const finish = (result: FfmpegStatus): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      killProcessTree(proc);
      finish({ found: false, path: candidate, version: '', error: 'ffmpeg -version timed out' });
    }, VERSION_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    proc.stderr.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    proc.on('error', (err) => {
      finish({ found: false, path: candidate, version: '', error: err.message });
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        finish({
          found: false,
          path: candidate,
          version: '',
          error: `ffmpeg -version exited with code ${code}`,
        });
        return;
      }
      const line = output.split(/\r?\n/).find((entry) => entry.trim().length > 0) || '';
      const match = line.match(/ffmpeg version\s+([^\s]+)/i);
      finish({
        found: true,
        path: candidate,
        version: match ? match[1] : line.trim().slice(0, 120),
        error: '',
      });
    });
  });
}

export function getFfmpegStatus(force = false): Promise<FfmpegStatus> {
  if (!force && cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    for (const candidate of candidates()) {
      if (!isExecutableFile(candidate)) continue;
      const status = await verify(candidate);
      if (status.found) {
        cached = status;
        logToFile(`[FFMPEG] using ${status.path} (${status.version})`);
        return status;
      }
      logToFile(`[FFMPEG] rejected ${candidate}: ${status.error}`);
    }

    const missing: FfmpegStatus = {
      found: false,
      path: '',
      version: '',
      error: 'FFmpeg was not found in the app bundle, AUDIT_FFMPEG_PATH, PATH, or common install locations',
    };
    cached = missing;
    logToFile(`[FFMPEG] ${missing.error}`);
    return missing;
  })();

  try {
    return inFlight;
  } finally {
    void inFlight.finally(() => { inFlight = null; });
  }
}
