import React from 'react';

interface DownloadProgressProps {
  progress: {
    percentage: number;
    downloaded: number;
    total: number;
    speed: string;
    eta: string | number;
    status: string;
    message?: string;
    _percent_str?: string;
    downloaded_bytes?: number;
    total_bytes?: number;
    _speed_str?: string;
    _eta_str?: string;
  };
}

const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0 || isNaN(bytes)) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatTime = (eta: number | string): string => {
  // If eta is already a string, try to parse it
  if (typeof eta === 'string') {
    // If it's already in HH:MM:SS or MM:SS format, return as is
    if (/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(eta)) {
      return eta;
    }
    // Try to convert string to number
    const parsed = parseFloat(eta);
    if (!isNaN(parsed)) {
      eta = parsed;
    } else {
      return '--:--';
    }
  }

  // Handle number case (seconds)
  if (eta < 0) return '--:--';
  const h = Math.floor(eta / 3600);
  const m = Math.floor((eta % 3600) / 60);
  const s = Math.floor(eta % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'downloading':
      return 'bg-blue-500';
    case 'converting':
      return 'bg-purple-500';
    case 'finished':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

export const DownloadProgress: React.FC<DownloadProgressProps> = ({ progress }) => {
  // Map the progress data to the expected format
  const getMappedProgress = () => {
    // Default values
    let percentage = 0;
    let status = 'ready';
    let message = '';
    
    // Calculate percentage from _percent_str if available
    if (typeof progress._percent_str === 'string') {
      const percentStr = progress._percent_str.replace(/[^\d.]/g, '');
      percentage = parseFloat(percentStr) || 0;
    } else if (typeof progress.percentage === 'number') {
      percentage = progress.percentage;
    }
    
    // Determine status and message
    if (progress.status) {
      status = progress.status;
    } else if (percentage > 0) {
      status = 'downloading';
    }
    
    // Set appropriate message
    if (progress.message) {
      message = progress.message;
    } else if (status === 'downloading') {
      message = `Downloading... ${Math.round(percentage)}%`;
    } else if (status === 'converting') {
      message = 'Converting to MP3...';
    } else if (status === 'finished') {
      message = 'Download completed';
    } else {
      message = 'Ready';
    }
    
    // Ensure percentage is between 0-100
    percentage = Math.min(100, Math.max(0, percentage));
    
    return {
      percentage: percentage,
      downloaded: progress.downloaded_bytes || progress.downloaded || 0,
      total: progress.total_bytes || progress.total || 0,
      speed: progress._speed_str || progress.speed || '0 B/s',
      eta: progress._eta_str || progress.eta || '--:--',
      status: status,
      message: message,
      _percent_str: progress._percent_str || `${Math.round(percentage)}%`
    };
  };

  const mappedProgress = getMappedProgress();
  const { percentage, downloaded, total, speed, eta, status, message } = mappedProgress;
  
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [displayPercentage, setDisplayPercentage] = React.useState(0);
  const [displayedStatus, setDisplayedStatus] = React.useState(status);

  // Smooth percentage animation
  React.useEffect(() => {
    const animate = () => {
      setDisplayPercentage(prev => {
        // If we're at 100%, make sure we show exactly 100%
        if (percentage >= 100) return 100;
        
        // Smooth animation for progress updates
        const diff = percentage - prev;
        if (Math.abs(diff) > 0.5) {
          return prev + (diff * 0.2); // Slightly faster animation
        }
        return percentage;
      });
    };

    const timer = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(timer);
  }, [percentage]);

  // Handle status changes
  React.useEffect(() => {
    if (status === 'finished') {
      setDisplayedStatus('finished');
      setDisplayPercentage(100); // Ensure we show 100% when finished
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    } else if (status === 'downloading' || status === 'converting' || status === 'processing') {
      setDisplayedStatus(status);
    } else if (status === 'error') {
      setDisplayedStatus('error');
    } else if (percentage > 0) {
      // If we have progress but no specific status, default to downloading
      setDisplayedStatus('downloading');
    } else {
      setDisplayedStatus('ready');
    }
  }, [status, percentage]);
  
  // Always render the component, but control visibility with opacity
  return (
    <div className="w-full mt-6 space-y-2">
      {/* Success notification */}
      {showSuccess && (
        <div className="mb-2 p-2 bg-green-500/20 border border-green-500/50 rounded-md text-green-200 text-sm">
          Download completed successfully!
        </div>
      )}
      
      {/* Status and percentage */}
      <div className="flex justify-between text-sm">
        <div className="flex items-center">
          <div className={`w-2.5 h-2.5 rounded-full mr-2 ${getStatusColor(status)}`}></div>
          <span className="text-gray-300 capitalize">
            {displayedStatus === 'downloading' ? 'Downloading' : 
             displayedStatus === 'converting' ? 'Converting' : 
             displayedStatus === 'processing' ? 'Processing' :
             displayedStatus === 'finished' ? 'Completed' : 
             displayedStatus === 'error' ? 'Error' : 'Ready'}
            {(displayedStatus === 'downloading' || displayedStatus === 'converting' || displayedStatus === 'processing') && total > 0 && ` (${formatBytes(downloaded)} / ${formatBytes(total)})`}
            {(displayedStatus === 'downloading' || displayedStatus === 'converting' || displayedStatus === 'processing') && speed && ` • ${speed}`}
            {(displayedStatus === 'downloading' || displayedStatus === 'converting' || displayedStatus === 'processing') && eta && ` • ETA: ${formatTime(eta)}`}
          </span>
        </div>
        <span className="text-gray-300">
          {status === 'finished' ? '100%' : `${Math.round(displayPercentage)}%`}
        </span>
      </div>
      
      {/* Progress bar - always render but control visibility */}
      <div className="w-full bg-gray-800/30 rounded-full h-2.5 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            displayedStatus === 'error' ? 'bg-red-500' :
            displayedStatus === 'finished' ? 'bg-green-500' :
            displayedStatus === 'downloading' ? 'bg-blue-500' :
            displayedStatus === 'converting' ? 'bg-purple-500' :
            'bg-gray-500'
          }`}
          style={{ 
            width: `${status === 'finished' ? 100 : Math.max(2, displayPercentage)}%`,
            minWidth: '0.5rem' // Ensure it's always visible when there's progress
          }}
        />
      </div>
      
      {/* Speed and ETA - Only show when downloading */}
      {status === 'downloading' && (
        <div className="flex justify-between text-xs text-gray-400">
          <span>{speed}</span>
          <span>ETA: {formatTime(eta)}</span>
        </div>
      )}
      
      {/* Status message */}
      {message && (
        <div className="text-xs text-gray-400 mt-1 truncate">
          {message}
        </div>
      )}
    </div>
  );
};
