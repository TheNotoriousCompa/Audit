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
        logger.info(f"[DEBUG] Attempting to download artwork from URL: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        logger.info(f"[DEBUG] Successfully received artwork response with status: {response.status_code}")
        
        # Verify it's a valid image
        logger.debug("[DEBUG] Verifying image content...")
        img = Image.open(io.BytesIO(response.content))
        img.verify()
        logger.debug("[DEBUG] Image verification successful")
        
        logger.info(f"[DEBUG] Successfully downloaded artwork: {len(response.content)} bytes")
        return response.content
    except requests.exceptions.RequestException as e:
        logger.error(f"[ERROR] Network error downloading artwork from {url}: {str(e)}")
    except (IOError, SyntaxError) as e:
        logger.error(f"[ERROR] Invalid image data received from {url}: {str(e)}")
    except Exception as e:
        logger.exception(f"[ERROR] Unexpected error downloading artwork: {str(e)}")
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
    """Set metadata for an MP3 file with proper ID3 tag handling."""
    try:
        # Ensure the file exists
        if not file_path.exists():
            logger.error(f"File not found: {file_path}")
            return False

        # Convert the file to a string path for mutagen
        file_path_str = str(file_path)
        
        # First, handle text tags with EasyMP3
        try:
            audio = EasyMP3(file_path_str)
            audio.delete()  # Clear existing tags to avoid duplicates
            
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
                
            audio.save(v2_version=3)  # Save text tags first
            logger.debug("Successfully saved text tags")
        except Exception as e:
            logger.error(f"Error saving text tags: {str(e)}")
            return False
        
        # Now handle ID3 tags and artwork
        try:
            # Create new ID3 tag with v2.3
            audio = ID3()
            
            # Add artwork if provided
            if artwork:
                try:
                    # Convert image to JPEG if needed
                    img = Image.open(io.BytesIO(artwork))
                    
                    # Convert to RGB if image is in RGBA or other modes
                    if img.mode in ('RGBA', 'LA'):
                        background = Image.new('RGB', img.size, (255, 255, 255))
                        background.paste(img, mask=img.split()[-1])
                        img = background
                    
                    # Resize if needed (some players have issues with large images)
                    max_size = (500, 500)
                    img.thumbnail(max_size, Image.Resampling.LANCZOS)
                    
                    # Convert to bytes
                    img_byte_arr = io.BytesIO()
                    img.save(img_byte_arr, format='JPEG', quality=95)
                    img_bytes = img_byte_arr.getvalue()
                    
                    # Add APIC frame
                    audio.add(APIC(
                        encoding=3,  # UTF-8
                        mime='image/jpeg',
                        type=3,  # 3 = front cover
                        desc='Cover',
                        data=img_bytes
                    ))
                    logger.debug(f"Added artwork: {len(img_bytes)} bytes")
                    
                except Exception as img_error:
                    logger.error(f"Error processing artwork: {str(img_error)}")
            
            # Save ID3 tags
            audio.save(file_path_str, v2_version=3)
            logger.info(f"Successfully updated ID3 tags for {file_path}")
            
            # Final step: use ffmpeg to ensure proper tag writing
            try:
                import subprocess
                temp_path = file_path_str + '.temp.mp3'
                
                # Use ffmpeg to copy the file and rewrite tags
                cmd = [
                    'ffmpeg',
                    '-i', file_path_str,
                    '-c', 'copy',
                    '-id3v2_version', '3',
                    '-write_id3v1', '1',
                    '-map_metadata', '0',
                    '-y',  # Overwrite output file if it exists
                    temp_path
                ]
                
                # Run ffmpeg
                result = subprocess.run(cmd, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
                )
                
                if result.returncode == 0 and Path(temp_path).exists():
                    # Replace original file with the processed one
                    Path(temp_path).replace(file_path_str)
                    logger.debug("Successfully processed file with ffmpeg")
                else:
                    logger.warning(f"ffmpeg processing failed: {result.stderr.decode()}")
                    
            except Exception as ffmpeg_error:
                logger.warning(f"ffmpeg processing failed, using mutagen only: {str(ffmpeg_error)}")
            
            return True
            
        except Exception as id3_error:
            logger.error(f"Error setting ID3 tags: {str(id3_error)}")
            return False
            
    except Exception as e:
        logger.exception(f"Unexpected error in set_mp3_metadata: {str(e)}")
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
