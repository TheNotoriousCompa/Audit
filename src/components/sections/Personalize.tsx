import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

type ColorType = 'lineColor' | 'backgroundColor';

interface ColorConfig {
  label: string;
  defaultValue: string;
  description: string;
}

const COLOR_CONFIG: Record<ColorType, ColorConfig> = {
  lineColor: {
    label: 'Wave Line Color',
    defaultValue: '#c2c1c0',
    description: 'Color of the waveform line'
  },
  backgroundColor: {
    label: 'Background Color',
    defaultValue: '#000000',
    description: 'Background color of the waveform'
  }
};

interface PersonalizeProps {
  show: boolean;
  onColorChange: (type: ColorType, value: string) => void;
  currentColors: Record<ColorType, string>;
}

const ColorPicker: React.FC<{
  type: ColorType;
  value: string;
  onChange: (type: ColorType, value: string) => void;
  onReset: (type: ColorType) => void;
}> = ({ type, value, onChange, onReset }) => {
  const config = COLOR_CONFIG[type];
  const inputId = `${type}-input`;
  const colorInputId = `${type}-color`;

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Basic hex color validation
    if (/^#?([0-9A-F]{3}){1,2}$/i.test(newValue.replace('#', '')) || newValue === '') {
      onChange(type, newValue);
    }
  }, [onChange, type]);

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(type, e.target.value);
  }, [onChange, type]);

  const handleReset = useCallback(() => {
    onReset(type);
  }, [onReset, type]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-300">
          {config.label}
        </label>
        <button
          type="button"
          onClick={handleReset}
          className="p-1 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
          title={`Reset ${config.label} to default`}
          aria-label={`Reset ${config.label}`}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center space-x-4">
        <div className="relative">
          <input
            id={colorInputId}
            type="color"
            value={value}
            onChange={handleColorChange}
            className="w-8 h-8 cursor-pointer bg-transparent border-0"
            style={{
              WebkitAppearance: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label={`Select ${config.label}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={handleTextChange}
            className="w-full px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-md text-gray-200 focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none"
            placeholder="#RRGGBB"
            aria-label={`${config.label} value`}
          />
        </div>
      </div>
    </div>
  );
};

const animationConfig = (show: boolean) => ({
  initial: 'hidden',
  animate: show ? 'visible' : 'hidden',
  exit: 'hidden',
  variants: {
    hidden: { 
      opacity: 0, 
      height: 0, 
      marginTop: 0, 
      marginBottom: 0,
      transition: {
        opacity: { duration: 0.2, ease: 'easeInOut' },
        height: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] },
        margin: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }
      }
    },
    visible: {
      opacity: 1,
      height: 'auto',
      marginTop: '1.5rem',
      marginBottom: '0',
      transition: {
        opacity: { duration: 0.3, ease: 'easeInOut' },
        height: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] },
        margin: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }
      }
    }
  }
});

const Personalize: React.FC<PersonalizeProps> = ({
  show,
  onColorChange,
  currentColors,
}) => {
  const [colors, setColors] = useState<Record<ColorType, string>>(currentColors);

  // Update local state when currentColors prop changes
  useEffect(() => {
    setColors(currentColors);
  }, [currentColors]);

  const handleColorChange = useCallback((type: ColorType, value: string) => {
    const formattedValue = value.startsWith('#') ? value : `#${value}`;
    
    setColors(prev => ({
      ...prev,
      [type]: formattedValue
    }));
    onColorChange(type, formattedValue);
  }, [onColorChange]);

  const resetToDefault = useCallback((type: ColorType) => {
    handleColorChange(type, COLOR_CONFIG[type].defaultValue);
  }, [handleColorChange]);

  const colorPickers = useMemo(() => (
    (Object.keys(COLOR_CONFIG) as ColorType[]).map((type) => (
      <ColorPicker
        key={type}
        type={type}
        value={colors[type]}
        onChange={handleColorChange}
        onReset={resetToDefault}
      />
    ))
  ), [colors, handleColorChange, resetToDefault]);

  return (
    <AnimatePresence>
      {show && (
      <motion.div
        {...animationConfig(show)}
        className="overflow-hidden"
        aria-label="Color customization panel"
      >
        <div 
          className="p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg"
          role="region"
          aria-labelledby="personalize-heading"
        >
          <h3 
            id="personalize-heading"
            className="text-lg font-medium text-white mb-6"
          >
            Personalize Colors
          </h3>
          <div className="space-y-6">
            {colorPickers}
          </div>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(Personalize);
