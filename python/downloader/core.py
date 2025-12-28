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
from .progress import reset_progress_state, set_playlist_info, calculate_progress

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

def _extract_artist(info: dict) -> str:
    """Extract artist information from video/audio metadata."""
    # 1. Try direct artist field
    if info.get('artist'):
        return info['artist']
    
    # 2. Try uploader (channel name)
    if info.get('uploader'):
        return info['uploader']
    
    # 3. Try to extract from title (common format: "Artist - Song")
    if 'title' in info and ' - ' in info['title']:
        return info['title'].split(' - ')[0].strip()
    
    # 4. Try to extract from description
    if info.get('description'):
        import re
        # Common patterns in descriptions
        patterns = [
            r'(?i)artist[:]\s*([^\n]+)',
            r'(?i)artista[:]\s*([^\n]+)',
            r'(?i)by\s+([^\n]+)',
            r'(?i)da\s+([^\n]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, info['description'])
            if match:
                artist = match.group(1).strip()
                if artist:  # Make sure we found something
                    return artist
    
    # 5. Last resort: return empty string
    return ''

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
        
        # Extract artist information
        artist = _extract_artist(info)
        album_artist = info.get('artist') or artist or info.get('uploader', '')
        
        # Log per debug
        logger.info(f"Processing metadata for: {info.get('title', 'Unknown')}")
        logger.info(f"Artist: {artist}, Uploader: {info.get('uploader', 'Not found')}")
        logger.info(f"Album: {info.get('album', 'Not found')}, Album Artist: {album_artist}")
        
        # Process metadata with all available info
        set_mp3_metadata(
            file_path=file_path,
            title=info.get('title', ''),
            artist=artist,
            album=info.get('album', ''),
            album_artist=album_artist,
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
    quality: str = "best",
    fps: Optional[int] = None,
    process_playlist: bool = False,
    progress_callback: Optional[Callable[[str, float], None]] = None,
    max_retries: int = 3,
    timeout: int = 300
) -> Tuple[bool, Optional[Path], str]:
    """
    Scarica media da YouTube (singolo video o playlist) e li converte nel formato desiderato.
    """
    # Reset global progress state for each new download session
    reset_progress_state()

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

    # Initialize playlist tracking state
    playlist_state = {
        'current_index': 0,      # 0-based index of current file in playlist
        'total_count': 0,        # Total number of files in playlist
        'playlist_name': None    # Name of the playlist (if available)
    }
    
    # Wrapper for progress callback to handle playlist tracking
    def progress_wrapper(d):
        nonlocal playlist_state
        
        # Update playlist state if this is a new playlist
        if 'playlist' in d and d['playlist'] is not None:
            if 'playlist_index' in d and 'playlist_count' in d:
                playlist_state['current_index'] = d['playlist_index']
                playlist_state['total_count'] = d['playlist_count']
                if 'playlist' in d and 'title' in d['playlist']:
                    playlist_state['playlist_name'] = d['playlist']['title']
        
        # Add playlist info to the progress data
        if playlist_state['total_count'] > 0:
            d['playlist_index'] = playlist_state['current_index'] + 1  # 1-based index
            d['playlist_count'] = playlist_state['total_count']
            d['playlist_name'] = playlist_state['playlist_name']
            d['isPlaylist'] = True
        
        # Process progress through _on_progress
        _on_progress(d, progress_callback)
        
        # Increment index for the next file
        if (playlist_state['total_count'] > 0 and 
            d.get('status') == 'finished' and 
            playlist_state['current_index'] < playlist_state['total_count'] - 1):
            playlist_state['current_index'] += 1
    
    # Base yt-dlp options
    ydl_opts = {
        "quiet": True,
        "verbose": False,
        "no_warnings": True,
        "ignoreerrors": True,
        "outtmpl": str(Path(output_dir) / f"%(title)s.%(ext)s"),
        "noplaylist": not process_playlist,
        "progress_hooks": [progress_wrapper],
        "writethumbnail": True,  # Download thumbnail
        "postprocessors": [],
    }
    
    # Format selection logic
    if format == 'mp4':
        # Video resolution and FPS logic
        height_filter = ""
        fps_filter = ""
        
        if quality and quality.lower() != 'best':
            # Remove 'p' if present (e.g. 1080p -> 1080)
            height = quality.lower().replace('p', '')
            if height.isdigit():
                 height_filter = f"[height<={height}]"
        
        if fps and fps > 0:
            # If FPS is specified, prefer formats with that FPS or higher
            fps_filter = f"[fps>={fps}]"

        if height_filter or fps_filter:
            # Construct complex format selector
            # Try to get best video matching criteria, fallback to best video without criteria if needed
            ydl_opts["format"] = f"bestvideo{height_filter}{fps_filter}+bestaudio/best{height_filter}{fps_filter}/best"
        else:
            ydl_opts["format"] = "bestvideo+bestaudio/best"
            
        # Ensure we merge into mp4
        ydl_opts["merge_output_format"] = "mp4"
        
        # For MP4 we still want metadata
        ydl_opts["postprocessors"].append({
            "key": "FFmpegMetadata",
            "add_metadata": True,
        })
        
        # And embed thumbnail
        ydl_opts["postprocessors"].append({
            "key": "EmbedThumbnail",
        })

    else:
        # Audio logic (existing)
        ydl_opts["format"] = f"bestaudio[ext={format}]/bestaudio"
        ydl_opts["outtmpl"] = str(Path(output_dir) / f"%(title)s.{format}")  # Force the output extension
    
    if ffmpeg_path:
        ydl_opts["ffmpeg_location"] = str(Path(ffmpeg_path).parent)
        
        # ONLY add audio conversion if NOT mp4
        if format != 'mp4':
            # 1. Convert to audio format (e.g., mp3)
            ydl_opts["postprocessors"].append({
                "key": "FFmpegExtractAudio",
                "preferredcodec": format,
                "preferredquality": str(bitrate),
            })

            # 2. Embed thumbnail (must be AFTER conversion)
            ydl_opts["postprocessors"].append({
                "key": "EmbedThumbnail",
            })
    else:
        if format != 'mp4':
            ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio"

    output_path = None
    playlist_folder = None

    info = None

    try:
        # Prima estrazione VELOCE per ottenere solo il nome della playlist (senza metadati dettagliati)
        # Usa extract_flat per velocizzare enormemente questa fase
        if process_playlist:
            if progress_callback:
                progress_callback({"status": "info", "message": "Extracting playlist info..."})
            
            flat_opts = ydl_opts.copy()
            flat_opts['extract_flat'] = 'in_playlist'  # Non scarica metadati dettagliati
            with yt_dlp.YoutubeDL(flat_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            
        # Se è una playlist e process_playlist è True, crea una cartella con il nome della playlist
        if info and process_playlist and "entries" in info and info["entries"]:
            playlist_title = info.get('title', info.get('playlist_title', 'Playlist'))
            playlist_folder = Path(output_dir) / sanitize_filename(playlist_title)
            ensure_directory(str(playlist_folder))
            
            # Update playlist state for progress tracking
            playlist_state['total_count'] = len([e for e in info['entries'] if e])
            playlist_state['playlist_name'] = playlist_title
            playlist_state['current_index'] = 1  # Start from 1 (1-based indexing)

            # Inizializza anche il calcolatore di progressi globale
            set_playlist_info(playlist_state['total_count'], playlist_title)
            
            # Aggiorna l'output template per salvare nella cartella della playlist
            ydl_opts["outtmpl"] = str(playlist_folder / "%(title)s.%(ext)s")
            
            if progress_callback:
                progress_callback({
                    "status": "info",
                    "message": f"Playlist rilevata: {playlist_title}",
                    "playlist_name": playlist_title,
                    "playlist_folder": str(playlist_folder),
                    "playlist_count": playlist_state['total_count']
                })
        
        
        # Ora scarica con le opzioni aggiornate (nuovo contesto)
        if progress_callback:
            progress_callback({"status": "info", "message": "Starting download process..."})
            
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=True)
            except Exception as e:
                if progress_callback:
                    progress_callback({"status": "error", "message": f"Download failed: {str(e)}"})
                raise e

            
            if info is None:
                return False, None, "Impossibile scaricare il media"

            # Playlist
            if "entries" in info and info["entries"]:
                entries = info["entries"]
                # Usa la cartella della playlist se disponibile, altrimenti output_dir
                output_path = playlist_folder if playlist_folder else Path(output_dir)
                
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
                        # If the target file exists, remove it first (but only if it's different from source)
                        if new_path != downloaded_file and new_path.exists():
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
                            if 'artist' not in entry and 'artist' in info:
                                entry['artist'] = info['artist']
                            
                            # Add playlist title as album if not set
                            if 'album' not in entry and 'playlist' in info and info.get('playlist'):
                                entry['album'] = info.get('playlist_title', 'YouTube Playlist')
                            
                            _process_metadata(downloaded_file, entry, progress_callback)
                            # logger.info removed to avoid Unicode errors on Windows
                            
                    except Exception as e:
                        logger.error(f"Error processing {downloaded_file}: {str(e)}", exc_info=True)
                
                # Cleanup playlist residual thumbnails
                # Cleanup playlist residual thumbnails
                # Check both playlist folder and root output folder
                folders_to_check = []
                if playlist_folder and playlist_folder.exists():
                    folders_to_check.append(playlist_folder)
                if output_dir and Path(output_dir).exists():
                     folders_to_check.append(Path(output_dir))

                playlist_name_sanitized = sanitize_filename(info.get('title', ''))

                for folder in folders_to_check:
                    try:
                        # Common extensions for thumbnails
                        for ext in ['*.jpg', '*.jpeg', '*.png', '*.webp']:
                            for thumb_file in folder.glob(ext):
                                # If the filename looks like the playlist name, delete it
                                if thumb_file.stem == playlist_name_sanitized:
                                    try:
                                        if thumb_file.exists():
                                            thumb_file.unlink()
                                            logger.info(f"Deleted playlist thumbnail: {thumb_file.name}")
                                    except OSError:
                                        pass
                    except Exception as e:
                        logger.warning(f"Failed to cleanup playlist thumbnails in {folder}: {e}")

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
    """Progress callback for yt-dlp.
    
    Args:
        d: Dictionary with progress information
        callback: Callback function to update download status
    """
    if callback is None:
        return

    try:
        # Prepare progress data with consistent field names coming from yt-dlp
        progress_data = {
            'status': d.get('status', ''),
            'downloaded_bytes': int(d.get('downloaded_bytes', 0) or 0),
            'total_bytes': int((d.get('total_bytes') or d.get('total_bytes_estimate') or 0)),
            'speed': d.get('speed', 0),
            'eta': d.get('eta', 0),
            'filename': d.get('filename', ''),
            '_percent_str': d.get('_percent_str', '0%'),
            '_speed_str': d.get('_speed_str', '0 B/s'),
            '_eta_str': d.get('_eta_str', '--:--'),
            # Playlist fields (se presenti)
            'playlist_index': d.get('playlist_index'),
            'playlist_count': d.get('playlist_count'),
            'playlist_name': d.get('playlist_name'),
        }

        # Special handling for finished status
        if progress_data['status'] == 'finished':
            progress_data['downloaded_bytes'] = progress_data['total_bytes']
            progress_data['_percent_str'] = '100%'

        # Usa il ProgressCalculator per calcolare file_percent / playlist_percent / percentage
        enriched_progress = calculate_progress(progress_data)

        # Inoltra il risultato arricchito al callback
        if callable(callback):
            callback(enriched_progress)
            
    except Exception as e:
        logger.warning(f"Error in progress callback: {str(e)}", exc_info=True)
        # Send error status to frontend
        if callable(callback):
            try:
                callback({'status': 'error', 'message': str(e)})
            except Exception as inner_e:
                logger.error(f"Failed to send error callback: {str(inner_e)}")