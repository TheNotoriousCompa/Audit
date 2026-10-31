import type { CSSProperties } from 'react';
import type { AuditTheme, AuditThemeTokens } from '@/types/electron';

export const DEFAULT_THEME_ID = 'default';

export function accentContrast(hex: string): string {
  const full = hex.replace('#', '');
  const expanded = full.length === 3 ? full.split('').map((c) => c + c).join('') : full.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return '#ffffff';
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#0b0b0d' : '#ffffff';
}

export function themeStyle(theme: AuditTheme): CSSProperties {
  const t = theme.tokens;
  const background = t.background || '#000000';
  const surface = t.surface || '#101012';
  const surfaceStrong = t.surfaceStrong || surface;
  const text = t.text || '#ffffff';
  const muted = t.muted || '#9ca3af';
  const border = t.border || 'rgba(255,255,255,0.12)';
  const accent = t.accent || '#ffffff';
  const accentOn = t.accentContrast || accentContrast(accent);
  return {
    '--audit-accent': accent,
    '--audit-accent-contrast': accentOn,
    '--theme-bg': background,
    '--theme-surface': surface,
    '--theme-surface-strong': surfaceStrong,
    '--theme-text': text,
    '--theme-muted': muted,
    '--theme-border': border,
    '--theme-radius': `${t.radius ?? 10}px`,
    // Tailwind's palette is variable-based. Remapping it here themes the
    // existing components without rewriting every utility class.
    '--color-white': text,
    '--color-gray-100': text,
    '--color-gray-200': text,
    '--color-gray-300': text,
    '--color-gray-400': muted,
    '--color-gray-500': muted,
    '--color-gray-600': muted,
    '--color-gray-700': surfaceStrong,
    '--color-gray-800': surface,
    '--color-gray-900': background,
    '--color-zinc-900': background,
    '--color-zinc-950': background,
    '--color-black': surfaceStrong,
    fontFamily: t.fontFamily || undefined,
  } as CSSProperties;
}

export function themeClasses(theme: AuditTheme): string {
  const classes: string[] = [];
  if (theme.tokens.glass === false) classes.push('theme-flat');
  if ((theme.tokens.radius ?? 10) === 0) classes.push('theme-square');
  if (theme.tokens.decor === 'pixel') classes.push('theme-pixel');
  return classes.join(' ');
}

export function themeSwatches(theme: AuditTheme, fallbackAccent: string): string[] {
  const t = theme.tokens;
  return [
    t.background || '#000000',
    t.surface || '#101012',
    t.accent || fallbackAccent,
    t.text || '#ffffff',
  ];
}

export function themeFromColors(
  colors: { lineColor: string; backgroundColor: string },
  backgroundImage?: string | null,
): AuditTheme {
  return {
    schemaVersion: 1,
    id: `custom-${Date.now()}`,
    name: 'My Audit theme',
    version: '1.0.0',
    description: 'Created from the current Audit appearance.',
    tokens: {
      background: colors.backgroundColor,
      backgroundImage: backgroundImage || undefined,
      surface: '#101012',
      surfaceStrong: '#18181b',
      text: '#ffffff',
      muted: '#9ca3af',
      accent: colors.lineColor,
      accentContrast: accentContrast(colors.lineColor),
      border: 'rgba(255,255,255,0.12)',
      fontFamily: 'system-ui, sans-serif',
      radius: 10,
      glass: true,
      waves: true,
    },
  };
}

export function themeDefaultTokens(): AuditThemeTokens {
  return {
    background: '#000000',
    surface: '#101012',
    surfaceStrong: '#18181b',
    text: '#ffffff',
    muted: '#9ca3af',
    accent: '#ffffff',
    accentContrast: '#0b0b0d',
    border: 'rgba(255,255,255,0.12)',
    fontFamily: 'system-ui, sans-serif',
    radius: 10,
    glass: true,
    waves: true,
  };
}
