import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import ColorPicker from './ColorPicker';

interface PersonalizeProps {
  show: boolean;
  onColorChange: (type: 'lineColor' | 'backgroundColor', value: string) => void;
  currentColors: {
    lineColor: string;
    backgroundColor: string;
  };
}

type ColorKey = 'lineColor' | 'backgroundColor';

const ROWS: { key: ColorKey; label: string; hint: string; fallback: string }[] = [
  { key: 'lineColor', label: 'Accent', hint: 'Wave, buttons, highlights', fallback: '#ffffff' },
  { key: 'backgroundColor', label: 'Background', hint: 'Behind the waves', fallback: '#000000' },
];

const Personalize: React.FC<PersonalizeProps> = ({
  show,
  onColorChange,
  currentColors,
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
          {/* Header — sits directly on the popover, no nested surface */}
          <div className="flex items-center gap-2 px-1 pb-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full acc-bg shrink-0" />
            <h2 className="text-sm font-semibold text-white">Colors</h2>
            <span className="text-[11px] text-gray-500 truncate">Theme</span>
          </div>

          {/* Single bordered group with dividers instead of stacked cards */}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Personalize;
