"""
Progress calculation module for YouTube downloader.

This module handles progress tracking for both single files and playlists,
providing accurate download progress and status information to the UI.
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, ClassVar

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class ProgressState:
    """Data class to hold the current progress state."""
    current_index: int = 1
    total_songs: int = 0
    is_playlist_mode: bool = False
    playlist_name: str = ""
    completed_songs: int = 0

class ProgressCalculator:
    """
    Calculates and manages download progress for both single files and playlists.
    
    This class handles:
    - Tracking progress of individual files
    - Calculating overall playlist progress
    - Managing state between downloads
    - Providing consistent progress information to the UI
    """
    
    def __init__(self):
        """Initialize a new ProgressCalculator instance."""
        self._state = ProgressState()
    
    def reset_state(self) -> None:
        """Reset all progress tracking to initial state."""
        self._state = ProgressState()
    
    def set_playlist_info(self, total_songs: int, playlist_name: str) -> None:
        """Initialize playlist information.
        
        Args:
            total_songs: Total number of songs in the playlist
            playlist_name: Name of the playlist
        """
        self._state = ProgressState(
            current_index=1,
            total_songs=total_songs,
            is_playlist_mode=True,
            playlist_name=playlist_name,
            completed_songs=0
        )
        logger.info("Playlist mode: %d songs, name: %s", total_songs, playlist_name)
    
    def _calculate_file_percent(self, progress_data: Dict[str, Any], 
                             downloaded_bytes: int, total_bytes: int) -> float:
        """Calculate the download percentage of the current file.
        
        Args:
            progress_data: Raw progress data from yt-dlp
            downloaded_bytes: Number of bytes downloaded
            total_bytes: Total size of the file in bytes
            
        Returns:
            float: Download percentage (0.0-100.0)
        """
        # Try to extract percentage from yt-dlp's string
        percent_str = str(progress_data.get('_percent_str', '0%')).strip('%')
        try:
            return min(100.0, max(0.0, float(percent_str)))
        except (ValueError, TypeError):
            # Fallback to byte-based calculation
            if total_bytes > 0:
                return min(100.0, max(0.0, (downloaded_bytes / total_bytes) * 100))
            return 0.0
    
    def _calculate_playlist_progress(self, file_percent: float) -> float:
        """Calculate the overall playlist progress.
        
        Args:
            file_percent: Current file's download percentage (0-100)
            
        Returns:
            float: Overall playlist progress (0.0-100.0)
        """
        if not self._state.is_playlist_mode or self._state.total_songs == 0:
            return 0.0
            
        total_progress = (self._state.completed_songs + (file_percent / 100.0))
        return min(100.0, max(0.0, (total_progress / self._state.total_songs) * 100))
    
    def _handle_finished_status(self) -> Dict[str, float]:
        """Handle status when a download finishes.
        
        Returns:
            Tuple of (status, file_percent, playlist_percent, main_percentage)
        """
        if not self._state.is_playlist_mode:
            return {'status': 'finished', 'file_percent': 100.0, 'playlist_percent': 100.0, 'percentage': 100.0}
        
        if self._state.completed_songs < self._state.total_songs - 1:
            # Not the last song in playlist
            self._state.completed_songs += 1
            self._state.current_index += 1
            return {
                'status': 'downloading',
                'file_percent': 100.0,
                'playlist_percent': self._calculate_playlist_progress(100.0),
                'percentage': self._calculate_playlist_progress(100.0)
            }
        
        # Last song completed
        return {
            'status': 'finished',
            'file_percent': 100.0,
            'playlist_percent': 100.0,
            'percentage': 100.0
        }
    
    def calculate_progress(self, progress_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process progress data and return formatted progress information.
        
        Args:
            progress_data: Raw progress data from yt-dlp
            
        Returns:
            Dict containing formatted progress information
        """
        status = progress_data.get('status', 'ready')
        
        # Calculate file-level progress
        file_percent = self._calculate_file_percent(
            progress_data,
            progress_data.get('downloaded_bytes', 0),
            progress_data.get('total_bytes', 0)
        )
        
        # Handle finished status
        if status == 'finished':
            progress = self._handle_finished_status()
        else:
            progress = {
                'status': status,
                'file_percent': file_percent,
                'playlist_percent': self._calculate_playlist_progress(file_percent),
                'percentage': (self._calculate_playlist_progress(file_percent) 
                             if self._state.is_playlist_mode else file_percent)
            }
        
        # Build result dictionary
        result = {
            **progress,
            'downloaded_bytes': progress_data.get('downloaded_bytes', 0),
            'total_bytes': progress_data.get('total_bytes', 0),
            'speed': progress_data.get('speed', 0),
            'eta': progress_data.get('eta', 0),
            'filename': progress_data.get('filename', ''),
            'currentFile': progress_data.get('filename', ''),
            '_percent_str': progress_data.get('_percent_str', ''),
            '_speed_str': progress_data.get('_speed_str', ''),
            '_eta_str': progress_data.get('_eta_str', '')
        }
        
        # Add playlist info if in playlist mode
        if self._state.is_playlist_mode:
            result.update(self.get_playlist_info())
            
        return result
    
    def get_playlist_info(self) -> Dict[str, Any]:
        """Get current playlist information.
        
        Returns:
            Dict containing playlist metadata if in playlist mode, else empty dict
        """
        if not self._state.is_playlist_mode:
            return {}
            
        return {
            'playlist_index': self._state.current_index,
            'playlist_count': self._state.total_songs,
            'playlist_name': self._state.playlist_name,
            'isPlaylist': True
        }

# Global instance for module-level functions
_progress_calculator = ProgressCalculator()

def reset_progress_state() -> None:
    """Reset the global progress calculator state."""
    _progress_calculator.reset_state()

def set_playlist_info(total_songs: int, playlist_name: str) -> None:
    """Set playlist information in the global progress calculator.
    
    Args:
        total_songs: Total number of songs in the playlist
        playlist_name: Name of the playlist
    """
    _progress_calculator.set_playlist_info(total_songs, playlist_name)

def calculate_progress(progress_data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate progress using the global progress calculator.
    
    Args:
        progress_data: Raw progress data from yt-dlp
        
    Returns:
        Dict containing formatted progress information
    """
    return _progress_calculator.calculate_progress(progress_data)

def get_playlist_info() -> Dict[str, Any]:
    """Get current playlist information from the global calculator.
    
    Returns:
        Dict containing playlist metadata if in playlist mode, else empty dict
    """
    return _progress_calculator.get_playlist_info()