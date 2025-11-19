# core.py
"""
Core download functionality for YouTube to MP3 converter.

This module handles the actual downloading, conversion, and metadata setting
using yt-dlp and external tools like FFmpeg.

Dependencies:
- yt-dlp
- mutagen (for metadata)
- requests (for artwork download)
"""
import os
import logging
import subprocess
from pathlib import Path
from typing import Optional, Callable, Tuple, Any

import yt_dlp

# Importa le funzioni necessarie dal modulo postprocess
from .postprocess import set_mp3_metadata, download_artwork
from .utils import ensure_directory, sanitize_filename

logger = logging.getLogger(__name__)

def check_ffmpeg():
    """Check for FFmpeg in common locations and return the path if found."""
    possible_paths = [
        # Check in app.asar.unpacked (where asar.unpack puts it)
        Path(__file__).parent.parent.parent / "ffmpeg" / "bin" / "ffmpeg.exe",
        # Check in bundled ffmpeg (for packaged app)
        Path(__file__).parent.parent / "ffmpeg" / "bin" / "ffmpeg.exe",
        # Check in the same directory as the script
        Path(__file__).parent / "ffmpeg.exe",
        # Check in a subdirectory
        Path(__file__).parent / "ffmpeg" / "bin" / "ffmpeg.exe",
        # Check in the current working directory
        Path("ffmpeg.exe"),
        # Check in the system PATH
        Path("ffmpeg"),
        # Common Windows installation paths
        Path("C:\\ffmpeg\\bin\\ffmpeg.exe"),
        Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "ffmpeg" / "bin" / "ffmpeg.exe",
        Path(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")) / "ffmpeg" / "bin" / "ffmpeg.exe",
    ]

    # Add paths from system PATH
    path_env = os.environ.get("PATH", "")
    path_dirs = [Path(p.strip()) for p in path_env.split(os.pathsep) if p.strip()]
    
    for path_dir in path_dirs:
        possible_paths.extend([
            path_dir / "ffmpeg",
            path_dir / "ffmpeg.exe"
        ])

    # Check all possible paths
    for path in possible_paths:
        try:
            if path.exists():
                # On Windows, .exe files are executable by default
                if os.name == 'nt' and path.suffix.lower() == '.exe':
                    logger.info(f"FFmpeg found at: {path}")
                    return str(path.resolve())
                # On Unix-like systems, check for executable bit
                elif os.access(str(path), os.X_OK):
                    logger.info(f"FFmpeg found at: {path}")
                    return str(path.resolve())
        except Exception as e:
            logger.warning(f"Error checking {path}: {e}")
            continue
    
    logger.error("FFmpeg not found in any of the standard locations")
    logger.info("Please download FFmpeg from https://ffmpeg.org/download.html and add it to your PATH")
    logger.info("or place ffmpeg.exe in the same directory as this script")
    return None

def _process_metadata(file_path: Path, info: dict, progress_callback: Optional[Callable] = None):
    """Process metadata for a downloaded file."""
    try:
        # Get the best available thumbnail
        thumbnail_url = None
        
        # 1. First try to get the thumbnail from the entry's metadata (for playlist items)
        if info.get('thumbnail'):
            thumbnail_url = info['thumbnail']
        # 2. Try to get the highest resolution thumbnail from thumbnails list
        elif 'thumbnails' in info and info['thumbnails']:
            # Filter out thumbnails without URL and sort by resolution (highest first)
            valid_thumbnails = [t for t in info['thumbnails'] if t.get('url')]
            if valid_thumbnails:
                # Sort by resolution (width * height), highest first
                valid_thumbnails.sort(
                    key=lambda x: x.get('width', 0) * x.get('height', 0),
                    reverse=True
                )
                thumbnail_url = valid_thumbnails[0]['url']
        
        # 3. For playlist items, try to get the thumbnail from the parent playlist
        if not thumbnail_url and 'playlist_index' in info and 'playlist' in info and info['playlist']:
            for entry in info['playlist']:
                if isinstance(entry, dict) and entry.get('id') == info.get('id') and entry.get('thumbnail'):
                    thumbnail_url = entry['thumbnail']
                    break
                    
        # 4. For playlists, try to get the thumbnail from the first entry
        if not thumbnail_url and 'entries' in info and info['entries']:
            for entry in info['entries']:
                if isinstance(entry, dict) and entry.get('thumbnail'):
                    thumbnail_url = entry['thumbnail']
                    break
        
        # 5. Fall back to standard thumbnail if no thumbnails list or no valid thumbnails
        if not thumbnail_url and 'thumbnail' in info and info['thumbnail']:
            thumbnail_url = info['thumbnail']
        
        # 6. Try to get from 'thumbnail_url' if still no thumbnail
        if not thumbnail_url and 'thumbnail_url' in info and info['thumbnail_url']:
            thumbnail_url = info['thumbnail_url']
        
        # Download artwork if available
        artwork = None
        if thumbnail_url:
            try:
                artwork = download_artwork(thumbnail_url)
            except Exception:
                pass
        
        # Process metadata with all available info
        set_mp3_metadata(
            file_path=file_path,
            title=info.get('title', ''),
            artist=info.get('uploader', ''),
            album=info.get('album', ''),
            album_artist=info.get('artist', info.get('uploader', '')),
            track_number=int(info.get('track_number', 0)) if info.get('track_number') else 0,
            year=str(info.get('release_year') or info.get('release_date', '')[:4] if info.get('release_date') else ''),
            genre=', '.join(info.get('genres', [])) if info.get('genres') else '',
            artwork=artwork,
            comment=f"Downloaded with yt-dlp from {info.get('webpage_url', '')}"
        )
    except Exception:
        # Continue execution even if metadata processing fails
        pass

def download_media(
    url: str,
    output_dir: str,
    bitrate: int = 320,
    format: str = "mp3",
    process_playlist: bool = False,
    progress_callback: Optional[Callable[[str, float], None]] = None,
    max_retries: int = 3,
    timeout: int = 300
) -> Tuple[bool, Optional[Path], str]:
    """
    Scarica media da YouTube (singolo video o playlist) e li converte nel formato desiderato.
    """
    ensure_directory(output_dir)

    ffmpeg_path = check_ffmpeg()
    if not ffmpeg_path:
        error_msg = (
            "FFmpeg non trovato. "
            "FFmpeg è richiesto per la conversione in MP3.\n\n"
            "Per favore scarica FFmpeg da https://ffmpeg.org/download.html\n"
            "e estrailo in una cartella, quindi:\n"
            "1. Aggiungi la cartella 'bin' di FFmpeg al tuo PATH di sistema, OPPURE\n"
            "2. Copia ffmpeg.exe nella stessa cartella di questo programma"
        )
        if progress_callback:
            progress_callback({"status": "error", "message": error_msg})
        return False, None, error_msg

    # Base yt-dlp options
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "format": "bestaudio/best",
        "outtmpl": str(Path(output_dir) / "%(title)s.%(ext)s"),
        "noplaylist": not process_playlist,
        "progress_hooks": [lambda d: _on_progress(d, progress_callback)],
        "postprocessors": [],
    }
    
    if ffmpeg_path:
        ydl_opts["postprocessors"].append({
            "key": "FFmpegExtractAudio",
            "preferredcodec": format,
            "preferredquality": str(bitrate),
        })
        ydl_opts["ffmpeg_location"] = str(Path(ffmpeg_path).parent)
    else:
        ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio"

    output_path = None

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            if info is None:
                return False, None, "Impossibile scaricare il media"

            # Playlist
            if "entries" in info and info["entries"]:
                entries = info["entries"]
                output_path = Path(output_dir)
                
                # Process playlist files
                for entry in entries:
                    if not entry:
                        continue
                        
                    # Get the downloaded file path
                    if '_filename' in entry:
                        downloaded_file = Path(entry['_filename'])
                    elif 'requested_downloads' in entry and entry['requested_downloads']:
                        downloaded_file = Path(entry['requested_downloads'][0]['filepath'])
                    else:
                        logger.warning(f"Could not determine file path for entry: {entry.get('title', 'Unknown')}")
                        continue
                    
                    if not downloaded_file.exists():
                        logger.warning(f"File not found: {downloaded_file}")
                        continue
                    
                    # Rename the file using the video title
                    title = entry.get('title', 'Unknown Title')
                    new_name = sanitize_filename(title) + downloaded_file.suffix
                    new_path = downloaded_file.parent / new_name
                    
                    try:
                        # If the target file exists, remove it first
                        if new_path.exists():
                            new_path.unlink()
                        
                        # Rename the file
                        downloaded_file.rename(new_path)
                        downloaded_file = new_path
                        
                        # Process metadata and add cover art
                        if format.lower() == 'mp3' and downloaded_file.suffix.lower() == '.mp3':
                            # Ensure we have all necessary metadata
                            if 'webpage_url' not in entry and 'url' in info:
                                entry['webpage_url'] = info['url']
                            if 'uploader' not in entry and 'uploader' in info:
                                entry['uploader'] = info['uploader']
                                
                            _process_metadata(downloaded_file, entry, progress_callback)
                            logger.info(f"Processed metadata for: {downloaded_file.name}")
                            
                    except Exception as e:
                        logger.error(f"Error processing {downloaded_file}: {str(e)}", exc_info=True)
            else:
                # Singolo video
                if 'requested_downloads' in info and info['requested_downloads']:
                    # Get the first (and usually only) download
                    download_info = info['requested_downloads'][0]
                    downloaded_file = Path(download_info['filepath']).resolve()
                    
                    # Post-processing per il file singolo
                    if format.lower() == 'mp3' and (downloaded_file.suffix.lower() == '.mp3' or 
                                                 (hasattr(download_info, 'ext') and download_info.ext.lower() == 'mp3')):
                        _process_metadata(downloaded_file, info, progress_callback)
                    
                    # Determina il nome finale del file
                    title = info.get('title', 'Unknown Title')
                    ext = 'mp3' if format.lower() == 'mp3' else download_info.get('ext', format)
                    output_path = Path(output_dir) / f"{sanitize_filename(title)}.{ext}"
                    
                    # Se il file è stato convertito, rinominalo
                    if downloaded_file.exists():
                        try:
                            # Ensure the output directory exists
                            output_path.parent.mkdir(parents=True, exist_ok=True)
                            
                            # If the file is not already in the final location, move it
                            if downloaded_file != output_path:
                                if output_path.exists():
                                    output_path.unlink()
                                downloaded_file.rename(output_path)
                        except Exception:
                            # If moving fails, use the original downloaded file path
                            output_path = downloaded_file
                    else:
                        return False, None, "Il file scaricato non è stato trovato"
                else:
                    return False, None, "Impossibile determinare il percorso del file scaricato"

            if output_path and isinstance(output_path, (str, Path)):
                output_path = Path(output_path).resolve()
                if output_path.exists():
                    return True, str(output_path), "Download completato con successo"
                else:
                    # If the file doesn't exist at the expected path, try to find it in the output directory
                    title = info.get('title', 'Unknown Title')
                    search_pattern = f"{sanitize_filename(title)}.*"
                    matching_files = list(Path(output_dir).glob(search_pattern))
                    if matching_files:
                        return True, str(matching_files[0].resolve()), "Download completato con successo"
                    return False, None, f"File non trovato nel percorso: {output_path}"
            else:
                # Try to get the output path from the info dict
                if 'requested_downloads' in info and info['requested_downloads']:
                    filepath = info['requested_downloads'][0].get('filepath')
                    if filepath and Path(filepath).exists():
                        return True, str(Path(filepath).resolve()), "Download completato con successo"
                return False, None, "Impossibile determinare il percorso del file scaricato"

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        logger.error(f"Download error: {error_msg}")
        return False, None, f"Errore durante il download: {error_msg}"
    except Exception as e:
        error_msg = str(e)
        logger.exception(f"Unexpected error: {error_msg}")
        return False, None, f"Errore imprevisto: {error_msg}"

def _on_progress(d: dict[str, Any], callback: Optional[Callable] = None) -> None:
    """Callback di progresso per yt-dlp.
    
    Args:
        d: Dizionario con le informazioni sul progresso
        callback: Funzione di callback per aggiornare lo stato del download
    """
    if callback is None:
        return

    try:
        status = d.get('status', '')
        
        # Ensure we have consistent numeric types
        downloaded_bytes = int(d.get('downloaded_bytes', 0) or 0)
        total_bytes = int((d.get('total_bytes') or d.get('total_bytes_estimate') or 0))
        
        # Calculate percentage if not provided
        percent_str = str(d.get('_percent_str', '0%')).strip()
        if not percent_str.endswith('%'):
            if total_bytes > 0:
                percent = min(100, (downloaded_bytes / total_bytes) * 100)
                percent_str = f"{percent:.1f}%"
            else:
                percent_str = "0%"
        
        # Get current ETA in seconds
        current_eta = d.get('eta', 0)
        
        # Calculate total playlist ETA if this is part of a playlist
        total_playlist_eta = 0
        if d.get('playlist_index') is not None and d.get('playlist_count') is not None:
            current_index = d.get('playlist_index', 1)
            total_songs = d.get('playlist_count', 1)
            remaining_songs = total_songs - current_index
            
            # Calculate remaining time for current song (scaled by progress)
            current_progress = float(percent_str.rstrip('%')) / 100.0
            if current_progress > 0 and current_progress < 1:
                remaining_current_song = current_eta * (1 - current_progress)
            else:
                remaining_current_song = current_eta
                
            # Calculate total remaining time (current song + remaining songs)
            total_playlist_eta = remaining_current_song + (remaining_songs * current_eta)
        
        # Format progress data to match what the frontend expects
        progress_info = {
            'status': status,
            '_percent_str': percent_str,
            'percentage': float(percent_str.rstrip('%')),  # Add numeric percentage
            'downloaded_bytes': downloaded_bytes,
            'total_bytes': total_bytes,
            '_speed_str': d.get('_speed_str', '0 B/s'),
            '_eta_str': d.get('_eta_str', '--:--'),
            'filename': d.get('filename', ''),
            'eta': current_eta,  # Current song ETA in seconds
            'total_playlist_eta': int(total_playlist_eta) if total_playlist_eta > 0 else 0,  # Total playlist ETA in seconds
            'speed': d.get('speed', 0),  # Add numeric speed in bytes/s
            'is_playlist': bool(d.get('playlist_index') is not None),
            'playlist_index': d.get('playlist_index'),
            'playlist_count': d.get('playlist_count')
        }
        
        # Special handling for finished status
        if status == 'finished':
            progress_info['_percent_str'] = '100%'
            progress_info['percentage'] = 100.0
            progress_info['downloaded_bytes'] = total_bytes  # Ensure we show 100% complete
        
        # Debug logging
        print(f"[PROGRESS] {progress_info}")
        
        # Call the callback with the formatted data
        if callable(callback):
            callback(progress_info)
            
    except Exception as e:
        print(f"[ERROR] Error in progress callback: {str(e)}")
        import traceback
        traceback.print_exc()
            
    except Exception as e:
        logger.warning(f"Error in progress callback: {str(e)}", exc_info=True)
        # Send error status to frontend
        if callable(callback):
            callback({'status': 'error', 'message': str(e)})