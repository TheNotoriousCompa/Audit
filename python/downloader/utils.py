"""
Utility functions for the YouTube to MP3 downloader.

This module contains helper functions that support the core functionality
of the YouTube to MP3 downloader. These utilities handle common tasks
such as file operations, string manipulation, and URL processing.

Key Utilities:
- File and directory operations (create, validate, clean)
- String sanitization and formatting
- URL validation and manipulation
- File system path handling
- Error handling and validation

Dependencies:
- os: For operating system interactions
- re: For regular expressions
- pathlib: For path manipulation
- typing: For type hints
- logging: For error and debug logging
"""
import re
import logging
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger(__name__)

def sanitize_filename(filename: str) -> str:
    """Sanitize a string to be used as a filename."""
    if not filename:
        return 'unnamed_file'
        
    # Remove invalid characters
    filename = re.sub(r'[\\/*?:"<>|]', '_', filename)
    filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
    
    # Clean up the filename
    filename = filename.strip('. ')
    filename = re.sub(r'\s+', ' ', filename).strip()
    
    # Ensure the filename is a reasonable length
    if not filename:
        return 'unnamed_file'
    if len(filename) > 200:
        filename = filename[:200]
        
    return filename

def parse_eta_to_seconds(eta_str: str) -> int:
    """Convert ETA string (HH:MM:SS or MM:SS) to seconds."""
    if not eta_str or eta_str == 'N/A':
        return 0
    try:
        parts = list(map(int, eta_str.split(':')))
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        elif len(parts) == 2:
            return parts[0] * 60 + parts[1]
        return parts[0]
    except (ValueError, AttributeError):
        return 0

def ensure_directory(path: Path) -> bool:
    """Ensure the directory exists and is writable."""
    try:
        path = Path(path).resolve()
        path.mkdir(parents=True, exist_ok=True)
        
        # Test if directory is writable
        test_file = path / ".write_test"
        test_file.touch()
        test_file.unlink()
        return True
    except Exception as e:
        logger.error(f"Cannot write to directory '{path}': {str(e)}")
        return False

def clean_youtube_url(url: str) -> str:
    """Clean YouTube URL by removing tracking parameters."""
    if not url or 'youtube.com' not in url and 'youtu.be' not in url:
        return url
        
    # Remove tracking parameters
    url = url.split('&list=')[0]  # Remove playlist reference
    url = url.split('&t=')[0]     # Remove timestamp
    return url
