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
        'no_warnings': False,  # Show warnings for debugging
        'quiet': False,
        'writethumbnail': True,
        'writethumbnail': True,
        'embedthumbnail': True,
        'postprocessors': [
            # First extract the audio
            {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': format,
                'preferredquality': str(bitrate)
            },
            # Then embed the thumbnail
            {
                'key': 'EmbedThumbnail',
                'already_have_thumbnail': False
            },
            # Finally add metadata
            {
                'key': 'FFmpegMetadata',
                'add_metadata': True,
                'add_chapters': True
            }
        ],
        'prefer_ffmpeg': True,
        'ffmpeg_location': None,  # Let yt-dlp find ffmpeg automatically
        'cachedir': False,
        'socket_timeout': DEFAULT_TIMEOUT,
        'source_address': None,
        'geo_bypass': True,
        'postprocessor_args': [
            '-movflags', 'use_metadata_tags',
            '-id3v2_version', '3',
            '-write_id3v1', '1',
            '-strict', 'experimental'
        ],
        'logger': logging.getLogger('yt-dlp')
    }

    return ydl_opts
