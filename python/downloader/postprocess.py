"""
Post-processing functions for downloaded audio files.

This module provides functionality to enhance and modify downloaded audio files
after the initial download and conversion process. It includes features for
adding metadata, downloading album art, and other post-processing tasks.
"""
import io
import logging
from pathlib import Path
from typing import Optional

import mutagen
import requests
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TPE2, TRCK, TYER, TCON, COMM
from mutagen.mp3 import EasyMP3
from PIL import Image

logger = logging.getLogger(__name__)

def download_artwork(url: str) -> Optional[bytes]:
    """Download artwork from a URL."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, timeout=10, headers=headers)
        response.raise_for_status()
        
        content_type = response.headers.get('content-type', '').lower()
        if not content_type.startswith('image/'):
            logger.warning(f"URL does not seem to point to an image (Content-Type: {content_type})")
        
        img_bytes = response.content

        # Verify image validity
        try:
            img = Image.open(io.BytesIO(img_bytes))
            img.verify()
        except Exception:
            return None

        # Reopen and normalize the image
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1])
            img = background

        # Resize large thumbnails
        if img.width > 1000 or img.height > 1000:
            img.thumbnail((1000, 1000), Image.Resampling.LANCZOS)

        # Save as high-quality JPEG
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=95)
        return buf.getvalue()

    except requests.RequestException:
        return None
    except Exception:
        return None


def set_mp3_metadata(
    file_path: Path,
    title: str = "",
    artist: str = "",
    album: str = "",
    album_artist: str = "",
    track_number: int = 0,
    year: str = "",
    genre: str = "",
    artwork: Optional[bytes] = None,
    comment: str = "",
) -> bool:
    """Set or update metadata (including artwork) for an MP3 file."""
    try:
        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            return False

        file_str = str(file_path)
        logger.debug(f"Setting metadata for {file_path}")

        # Initialize ID3 tags
        try:
            tags = ID3(file_str)
            # Remove all existing tags to avoid duplicates
            for tag in list(tags.keys()):
                del tags[tag]
        except mutagen.id3.ID3NoHeaderError:
            tags = ID3()

        # Add artwork if available
        if artwork:
            try:
                tags.add(
                    APIC(
                        encoding=3,  # UTF-8
                        mime="image/jpeg",
                        type=3,  # Cover image
                        desc="Cover",
                        data=artwork,
                    )
                )
                logger.debug("Added artwork to metadata")
            except Exception as e:
                logger.error(f"Error adding artwork: {str(e)}", exc_info=True)

        # Add text tags
        try:
            if title:
                tags.add(TIT2(encoding=3, text=title))
            if artist:
                tags.add(TPE1(encoding=3, text=artist))
            if album:
                tags.add(TALB(encoding=3, text=album))
            if album_artist:
                tags.add(TPE2(encoding=3, text=album_artist))
            if track_number:
                tags.add(TRCK(encoding=3, text=str(track_number)))
            if year:
                tags.add(TYER(encoding=3, text=year))
            if genre:
                tags.add(TCON(encoding=3, text=genre))
            if comment:
                tags.add(COMM(encoding=3, text=comment, lang='eng', desc=''))
            
            logger.debug(f"Tags to save: {tags.pprint()}")
            
            # Save all tags
            tags.save(file_str, v2_version=3)
            logger.info(f"Successfully saved metadata for {file_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error adding text tags: {str(e)}", exc_info=True)
            return False

    except Exception as e:
        logger.error(f"Error setting metadata for {file_path}: {str(e)}", exc_info=True)
        return False