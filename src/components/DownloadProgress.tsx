import * as React from 'react';
import type { DownloadProgress, DownloadStatus } from '@/types/electron';

type ProgressData = Partial<DownloadProgress> & {
  // Add any additional properties specific to this component
  filename?: string;
};

interface DownloadProgressProps {
  progress?: ProgressData;
  className?: string;
}

const DownloadProgress: React.FC<DownloadProgressProps> = ({ progress = {}, className = '' }) => {
  // Format file size for display
  const formatBytes = (bytes: number, decimals = 1): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
  };

  // Format time (MM:SS)
  const formatTime = (eta: number | string | undefined): string => {
    if (eta === undefined || eta === null) return '--:--';
    
    // If it's already a string in MM:SS format, return as is
    if (typeof eta === 'string' && /^\d+:\d{2}$/.test(eta)) return eta;
    
    // If it's a number (seconds), convert to MM:SS
    const seconds = typeof eta === 'string' ? parseInt(eta, 10) : eta;
    if (!isNaN(seconds) && seconds >= 0) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    
    return '--:--';
  };

  // Get appropriate color based on status
  const getStatusColor = (status: DownloadStatus): string => {
    switch (status) {
      case 'downloading': return 'bg-blue-500';
      case 'converting': return 'bg-purple-500';
      case 'finished': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'idle' as DownloadStatus:
      case 'starting' as DownloadStatus:
      default: return 'bg-gray-500';
    }
  };

  // Process and normalize progress data
  const getProgressData = () => {
    // Default values
    let percentage = 0;
    let status: DownloadStatus = 'idle' as DownloadStatus;
    
    // Calculate percentage from available data
    if (progress?._percent_str) {
      const percentStr = progress._percent_str.replace(/[^\d.]/g, '');
      percentage = Math.min(100, Math.max(0, parseFloat(percentStr) || 0));
    } else if (typeof progress?.percentage === 'number') {
      percentage = Math.min(100, Math.max(0, progress.percentage));
    }
    
    // Determine status with better type safety
    if (progress?.status) {
      status = progress.status;
    } else if (percentage > 0 && percentage < 100) {
      status = 'downloading';
    } else if (percentage === 100) {
      status = 'finished';
    }
    
    // Get the best available speed string
    const speedStr = progress?._speed_str || progress?.speed || '0 B/s';
    
    // Get the best available file size information
    const downloadedBytes = progress?.downloaded_bytes || progress?.downloaded || 0;
    const totalBytes = progress?.total_bytes || progress?.total || 0;
    
    // Format the status message
    let statusMessage = progress?.message || '';
    if (!statusMessage) {
      switch (status) {
        case 'downloading':
          statusMessage = 'Downloading...';
          break;
        case 'converting':
          statusMessage = 'Converting...';
          break;
        case 'finished':
          statusMessage = 'Download completed';
          break;
        case 'error':
          statusMessage = 'An error occurred';
          break;
        default:
          statusMessage = 'Ready';
      }
    }
    
    // Handle playlist information if available
    let playlistInfo = '';
    if (progress?.totalItems && progress.totalItems > 1) {
      const current = (progress.currentItem || 0) + 1;
      const total = progress.totalItems;
      playlistInfo = `(${current} of ${total}) `;
    }
    
    // Get current file name if available and ensure it has .mp3 extension
    const currentFile = (progress?.currentFile || progress?.filename || '').replace(/\.(webm|m4a|mp4)$/i, '.mp3');
    
    // Get formatted ETA
    const eta = progress?._eta_str || formatTime(progress?.eta);
    
    return {
      percentage,
      status,
      speed: speedStr,
      eta,
      downloaded: downloadedBytes,
      total: totalBytes,
      message: statusMessage,
      playlistInfo,
      currentFile
    };
  };

  const {
    percentage,
    status,
    speed,
    eta,
    downloaded,
    total,
    message,
    playlistInfo,
    currentFile
  } = getProgressData();

  // Animate progress bar
  const [displayPercentage, setDisplayPercentage] = React.useState(0);
  React.useEffect(() => {
    const timer = setTimeout(() => setDisplayPercentage(percentage), 50);
    return () => clearTimeout(timer);
  }, [percentage]);

  // Show success message when download completes
  const [showSuccess, setShowSuccess] = React.useState(false);
  React.useEffect(() => {
    if (status === 'finished') {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Don't show anything if there's no active download and no message
  const shouldHide = !showSuccess && !message && (!status || status === ('idle' as DownloadStatus));
  if (shouldHide) {
    return null;
  }

  return (
    <div className={`w-full space-y-3 p-4 bg-black-800/30 rounded-lg ${className}`}>
      {/* Success notification */}
      {showSuccess && (
        <div className="mb-3 p-2 bg-green-500/20 border border-green-500/50 rounded text-sm text-green-200">
          {message || 'Download completed successfully!'}
        </div>
      )}

      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(status)}`} />
          <span className="text-sm font-medium text-gray-200">
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {playlistInfo && <span className="text-gray-400 ml-1">{playlistInfo}</span>}
          </span>
        </div>
      </div>

      {/* Current file name */}
      {currentFile && (
        <div className="text-xs text-gray-400 truncate" title={currentFile}>
          {currentFile}
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full h-2.5 bg-gray-700/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${displayPercentage}%` }}
        />
      </div>

      {/* Progress details */}
      <div className="flex flex-col space-y-1 text-xs text-gray-400">
        {/* File size and progress */}
        <div className="flex items-center justify-between">
          <span className="font-mono">{formatBytes(downloaded)} / {formatBytes(total)}</span>
          <span className="text-gray-300">{Math.round(percentage)}%</span>
        </div>
        
        {/* Speed and ETA */}
        <div className="flex items-center justify-between">
          <span className="whitespace-nowrap">
            <span className="text-gray-300">Speed:</span> {speed}
          </span>
          <span className="whitespace-nowrap">
            <span className="text-gray-300">ETA:</span> {eta}
          </span>
        </div>
      </div>

      {/* Status message */}
      {message && !showSuccess && (
        <div className="text-xs text-gray-400">
          {message}
        </div>
      )}
    </div>
  );
};

export default DownloadProgress;