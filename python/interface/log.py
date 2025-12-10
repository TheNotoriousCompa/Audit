"""
Logging configuration and utilities for the YouTube to MP3 converter.
"""
import logging
import json
import sys
from typing import Dict, Any, Optional, Callable

class ProgressReporter:
    """Handles progress reporting to the Electron frontend."""
    
    def __init__(self, callback: Optional[Callable] = None):
        self.callback = callback
    
    def send_progress(self, data: Dict[str, Any]) -> None:
        """Send progress update to the frontend."""
        if not self.callback:
            return
            
        try:
            self.callback(data)
        except Exception as e:
            print(f"Error in progress callback: {e}", file=sys.stderr)
    
    def __call__(self, data: Dict[str, Any]) -> None:
        """Make the instance callable for direct use as a callback."""
        self.send_progress(data)

def setup_logging(log_file: Optional[str] = None, level: int = logging.INFO) -> None:
    """Configure logging for the application."""
    logging.getLogger().handlers = []
    
    logger = logging.getLogger()
    logger.setLevel(level)
    
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # Use stderr for logs to avoid interfering with stdout JSON
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    logger.propagate = False

def format_progress(data: Dict[str, Any]) -> Dict[str, Any]:
    """Format progress data for the frontend.
    
    Returns:
        Dict with fields matching the TypeScript DownloadProgress interface.
    """
    try:
        # Calculate percentage
        percentage = 0
        if data.get('_percent_str'):
            try:
                percentage = float(str(data['_percent_str']).replace('%', '').strip())
            except (ValueError, AttributeError):
                percentage = 0
        elif data.get('percentage') is not None:
            percentage = float(data.get('percentage', 0))
        
        # Parse ETA - convert from string to seconds if needed
        eta = 0
        eta_str = '--:--'
        if data.get('_eta_str'):
            eta_str = str(data['_eta_str'])
            try:
                if ':' in eta_str:
                    parts = eta_str.split(':')
                    if len(parts) == 2:
                        m, s = map(int, parts)
                        eta = m * 60 + s
            except (ValueError, AttributeError):
                eta = 0
        elif data.get('eta') is not None:
            eta = int(data.get('eta', 0))
            mins = eta // 60
            secs = eta % 60
            eta_str = f"{mins}:{secs:02d}"
        
        # Determine status
        status = data.get('status', 'downloading')
        
        # Map Python yt-dlp status to our status types
        if status == 'downloading':
            status = 'downloading'
        elif status == 'finished':
            status = 'finished'
            percentage = 100
        elif status == 'error':
            status = 'error'
        elif percentage > 0 and percentage < 100:
            status = 'downloading'
        elif percentage >= 100:
            status = 'finished'
        
        # Get file sizes
        downloaded_bytes = int(data.get('downloaded_bytes') or data.get('downloaded') or 0)
        total_bytes = int(data.get('total_bytes') or data.get('total') or 0)
        
        # Get speed
        speed_str = str(data.get('_speed_str') or data.get('speed') or '0 B/s')
        
        # Get current file name
        current_file = ''
        if data.get('filename'):
            current_file = str(data['filename']).split('/')[-1].split('\\')[-1]
        elif data.get('currentFile'):
            current_file = str(data['currentFile'])
        
        # Format the response to match TypeScript interface
        formatted = {
            'status': status,
            'percentage': float(percentage),
            'downloaded': downloaded_bytes,
            'total': total_bytes,
            'speed': speed_str,
            'eta': eta,
            'message': str(data.get('message', '')),
            '_percent_str': f"{percentage}%",
            'downloaded_bytes': downloaded_bytes,
            'total_bytes': total_bytes,
            '_speed_str': speed_str,
            '_eta_str': eta_str,
            'currentFile': current_file,
            'filename': current_file,
            # Playlist fields
            'playlist_index': int(data.get('playlist_index', 0)),
            'playlist_count': int(data.get('playlist_count', 0)),
            'playlist_name': str(data.get('playlist_name', '')),
            'total_playlist_eta': int(data.get('total_playlist_eta', 0))
        }
        
        return formatted
        
    except Exception as e:
        logging.error(f"Error formatting progress data: {e}")
        return {
            'status': 'error',
            'message': str(e),
            'percentage': 0,
            'downloaded': 0,
            'total': 0,
            'speed': '0 B/s',
            'eta': 0,
            '_percent_str': '0%',
            '_speed_str': '0 B/s',
            '_eta_str': '--:--'
        }