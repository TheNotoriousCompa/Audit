import React from 'react';

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
  if (!show) return null;

  return (
    <div className="mt-4 p-4 bg-gray-800/30 rounded-xl border border-gray-700/50 space-y-4">
      <h3 className="text-sm font-medium text-gray-300">Advanced Options</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
            >
              <option value="mp3">MP3 (Best compatibility)</option>
              <option value="m4a">M4A (AAC)</option>
              <option value="flac">FLAC (Lossless)</option>
              <option value="wav">WAV (Uncompressed)</option>
              <option value="opus">Opus (Efficient)</option>
              <option value="best">Best Available</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Bitrate (kbps)
            </label>
            <select
              value={bitrate}
              onChange={(e) => setBitrate(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
              disabled={!['mp3', 'opus'].includes(format)}
            >
              <option value="128">128 kbps</option>
              <option value="192">192 kbps</option>
              <option value="256">256 kbps</option>
              <option value="320">320 kbps (Best)</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs sm:text-sm text-gray-400">Timeout (seconds)</label>
          <input
            type="number"
            value={timeout}
            onChange={(e) => setTimeout(Number(e.target.value))}
            min="30"
            step="30"
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>
      <div className="flex items-center">
        <input
          type="checkbox"
          id="skipExisting"
          checked={skipExisting}
          onChange={(e) => setSkipExisting(e.target.checked)}
          className="h-4 w-4 text-blue-500 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
        />
        <label htmlFor="skipExisting" className="ml-2 text-xs sm:text-sm text-gray-300">
          Skip existing files
        </label>
      </div>
    </div>
  );
};

export default AdvancedOptions;
