"""
Post-processing functions for downloaded audio files.

This module provides functionality to enhance and modify downloaded audio files
after the initial download and conversion process. It includes features for
adding metadata, downloading album art, and other post-processing tasks.

Key Features:
- Set ID3 tags and other audio metadata
- Download and embed album artwork
- Normalize audio levels
- Clean up temporary files
- Handle various audio formats (MP3, M4A, etc.)

Dependencies:
- mutagen: For audio metadata manipulation
- PIL/Pillow: For image processing
- requests: For downloading album art
- io: For handling binary data
- logging: For error and debug logging
"""
import logging
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, Union
import io
import mutagen
from mutagen.mp3 import EasyMP3
from mutagen.id3 import ID3, APIC
from PIL import Image
import requests

from . import config
from .utils import sanitize_filename

logger = logging.getLogger(__name__)

def download_artwork(url: str) -> Optional[bytes]:
    """Download artwork from a URL."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        # Verify it's a valid image
        img = Image.open(io.BytesIO(response.content))
        img.verify()
        
        return response.content
    except Exception as e:
        logger.warning(f"Failed to download artwork from {url}: {str(e)}")
        return None

def set_mp3_metadata(
    file_path: Path,
    title: str = '',
    artist: str = '',
    album: str = '',
    album_artist: str = '',
    track_number: int = 0,
    year: str = '',
    genre: str = '',
    artwork: Optional[bytes] = None,
    comment: str = ''
) -> bool:
    """Set metadata for an MP3 file."""
    try:
        audio = EasyMP3(str(file_path))
        
        # Set basic tags
        if title:
            audio['title'] = title
        if artist:
            audio['artist'] = artist
        if album:
            audio['album'] = album
        if album_artist:
            audio['albumartist'] = album_artist
        if track_number > 0:
            audio['tracknumber'] = str(track_number)
        if year:
            audio['date'] = year
        if genre:
            audio['genre'] = genre
        if comment:
            audio['comment'] = comment
            
        audio.save()
        
        # Handle artwork
        if artwork:
            try:
                audio = ID3(str(file_path))
                audio.add(APIC(
                    encoding=3,  # UTF-8
                    mime='image/jpeg',
                    type=3,  # Cover image
                    desc='Cover',
                    data=artwork
                ))
                audio.save()
            except Exception as e:
                logger.warning(f"Failed to add artwork to {file_path}: {str(e)}")
        
        return True
    except Exception as e:
        logger.error(f"Error setting MP3 metadata for {file_path}: {str(e)}")
        return False

def normalize_audio(input_path: Path, output_path: Optional[Path] = None) -> Optional[Path]:
    """
    Normalize audio levels using ffmpeg.
    If output_path is None, normalizes in place.
    """
    try:
        import subprocess
        
        if output_path is None:
            output_path = input_path.with_suffix('.normalized' + input_path.suffix)
            
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
            '-y',  # Overwrite output file if it exists
            str(output_path)
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        # If we were normalizing in place, replace the original file
        if output_path != input_path:
            output_path.replace(input_path)
            
        return input_path
    except subprocess.CalledProcessError as e:
        logger.error(f"Audio normalization failed: {e.stderr}")
        return None
    except Exception as e:
        logger.error(f"Error during audio normalization: {str(e)}")
        return None
