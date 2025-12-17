import React from 'react';
import { Download, X } from 'lucide-react';

interface DownloadButtonProps {
  loading: boolean;
  url: string;
  onDownload: () => void;
  onStop: () => void;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  loading,
  url,
  onDownload,
  onStop,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <button
          onClick={onDownload}
          disabled={loading || !url.trim()}
          className={`flex-1 py-3 px-6 rounded-xl font-semibold text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-2 ${loading || !url.trim()
              ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
              : 'bg-[#50C878] hover:bg-[#45b069] text-white hover:shadow-lg hover:shadow-[#50C878]/30 transform hover:-translate-y-0.5'
            }`}
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-white/30 border-t-white"></div>
              <span>Downloading...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Download</span>
            </>
          )}
        </button>

        {/* Stop Button - only show when downloading */}
        {loading && (
          <button
            onClick={onStop}
            className="py-3 px-6 rounded-xl font-semibold text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-2 bg-red-600/30 hover:bg-red-600/50 border border-red-500/50 text-white hover:shadow-lg hover:shadow-red-500/20"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Stop</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default DownloadButton;
