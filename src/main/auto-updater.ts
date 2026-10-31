import { app, autoUpdater, net } from 'electron';
import path from 'path';
import fs from 'fs';
import isDev from 'electron-is-dev';
import { getMainWindow } from './window';
import { logToFile } from './logger';
import type { UpdateState } from '../types/electron';

const REPO = 'TheNotoriousCompa/Audit';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let initialized = false;
let scheduled = false;
let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  canAutoUpdate: false,
};

function updateExePath(): string {
  return path.join(path.dirname(process.execPath), '..', 'Update.exe');
}

function canAutoUpdate(): boolean {
  try {
    return app.isPackaged && fs.existsSync(updateExePath());
  } catch {
    return false;
  }
}

function currentVersion(): string {
  return app.getVersion().replace(/^v/i, '');
}

function versionParts(value: string): number[] {
  return value.replace(/^v/i, '').split('.').map((part) => {
    const match = part.match(/^\d+/);
    return match ? Number(match[0]) : 0;
  });
}

function isNewer(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left !== right) return left > right;
  }
  return false;
}

function broadcast(): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:state', state);
  }
}

function setState(next: Partial<UpdateState>): UpdateState {
  state = { ...state, ...next, currentVersion: currentVersion() };
  broadcast();
  return state;
}

function configureFeed(): void {
  autoUpdater.setFeedURL({
    url: `https://update.electronjs.org/${REPO}/win32-${process.arch}/${currentVersion()}`,
    headers: { 'User-Agent': `Audit/${currentVersion()}` },
    serverType: 'default',
  });
}

function installAutoUpdaterListeners(): void {
  if (initialized) return;
  initialized = true;
  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'downloading', error: undefined });
  });
  autoUpdater.on('update-available', () => {
    setState({ status: 'downloading', error: undefined });
  });
  autoUpdater.on('update-not-available', () => {
    setState({ status: 'not-available' });
  });
  autoUpdater.on('update-downloaded', (_event, notes, name) => {
    const versionMatch = typeof name === 'string' ? name.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/) : null;
    setState({
      status: 'ready',
      availableVersion: versionMatch?.[0] || state.availableVersion,
      releaseNotes: typeof notes === 'string' ? notes : state.releaseNotes,
      error: undefined,
    });
  });
  autoUpdater.on('error', (err) => {
    logToFile(`[UPDATER] ${err instanceof Error ? err.message : String(err)}`);
    setState({ status: 'error', error: err instanceof Error ? err.message : 'Update download failed' });
  });
}

export function getUpdateState(): UpdateState {
  return state;
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!canAutoUpdate()) {
    return setState({ status: 'unsupported', canAutoUpdate: false });
  }
  setState({ status: 'checking', error: undefined, canAutoUpdate: true });
  try {
    const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Audit/${currentVersion()}`,
      },
    });
    if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`);
    const release = await response.json() as {
      tag_name?: string;
      body?: string;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
    };
    if (release.draft || release.prerelease || !release.tag_name) {
      return setState({ status: 'not-available', canAutoUpdate: true });
    }
    const latest = release.tag_name.replace(/^v/i, '');
    if (isNewer(latest, currentVersion())) {
      return setState({
        status: 'available',
        availableVersion: latest,
        releaseNotes: release.body || '',
        releaseUrl: release.html_url,
        canAutoUpdate: true,
        error: undefined,
      });
    }
    return setState({ status: 'not-available', canAutoUpdate: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not check for updates';
    logToFile(`[UPDATER] ${message}`);
    return setState({ status: 'error', error: message, canAutoUpdate: true });
  }
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!canAutoUpdate()) {
    return setState({ status: 'unsupported', canAutoUpdate: false });
  }
  if (state.status !== 'available') return state;
  installAutoUpdaterListeners();
  configureFeed();
  setState({ status: 'downloading', error: undefined });
  try {
    autoUpdater.checkForUpdates();
  } catch (err) {
    setState({
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not start the update download',
    });
  }
  return state;
}

export function restartForUpdate(): boolean {
  if (state.status !== 'ready') return false;
  autoUpdater.quitAndInstall();
  return true;
}

function scheduleChecks(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { void checkForUpdates(); }, 8000);
  setInterval(() => { void checkForUpdates(); }, CHECK_INTERVAL_MS).unref?.();
}

export function initAutoUpdater(): void {
  state = {
    status: 'idle',
    currentVersion: currentVersion(),
    canAutoUpdate: canAutoUpdate(),
  };
  if (isDev) {
    setState({ status: 'unsupported' });
    return;
  }
  if (!canAutoUpdate()) {
    logToFile('[UPDATER] Portable build: Squirrel Update.exe not found');
    setState({ status: 'unsupported' });
    return;
  }
  installAutoUpdaterListeners();
  app.whenReady().then(scheduleChecks);
}
