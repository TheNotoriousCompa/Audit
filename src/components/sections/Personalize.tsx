import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Upload, Download, FolderOpen, Trash2, Check, Image as ImageIcon } from 'lucide-react';
import ColorPicker from './ColorPicker';
import { DEFAULT_THEME_ID, themeSwatches } from '@/components/theme';
import type { AuditTheme } from '@/types/electron';

interface PersonalizeProps {
  show: boolean;
  onColorChange: (type: 'lineColor' | 'backgroundColor', value: string) => void;
  currentColors: {
    lineColor: string;
    backgroundColor: string;
  };
  themes: AuditTheme[];
  activeThemeId: string;
  onSelectTheme: (id: string) => void;
  onImportTheme: () => void;
  onExportTheme: () => void;
  onDeleteTheme: (id: string) => void;
  onOpenThemesFolder: () => void;
  onPickBackground: () => void;
  onClearBackground: () => void;
  hasBackgroundImage: boolean;
  message?: string | null;
}

type ColorKey = 'lineColor' | 'backgroundColor';

const ROWS: { key: ColorKey; label: string; hint: string; fallback: string }[] = [
  { key: 'lineColor', label: 'Accent', hint: 'Wave, buttons, highlights', fallback: '#ffffff' },
  { key: 'backgroundColor', label: 'Background', hint: 'Behind the waves', fallback: '#000000' },
];

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="flex -space-x-1 shrink-0">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="w-3 h-3 rounded-full ring-1 ring-black/30"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function ThemeRow({
  name,
  hint,
  colors,
  active,
  onClick,
  onRemove,
}: {
  name: string;
  hint: string;
  colors: string[];
  active: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={`flex items-center gap-1 px-2 py-2 transition-colors ${active ? 'bg-white/5' : ''}`}>
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-2 text-left rounded-lg px-1 py-0.5 hover:bg-white/5 transition-colors"
      >
        <Swatches colors={colors} />
        <span className="flex-1 min-w-0">
          <span className="block text-xs text-gray-200 truncate">{name}</span>
          <span className="block text-[10px] text-gray-500 truncate">{hint}</span>
        </span>
        {active && <Check className="w-3.5 h-3.5 acc-text shrink-0" />}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`Remove ${name}`}
          className="p-1 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

const Personalize: React.FC<PersonalizeProps> = ({
  show,
  onColorChange,
  currentColors,
  themes,
  activeThemeId,
  onSelectTheme,
  onImportTheme,
  onExportTheme,
  onDeleteTheme,
  onOpenThemesFolder,
  onPickBackground,
  onClearBackground,
  hasBackgroundImage,
  message,
}) => {
  const [colors, setColors] = useState({
    lineColor: currentColors.lineColor,
    backgroundColor: currentColors.backgroundColor,
  });
  const [openPicker, setOpenPicker] = useState<ColorKey | null>(null);

  // Update local state when currentColors prop changes
  useEffect(() => {
    setColors({
      lineColor: currentColors.lineColor,
      backgroundColor: currentColors.backgroundColor,
    });
  }, [currentColors]);

  const handleColorChange = (type: ColorKey, value: string) => {
    const formattedValue = value.startsWith('#') ? value : `#${value}`;
    setColors((prev) => ({ ...prev, [type]: formattedValue }));
    onColorChange(type, formattedValue);
  };

  const resetToDefault = (type: ColorKey) => {
    const row = ROWS.find((r) => r.key === type);
    handleColorChange(type, row?.fallback ?? '#000000');
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: 'easeIn' } }}
          className="w-full"
        >
          <div className="flex items-center gap-2 px-1 pb-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full acc-bg shrink-0" />
            <h2 className="text-sm font-semibold text-white">Themes</h2>
            <span className="text-[11px] text-gray-500 truncate">Offline</span>
            <button
              type="button"
              onClick={onOpenThemesFolder}
              title="Open themes folder"
              className="ml-auto p-1 rounded-lg text-gray-500 acc-hover-text transition-colors shrink-0"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="rounded-xl border border-white/5 divide-y divide-white/5">
            <ThemeRow
              name="Default"
              hint="Frosted glass, current colors"
              colors={[currentColors.backgroundColor, '#101012', currentColors.lineColor, '#ffffff']}
              active={activeThemeId === DEFAULT_THEME_ID}
              onClick={() => onSelectTheme(DEFAULT_THEME_ID)}
            />
            {themes.map((theme) => (
              <ThemeRow
                key={theme.id}
                name={theme.name}
                hint={[theme.author, theme.version ? `v${theme.version}` : ''].filter(Boolean).join(' / ') || 'Imported theme'}
                colors={themeSwatches(theme, currentColors.lineColor)}
                active={activeThemeId === theme.id}
                onClick={() => onSelectTheme(theme.id)}
                onRemove={() => onDeleteTheme(theme.id)}
              />
            ))}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onImportTheme}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] text-gray-200 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </button>
            <button
              type="button"
              onClick={onExportTheme}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] text-gray-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>

          <div className="flex items-center gap-2 px-1 py-1">
            <ImageIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="text-[11px] text-gray-300 flex-1 min-w-0">Background image</span>
            <button
              type="button"
              onClick={onPickBackground}
              className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] text-gray-200 transition-colors"
            >
              Choose
            </button>
            {hasBackgroundImage && (
              <button
                type="button"
                onClick={onClearBackground}
                className="px-2 py-1 rounded-lg text-[10px] text-gray-500 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {message && <div className="px-1 text-[10px] text-gray-400 break-words">{message}</div>}
          <div className="px-1 text-[10px] text-gray-500">
            Themes are local files. The app never downloads them.
          </div>

          <div className="flex items-center gap-2 px-1 pt-1 pb-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full acc-bg shrink-0" />
            <h2 className="text-sm font-semibold text-white">Colors</h2>
            <span className="text-[11px] text-gray-500 truncate">Default theme</span>
          </div>

          <div className="rounded-xl border border-white/5 divide-y divide-white/5">
            {ROWS.map(({ key, label, hint }) => {
              const expanded = openPicker === key;
              return (
                <div key={key}>
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setOpenPicker(expanded ? null : key)}
                      aria-expanded={expanded}
                      title={`${label} color`}
                      className={`relative w-6 h-6 rounded-full overflow-hidden shrink-0 cursor-pointer transition-shadow ${
                        expanded ? 'ring-2 ring-white/70' : 'ring-1 ring-white/15 hover:ring-white/40'
                      }`}
                    >
                      <span className="absolute inset-0" style={{ background: colors[key] }} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200">{label}</div>
                      <div className="text-[10px] text-gray-500 truncate">{hint}</div>
                    </div>

                    <input
                      type="text"
                      value={colors[key]}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      spellCheck={false}
                      className="w-[74px] px-1.5 py-1 text-[11px] font-mono text-center bg-white/5 border border-white/10 rounded-md text-gray-200 outline-none focus:ring-1 focus:ring-white/20"
                    />

                    <button
                      type="button"
                      onClick={() => resetToDefault(key)}
                      className="p-1 rounded-lg text-gray-500 acc-hover-text transition-colors shrink-0"
                      title="Reset to default"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expanded && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
                      className="px-3 pb-3"
                    >
                      <ColorPicker
                        value={colors[key]}
                        onChange={(hex) => handleColorChange(key, hex)}
                      />
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
          {activeThemeId !== DEFAULT_THEME_ID && (
            <div className="px-1 text-[10px] text-gray-500">
              These colors apply to the Default theme. Imported themes use their own palette.
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Personalize;
