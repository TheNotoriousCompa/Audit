import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdvancedOptionsProps {
  show: boolean;
  format: string;
  setFormat: (format: string) => void;
  bitrate: number;
  setBitrate: (bitrate: number) => void;
  timeout: number;
  setTimeout: (timeout: number) => void;
  skipExisting: boolean;
  setSkipExisting: (skip: boolean) => void;
}

const AdvancedOptions: React.FC<AdvancedOptionsProps> = ({
  show,
  format,
  setFormat,
  bitrate,
  setBitrate,
  timeout,
  setTimeout,
  skipExisting,
  setSkipExisting,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={containerRef}
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Format Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Format
                  </label>
                  <div className="relative">
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-200 text-sm focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none transition-all duration-200 appearance-none hover:bg-white/10 [&_option]:bg-gray-800 [&_option]:text-gray-200"
                    >
                      <option value="mp3">MP3 (Best compatibility)</option>
                      <option value="m4a">M4A (AAC)</option>
                      <option value="flac">FLAC (Lossless)</option>
                      <option value="wav">WAV (Uncompressed)</option>
                      <option value="opus">Opus (Efficient)</option>
                      <option value="best">Best Available</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Bitrate Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Bitrate
                  </label>
                  <div className="relative">
                    <select
                      value={bitrate}
                      onChange={(e) => setBitrate(Number(e.target.value))}
                      disabled={!['mp3', 'opus'].includes(format)}
                      className={`w-full px-4 py-2.5 bg-white/5 border ${
                        !['mp3', 'opus'].includes(format) ? 'border-white/5' : 'border-white/10'
                      } rounded-xl text-gray-200 text-sm focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none transition-all duration-200 appearance-none hover:bg-white/10 [&_option]:bg-gray-800 [&_option]:text-gray-200`}
                    >
                      <option value="128">128 kbps</option>
                      <option value="192">192 kbps</option>
                      <option value="256">256 kbps</option>
                      <option value="320">320 kbps (Best)</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Timeout Setting */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Timeout (seconds)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={timeout}
                      onChange={(e) => setTimeout(Number(e.target.value))}
                      min="30"
                      step="30"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-200 text-sm focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none transition-all duration-200 hover:bg-white/10"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-xs text-gray-500">sec</span>
                    </div>
                  </div>
                </div>

                {/* Skip Existing Files Toggle */}
                <div className="flex items-center pt-2">
                  <div className="flex items-center h-5">
                    <input
                      id="skipExisting"
                      type="checkbox"
                      checked={skipExisting}
                      onChange={(e) => setSkipExisting(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-white/90 focus:ring-1 focus:ring-white/30 focus:ring-offset-0 transition"
                    />
                  </div>
                  <label htmlFor="skipExisting" className="ml-3 text-sm text-gray-300">
                    Skip existing files
                    <p className="text-xs text-gray-500 mt-0.5">Prevents re-downloading files that already exist</p>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AdvancedOptions;
