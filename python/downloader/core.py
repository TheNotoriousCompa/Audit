import os
import logging
import subprocess
from pathlib import Path
from typing import Optional, Callable, Tuple, Any

import yt_dlp

from . import config
from .postprocess import set_mp3_metadata as postprocess
from .utils import ensure_directory, sanitize_filename

logger = logging.getLogger(__name__)

def check_ffmpeg():
    """Check for FFmpeg in common locations and return the path if found."""
    possible_paths = [
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
    logger.info(f"Starting download: {url}")
    logger.info(f"Output directory: {output_dir}")
    logger.info(f"Process as playlist: {process_playlist}")

    # Check if FFmpeg is installed
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
        logger.error(error_msg)
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
        # Only add post-processor if we have FFmpeg
        "postprocessors": [],
    }
    
    # If we have FFmpeg, add audio conversion
    if ffmpeg_path:
        ydl_opts["postprocessors"].append({
            "key": "FFmpegExtractAudio",
            "preferredcodec": format,
            "preferredquality": str(bitrate),
        })
        ydl_opts["ffmpeg_location"] = str(Path(ffmpeg_path).parent)  # Set FFmpeg directory
    else:
        logger.warning("FFmpeg not found, downloading best audio format without conversion")
        ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio"  # Try to get m4a which is widely supported

    output_path = None
    entries = []  # dichiarazione preventiva per evitare UnboundLocalError

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            if info is None:
                logger.error("Impossibile scaricare: nessuna informazione ottenuta da yt-dlp.")
                return False, None, "Impossibile scaricare il media"

            # Playlist
            if "entries" in info and info["entries"]:
                entries = info["entries"]
                logger.info(f"Playlist rilevata: {len(entries)} elementi.")
                output_path = Path(output_dir)
            else:
                # Singolo video
                filename = sanitize_filename(info.get("title", "unknown"))
                ext = info.get("ext", format)
                output_path = Path(output_dir) / f"{filename}.{ext}"

            logger.info(f"Successfully downloaded: {output_path}")

            # Post-processing - Set metadata if this is an MP3 file
            if format.lower() == 'mp3' and output_path.suffix.lower() == '.mp3':
                try:
                    logger.info("[DEBUG] Starting post-processing for MP3 file")
                    
                    # Get the best available thumbnail
                    thumbnail_url = None
                    
                    # Try to get the highest resolution thumbnail
                    if 'thumbnails' in info and info['thumbnails']:
                        # Sort by resolution (width * height), highest first
                        thumbnails = sorted(
                            [t for t in info['thumbnails'] if t.get('url')],
                            key=lambda x: x.get('width', 0) * x.get('height', 0),
                            reverse=True
                        )
                        if thumbnails:
                            thumbnail_url = thumbnails[0]['url']
                    
                    # Fall back to standard thumbnail if no thumbnails list
                    if not thumbnail_url and 'thumbnail' in info:
                        thumbnail_url = info['thumbnail']
                    
                    artwork = None
                    if thumbnail_url:
                        logger.info(f"[DEBUG] Found thumbnail URL: {thumbnail_url}")
                        try:
                            artwork = download_artwork(thumbnail_url)
                            if artwork:
                                logger.info(f"[DEBUG] Successfully downloaded artwork ({len(artwork)} bytes)")
                            else:
                                logger.warning("[DEBUG] Downloaded artwork is empty")
                        except Exception as e:
                            logger.error(f"[DEBUG] Error downloading artwork: {str(e)}")
                    else:
                        logger.warning("[DEBUG] No thumbnail URL found in video info")
                    
                    # Process metadata
                    logger.info("[DEBUG] Setting MP3 metadata...")
                    postprocess(
                        file_path=output_path,
                        title=info.get('title', ''),
                        artist=info.get('uploader', ''),
                        album=info.get('album', ''),
                        artwork=artwork
                    )
                    logger.info("[DEBUG] Metadata processing completed successfully")
                    
                except Exception as e:
                    logger.exception(f"[ERROR] Metadata processing failed: {str(e)}")
                    if progress_callback:
                        progress_callback({
                            'status': 'warning',
                            'message': f'Warning: Metadata processing failed: {str(e)}'
                        })

            return True, output_path, "Download completato con successo"

    except yt_dlp.utils.DownloadError as e:
        logger.error(f"Errore durante il download: {str(e)}")
        return False, None, f"Errore durante il download: {str(e)}"
    except Exception as e:
        logger.exception("Errore imprevisto durante il download")
        return False, None, f"Errore imprevisto: {str(e)}"


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
            'eta': d.get('eta', 0),  # Add numeric ETA in seconds
            'speed': d.get('speed', 0),  # Add numeric speed in bytes/s
            'is_playlist': bool(d.get('playlist_index') is not None)
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
