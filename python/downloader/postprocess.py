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
from mutagen.id3 import ID3, APIC
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
            return False

        file_str = str(file_path)

        # --- ID3 block for artwork ---
        try:
            tags = ID3(file_str)
        except mutagen.id3.ID3NoHeaderError:
            tags = ID3()

        if artwork:
            tags.delall("APIC")
            tags.add(
                APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3,
                    desc="Cover",
                    data=artwork,
                )
            )

        tags.save(file_str, v2_version=3)

        # --- EasyMP3 block for text tags ---
        try:
            audio = EasyMP3(file_str)
            if title:
                audio["title"] = title
            if artist:
                audio["artist"] = artist
            if album:
                audio["album"] = album
            if album_artist:
                audio["albumartist"] = album_artist
            if track_number:
                audio["tracknumber"] = str(track_number)
            if year:
                audio["date"] = year
            if genre:
                audio["genre"] = genre
            if comment:
                audio["comment"] = comment

            audio.save(v2_version=3)
        except Exception:
            return False

        return True

    except Exception:
        return False