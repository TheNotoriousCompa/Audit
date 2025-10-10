"""
Configuration module for the YouTube audio downloader.

This module defines all configurable parameters for the downloader, including
default paths, bitrate, format, and yt-dlp options.

It also provides helper functions to generate yt-dlp configurations
based on user preferences.
"""

import os
from pathlib import Path
from typing import Dict, Any

# === Default Settings === #

# Default output directory
DEFAULT_OUTPUT_DIR = Path(os.path.expanduser("~/Desktop/Music"))

# Default audio format and bitrate
DEFAULT_FORMAT = "mp3"
DEFAULT_BITRATE = 320  # in kbps

# Download behavior
DEFAULT_TIMEOUT = 30  # seconds
DEFAULT_MAX_RETRIES = 3

# Logging
LOG_LEVEL = "INFO"

# === Core yt-dlp Configuration === #

def get_ydl_opts(
    output_dir: str,
    format: str = DEFAULT_FORMAT,
    bitrate: int = DEFAULT_BITRATE,
) -> Dict[str, Any]:
    """
    Generate the yt-dlp configuration dictionary.

    Args:
        output_dir: Directory to save downloaded files
        format: Output audio format (mp3, m4a, flac, wav, opus)
        bitrate: Audio bitrate in kbps

    Returns:
        dict: yt-dlp configuration options
    """

    # Base postprocessors configuration
    postprocessors = []

    # === AUDIO CONVERSION ===
    if format in ["mp3", "m4a", "flac", "wav", "opus"]:
        # Add FFmpeg audio conversion
        postprocessors.append({
            'key': 'FFmpegExtractAudio',
            'preferredcodec': format,
            'preferredquality': str(bitrate)
        })
    else:
        raise ValueError(f"Unsupported audio format: {format}")

    # === METADATA AND THUMBNAILS ===
    postprocessors += [
        {'key': 'FFmpegMetadata'},
        {'key': 'EmbedThumbnail'}
    ]

    # === yt-dlp OPTIONS ===
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
        'noplaylist': True,  # overridden by core.py if needed
        'ignoreerrors': True,
        'no_warnings': False,
        'quiet': False,
        'writethumbnail': True,
        'prefer_ffmpeg': True,
        'postprocessors': postprocessors,
        'cachedir': False,
        'socket_timeout': DEFAULT_TIMEOUT,
        'source_address': None,  # can be set for IP rotation
        'geo_bypass': True,
    }

    return ydl_opts
