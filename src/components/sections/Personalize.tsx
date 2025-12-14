import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

interface PersonalizeProps {
  show: boolean;
  onColorChange: (type: 'lineColor' | 'backgroundColor', value: string) => void;
  currentColors: {
    lineColor: string;
    backgroundColor: string;
  };
}

const Personalize: React.FC<PersonalizeProps> = ({
  show,
  onColorChange,
  currentColors,
}) => {
  const [colors, setColors] = useState({
    lineColor: currentColors.lineColor,
    backgroundColor: currentColors.backgroundColor,
  });

  // Update local state when currentColors prop changes
  useEffect(() => {
    setColors({
      lineColor: currentColors.lineColor,
      backgroundColor: currentColors.backgroundColor,
    });
  }, [currentColors]);

  const handleColorChange = (type: 'lineColor' | 'backgroundColor', value: string) => {
    // Ensure the color is in the correct format
    const formattedValue = value.startsWith('#') ? value : `#${value}`;
    
    setColors(prev => ({
      ...prev,
      [type]: formattedValue
    }));
    onColorChange(type, formattedValue);
  };

  const resetToDefault = (type: 'lineColor' | 'backgroundColor') => {
    const defaultValue = type === 'lineColor' ? '#50C878' : '#000000';
    handleColorChange(type, defaultValue);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
          animate={{
            opacity: 1,
            height: 'auto',
            marginTop: '1.5rem',
            marginBottom: '0',
            transition: {
              opacity: { duration: 0.3, ease: 'easeInOut' },
              height: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] },
              margin: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }
            }
          }}
          exit={{
            opacity: 0,
            height: 0,
            marginTop: 0,
            marginBottom: 0,
            transition: {
              opacity: { duration: 0.2, ease: 'easeInOut' },
              height: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] },
              margin: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }
            }
          }}
          className="overflow-hidden"
        >
          <div className="p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg">
            <h3 className="text-lg font-medium text-white mb-6">Personalize Colors</h3>
            <div className="space-y-6">
              {/* Line Color Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-300">
                    Wave Line Color
                  </label>
                  <button
                    onClick={() => resetToDefault('lineColor')}
                    className="p-1 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
                    title="Reset to default"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <input
                      type="color"
                      value={colors.lineColor}
                      onChange={(e) => handleColorChange('lineColor', e.target.value)}
                      className="w-8 h-8 cursor-pointer bg-transparent border-0"
                      style={{
                        WebkitAppearance: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                    <div 
                      className="absolute inset-0 pointer-events-none"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={colors.lineColor}
                      onChange={(e) => handleColorChange('lineColor', e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-md text-gray-200 focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Background Color Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-300">
                    Background Color
                  </label>
                  <button
                    onClick={() => resetToDefault('backgroundColor')}
                    className="p-1 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
                    title="Reset to default"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <input
                      type="color"
                      value={colors.backgroundColor}
                      onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
                      className="w-8 h-8 cursor-pointer bg-transparent border-0"
                      style={{
                        WebkitAppearance: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                    <div 
                      className="absolute inset-0 pointer-events-none"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={colors.backgroundColor}
                      onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-md text-gray-200 focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Personalize;
