import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdvancedOptionsProps {
  show: boolean;
  format: string;
  setFormat: (format: string) => void;
  quality: string;
  setQuality: (quality: string) => void;
  fps: number | null;
  setFps: (fps: number | null) => void;
}

const AdvancedOptions: React.FC<AdvancedOptionsProps> = ({
  show,
  format,
  setFormat,
  quality,
  setQuality,
  fps,
  setFps,
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
                      <option value="mp3">MP3 (Audio)</option>
                      <option value="mp4">MP4 (Video)</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Quality Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    {format === 'mp4' ? 'Resolution' : 'Bitrate (Quality)'}
                  </label>
                  <div className="relative">
                    <select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-200 text-sm focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none transition-all duration-200 appearance-none hover:bg-white/10 [&_option]:bg-gray-800 [&_option]:text-gray-200"
                    >
                      {format === 'mp4' ? (
                        <>
                          <option value="1080p">1080p</option>
                          <option value="720p">720p</option>
                          <option value="480p">480p</option>
                          <option value="360p">360p</option>
                        </>
                      ) : (
                        <>
                          <option value="320">320 kbps (High Quality)</option>
                          <option value="256">256 kbps</option>
                          <option value="192">192 kbps</option>
                          <option value="128">128 kbps</option>
                        </>
                      )}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* FPS Selection - Only for Video */}
                {format === 'mp4' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Framerate
                    </label>
                    <div className="relative">
                      <select
                        value={fps || ''}
                        onChange={(e) => setFps(e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-200 text-sm focus:ring-1 focus:ring-white/30 focus:border-white/30 outline-none transition-all duration-200 appearance-none hover:bg-white/10 [&_option]:bg-gray-800 [&_option]:text-gray-200"
                      >
                        <option value="">Auto (Default)</option>
                        <option value="60">60 FPS (Smooth)</option>
                        <option value="30">30 FPS</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AdvancedOptions;
