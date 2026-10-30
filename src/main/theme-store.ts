import { app, dialog, nativeImage, shell, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import fs from 'fs';
import path from 'path';
import type { AuditTheme, AuditThemeTokens, ThemeBackgroundResult, ThemeImportResult } from '../types/electron';

const MAX_THEME_BYTES = 4 * 1024 * 1024;
const RESERVED_IDS = new Set(['default']);
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONT_RE = /^[a-zA-Z0-9 ,'"_.-]{1,120}$/;
const BACKGROUND_RE = /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/;
const MAX_BACKGROUND_CHARS = 3 * 1024 * 1024;

const COLOR_KEYS = [
  'background',
  'surface',
  'surfaceStrong',
  'text',
  'muted',
  'accent',
  'accentContrast',
  'border',
] as const;

function themesDir(): string {
  return path.join(app.getPath('userData'), 'themes');
}

function ensureThemesDir(): string {
  const dir = themesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readTheme(raw: unknown): AuditTheme | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 1) return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!ID_RE.test(id) || RESERVED_IDS.has(id.toLowerCase())) return null;
  if (!name || name.length > 64) return null;

  const rawTokens = value.tokens;
  if (!rawTokens || typeof rawTokens !== 'object') return null;
  const tokens: AuditThemeTokens = {};
  const t = rawTokens as Record<string, unknown>;

  for (const key of COLOR_KEYS) {
    const token = t[key];
    if (token === undefined) continue;
    if (typeof token !== 'string' || !COLOR_RE.test(token)) return null;
    tokens[key] = token;
  }

  if (t.backgroundImage !== undefined) {
    if (typeof t.backgroundImage !== 'string') return null;
    if (t.backgroundImage.length > MAX_BACKGROUND_CHARS || !BACKGROUND_RE.test(t.backgroundImage)) return null;
    tokens.backgroundImage = t.backgroundImage;
  }

  if (t.fontFamily !== undefined) {
    if (typeof t.fontFamily !== 'string' || !FONT_RE.test(t.fontFamily.trim())) return null;
    tokens.fontFamily = t.fontFamily.trim();
  }
  if (t.radius !== undefined) {
    if (typeof t.radius !== 'number' || !Number.isFinite(t.radius) || t.radius < 0 || t.radius > 32) return null;
    tokens.radius = Math.round(t.radius);
  }
  for (const key of ['glass', 'waves'] as const) {
    if (t[key] !== undefined) {
      if (typeof t[key] !== 'boolean') return null;
      tokens[key] = Boolean(t[key]);
    }
  }

  const theme: AuditTheme = { schemaVersion: 1, id, name, tokens };
  if (typeof value.author === 'string' && value.author.trim()) theme.author = value.author.trim().slice(0, 80);
  if (typeof value.version === 'string' && value.version.trim()) theme.version = value.version.trim().slice(0, 32);
  if (typeof value.description === 'string' && value.description.trim()) {
    theme.description = value.description.trim().slice(0, 240);
  }
  return theme;
}

function readThemeFile(filePath: string): AuditTheme | null {
  try {
    if (fs.statSync(filePath).size > MAX_THEME_BYTES) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return readTheme(raw);
  } catch {
    return null;
  }
}

export function listThemes(): AuditTheme[] {
  try {
    const dir = ensureThemesDir();
    return fs.readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .map((name) => readThemeFile(path.join(dir, name)))
      .filter((theme): theme is AuditTheme => Boolean(theme))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function importTheme(win: BrowserWindow | null): Promise<ThemeImportResult> {
  const options: OpenDialogOptions = {
    properties: ['openFile'],
    title: 'Import Audit theme',
    buttonLabel: 'Import theme',
    filters: [{ name: 'Audit theme', extensions: ['json', 'audit-theme'] }],
  };
  try {
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, themes: listThemes() };
    }
    const filePath = result.filePaths[0];
    if (fs.statSync(filePath).size > MAX_THEME_BYTES) {
      return { success: false, themes: listThemes(), error: 'Theme file is too large (max 4 MB)' };
    }
    const theme = readThemeFile(filePath);
    if (!theme) {
      return { success: false, themes: listThemes(), error: 'Invalid theme file. Check schemaVersion and tokens.' };
    }
    ensureThemesDir();
    fs.writeFileSync(path.join(themesDir(), `${theme.id}.json`), JSON.stringify(theme, null, 2), 'utf8');
    return { success: true, themes: listThemes(), imported: theme };
  } catch (err) {
    return {
      success: false,
      themes: listThemes(),
      error: err instanceof Error ? err.message : 'Could not import theme',
    };
  }
}

export async function exportTheme(win: BrowserWindow | null, theme: AuditTheme): Promise<boolean> {
  const safe = readTheme(theme);
  if (!safe) return false;
  const options: SaveDialogOptions = {
    title: 'Export Audit theme',
    defaultPath: `${safe.name.replace(/[^\w.-]+/g, '-').toLowerCase()}.audit-theme.json`,
    filters: [{ name: 'Audit theme', extensions: ['json'] }],
  };
  try {
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, JSON.stringify(safe, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function deleteTheme(id: string): AuditTheme[] {
  if (!ID_RE.test(id) || RESERVED_IDS.has(id.toLowerCase())) return listThemes();
  try {
    fs.unlinkSync(path.join(ensureThemesDir(), `${id}.json`));
  } catch {
    // already gone
  }
  return listThemes();
}

export async function pickThemeBackground(win: BrowserWindow | null): Promise<ThemeBackgroundResult> {
  const options: OpenDialogOptions = {
    properties: ['openFile'],
    title: 'Choose a theme background',
    buttonLabel: 'Use image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  };
  try {
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false };
    }
    const source = nativeImage.createFromPath(result.filePaths[0]);
    if (source.isEmpty()) return { success: false, error: 'Unsupported image file' };
    const sized = source.resize({ width: 1600, quality: 'good' });
    const jpeg = sized.toJPEG(82);
    if (jpeg.length > 2.8 * 1024 * 1024) {
      return { success: false, error: 'Image is too large after resizing. Use a smaller file.' };
    }
    return { success: true, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not read image' };
  }
}

export async function openThemesFolder(): Promise<boolean> {
  try {
    const error = await shell.openPath(ensureThemesDir());
    return !error;
  } catch {
    return false;
  }
}



