"""
Logging configuration and utilities for the YouTube to MP3 converter.

This module provides a centralized logging configuration and utilities for the application.
It includes a ProgressReporter class for tracking download progress and formatting
log messages consistently across the application.

Key Features:
- Standardized log formatting with timestamps and log levels
- Progress tracking and reporting
- Support for both console and file logging
- Integration with the IPC system for progress updates

Dependencies:
- logging: For log message handling
- typing: For type hints
- datetime: For timestamp generation
- sys: For standard output handling
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
    # Clear any existing handlers
    logging.getLogger().handlers = []
    
    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(level)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File handler if log file is specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    # Disable propagation to avoid duplicate logs
    logger.propagate = False

def format_progress(data: Dict[str, Any]) -> Dict[str, Any]:
    """Format progress data for the frontend."""
    try:
        # Ensure all values are JSON-serializable
        return {
            'status': str(data.get('status', '')),
            'percentage': float(str(data.get('_percent_str', '0')).rstrip('%') or 0),
            'downloaded': int(data.get('downloaded_bytes', 0)),
            'total': int(data.get('total_bytes') or data.get('total_bytes_estimate', 0)),
            'speed': str(data.get('_speed_str', 'N/A')),
            'eta': str(data.get('_eta_str', 'N/A')),
            'filename': str(data.get('filename', '').split('/')[-1]),
            'message': str(data.get('message', ''))
        }
    except Exception as e:
        logging.error(f"Error formatting progress data: {e}")
        return {'status': 'error', 'message': str(e)}
