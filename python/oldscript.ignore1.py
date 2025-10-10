#!/usr/bin/env python3
"""
YouTube to MP3 Converter - Core Functions
A modular library for downloading YouTube audio and converting to MP3.
Designed to be used with a GUI interface (e.g., Electron).
Dependencies (install with pip):
    pip install yt-dlp pydub requests pillow mutagen
Note: ffmpeg is required for audio processing. Install it:
    - Windows: Download from https://ffmpeg.org/download.html
    - macOS: brew install ffmpeg
    - Linux: sudo apt-get install ffmpeg (or equivalent for your distro)
"""
import os
import sys
import logging
import time
import random
import subprocess
import threading
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any, Union
import platform
from urllib.parse import urlparse, parse_qs
import re
import csv
import json
import requests
from PIL import Image
import io
import mutagen
from mutagen.mp3 import EasyMP3
from mutagen.id3 import ID3, APIC

# --- Utility Functions ---
def sanitize_filename(filename: str) -> str:
    filename = re.sub(r'[\\/*?:"<>|]', '_', filename)
    filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
    filename = filename.strip('. ')
    filename = re.sub(r'\s+', ' ', filename).strip()
    if not filename:
        return 'unnamed_file'
    if len(filename) > 200:
        filename = filename[:200]
    return filename

logger = logging.getLogger(__name__)

def send_progress(percentage, downloaded, total, speed, eta, status="downloading"):
    progress = {
        "percentage": percentage,
        "downloaded": downloaded,
        "total": total,
        "speed": speed,
        "eta": eta,
        "status": status
    }
    print(json.dumps(progress))
    sys.stdout.flush()

def parse_eta_to_seconds(eta_str):
    if not eta_str or eta_str == 'N/A':
        return 0
    try:
        parts = eta_str.split(':')
        if len(parts) == 3:
            hours, minutes, seconds = map(int, parts)
            return hours * 3600 + minutes * 60 + seconds
        elif len(parts) == 2:
            minutes, seconds = map(int, parts)
            return minutes * 60 + seconds
        elif len(parts) == 1:
            return int(parts[0])
    except ValueError:
        return 0
    return 0

def progress_hook(d: dict, callback=None) -> None:
    if not callable(callback):
        return
    try:
        safe_data = {
            'status': str(d.get('status', '')),
            'percent': 0.0,
            'speed': str(d.get('_speed_str', 'N/A')),
            'eta': str(d.get('_eta_str', 'N/A')),
            'filename': os.path.basename(str(d.get('filename', ''))),
            'message': ''
        }
        eta_seconds = parse_eta_to_seconds(safe_data['eta'])
        if '_percent_str' in d and d['_percent_str']:
            try:
                percent_str = str(d['_percent_str']).rstrip('%')
                safe_data['percent'] = float(percent_str)
            except (ValueError, AttributeError, TypeError):
                safe_data['percent'] = 0.0

        send_progress(
            percentage=safe_data['percent'],
            downloaded=d.get('downloaded_bytes', 0),
            total=d.get('total_bytes', 0),
            speed=safe_data['speed'],
            eta=eta_seconds,
            status=safe_data['status']
        )

        status = safe_data['status']
        if status == 'finished':
            send_progress(100.0, 0, 0, "N/A", 0, "converting")

        callback_data = safe_data.copy()
        callback(callback_data)
    except Exception as e:
        logger.error(f"Error in progress hook: {str(e)}", exc_info=True)

def find_ffmpeg() -> Optional[str]:
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(['where', 'ffmpeg'], capture_output=True, text=True, check=True)
            paths = result.stdout.strip().split('\n')
            for path in paths:
                if path.strip().endswith('ffmpeg.exe') and os.path.exists(path.strip()):
                    return path.strip()
        else:
            result = subprocess.run(['which', 'ffmpeg'], capture_output=True, text=True, check=True)
            path = result.stdout.strip()
            if path and os.path.exists(path):
                return path
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    if platform.system() == 'Windows':
        common_paths = [
            'C:\\ffmpeg\\bin\\ffmpeg.exe',
            os.path.join(os.environ.get('ProgramFiles', 'C:\\Program Files'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
        ]
        for path in common_paths:
            if os.path.exists(path):
                return path
    return None

# Windows-specific fixes
if platform.system() == 'Windows':
    class DummyPty:
        def openpty(self): return (0, 1)
        def __getattr__(self, name): return None
    sys.modules['pty'] = DummyPty()
    sys.modules['tty'] = type('DummyTty', (), {'setraw': lambda *a: None, 'setcbreak': lambda *a: None, '__getattr__': lambda *a: None})()

try:
    import yt_dlp
except ImportError:
    raise ImportError("yt-dlp is not installed. Install it with: pip install yt-dlp")

def set_ffmpeg_env():
    ffmpeg_path = find_ffmpeg()
    if ffmpeg_path:
        ffmpeg_dir = str(Path(ffmpeg_path).parent)
        os.environ['PATH'] = ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
set_ffmpeg_env()

def setup_logging(log_file: str = "conversion.log") -> None:
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setFormatter(formatter)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

def get_random_user_agent():
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    ]
    return random.choice(user_agents)

def clean_youtube_url(url: str) -> str:
    if 'youtube.com' not in url and 'youtu.be' not in url:
        return url
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    for param in ['list', 'start_radio', 'index', 'playnext']:
        if param in query:
            del query[param]
    new_query = '&'.join(f"{k}={v[0]}" for k, v in query.items())
    return urlunparse(parsed._replace(query=new_query if new_query else None))

def download_artwork(url: str) -> Optional[bytes]:
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        img = Image.open(io.BytesIO(response.content))
        if img.mode in ('RGBA', 'LA'):
            background = Image.new('RGB', img.size, (0, 0, 0))
            background.paste(img, mask=img.split()[-1])
            img = background
        max_size = (1000, 1000)
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='JPEG', quality=85)
        return img_byte_arr.getvalue()
    except Exception as e:
        logger.warning(f"Error downloading artwork: {str(e)}")
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
    try:
        if not file_path.exists() or file_path.suffix.lower() != '.mp3':
            return False
        audio = EasyMP3(str(file_path))
        if title: audio['title'] = title
        if artist: audio['artist'] = artist
        if album: audio['album'] = album
        if album_artist: audio['albumartist'] = album_artist
        if track_number: audio['tracknumber'] = str(track_number)
        if year: audio['date'] = year
        if genre: audio['genre'] = genre
        if comment: audio['comment'] = comment
        audio.save()
        if artwork:
            audio = ID3(str(file_path))
            audio.add(APIC(encoding=3, mime='image/jpeg', type=3, desc='Cover', data=artwork))
            audio.save()
        return True
    except Exception as e:
        logger.error(f"Error setting MP3 metadata: {str(e)}")
        return False

# --- Core Download Logic ---
def _download_with_client(url: str, output_path: Path, bitrate: int, timeout: int,
                         progress_callback, max_retries: int, client: str,
                         process_playlist: bool = False) -> Tuple[Optional[Path], Optional[str]]:
    
    # Clean the URL if we're not processing a playlist
    if not process_playlist:
        url = clean_youtube_url(url)
    
    # Ensure output directory exists and is writable
    try:
        output_path = Path(output_path).resolve()
        output_path.mkdir(parents=True, exist_ok=True)
        # Test if directory is writable
        test_file = output_path / ".write_test"
        test_file.touch()
        test_file.unlink()
    except Exception as e:
        error_msg = f"Cannot write to output directory '{output_path}': {str(e)}"
        logger.error(error_msg)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return None, None
    
    logger.info(f"Processing as {'playlist' if process_playlist else 'single video'}")
    logger.info(f"Using URL: {url}")
    logger.info(f"Output directory: {output_path}")

    ffmpeg_path_str = find_ffmpeg()
    if not ffmpeg_path_str:
        error_msg = "FFmpeg not found."
        logger.error(error_msg)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return None, None

    ffmpeg_path = Path(ffmpeg_path_str)
    ffprobe_path = ffmpeg_path.parent / 'ffprobe.exe'
    if not ffprobe_path.exists():
        ffprobe_path = 'ffprobe'

    logger.info(f"Using ffmpeg_location: {ffmpeg_path}")
    logger.info(f"Using ffprobe_location: {ffprobe_path}")

    class YTDlpLogger:
        def debug(self, msg): logger.debug(f"yt-dlp: {msg}")
        def info(self, msg): logger.info(f"yt-dlp: {msg}")
        def warning(self, msg): logger.warning(f"yt-dlp: {msg}")
        def error(self, msg): logger.error(f"yt-dlp: {msg}")

    def get_ydl_opts(safe_title: str, bitrate: int, output_path: Path, progress_callback=None, client: str = 'android', process_playlist: bool = False) -> dict:
        # Ensure output path is absolute and exists
        output_path = Path(output_path).resolve()
        output_path.mkdir(parents=True, exist_ok=True)
        safe_title = sanitize_filename(safe_title or 'video')
        
        # For both single videos and playlists, use the output path directly
        output_template = str(output_path / "%(title)s.%(ext)s")
        logger.info(f"Downloading to: {output_path}")

        user_agent = get_random_user_agent()

        opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'format_sort': ['ext:m4a', 'ext:mp3', 'ext:webm'],
            'format_sort_force': True,
            'noplaylist': not process_playlist,
            'extract_flat': 'in_playlist' if process_playlist else False,
            'ignoreerrors': True,
            'playlistend': None if process_playlist else 1,  # No limit for playlists, 1 for single
            'outtmpl': output_template,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': str(bitrate),
            }, {'key': 'FFmpegMetadata'}],
            'ffmpeg_location': str(ffmpeg_path.resolve()),
            'ffprobe_location': str(ffprobe_path) if ffprobe_path != 'ffprobe' else 'ffprobe',
            'retries': 10,
            'fragment_retries': 10,
            'socket_timeout': 60,
            'http_chunk_size': 1048576,
            'ratelimit': 1024 * 1024,
            'nocheckcertificate': True,
            'geo_bypass': True,
            'geo_bypass_country': 'US',
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            'extractor_args': {
                'youtube': {
                    'player_client': ['ios', 'web_music']
                }
            },
            'quiet': True,
            'no_warnings': False,
            'logger': YTDlpLogger(),
            'restrictfilenames': True,
            'windowsfilenames': True,
            'no_color': True,
            'cachedir': False,
            'no_cache_dir': True,
        }

        if progress_callback and callable(progress_callback):
            def safe_progress(d):
                try:
                    progress_hook(d, progress_callback)
                except Exception as e:
                    logger.error(f"Error in progress callback: {str(e)}", exc_info=True)
            opts['progress_hooks'] = [safe_progress]

        return opts

    def simple_download(ydl_opts: dict, url: str) -> Tuple[bool, Any]:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return False, "Could not get video information"
                result = ydl.extract_info(url, download=True)
                return True, result
        except yt_dlp.utils.DownloadError as e:
            return False, f"Download failed: {str(e)}"
        except Exception as e:
            return False, f"Unexpected error: {str(e)}"

    last_error = None
    video_title = None
    for attempt in range(1, max_retries + 1):
        try:
            output_path.mkdir(parents=True, exist_ok=True)
            info_opts = {
                'quiet': True,
                'skip_download': True,
                'extract_flat': False,
                'ffmpeg_location': str(ffmpeg_path.resolve()),
                'ffprobe_location': str(ffprobe_path) if ffprobe_path != 'ffprobe' else 'ffprobe',
            }
            with yt_dlp.YoutubeDL(info_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    last_error = "Could not extract video info"
                    continue
                video_title = info.get('title', 'Unknown_Video')
                safe_title = sanitize_filename(video_title)
                output_file = output_path / f"{safe_title}.mp3"
                if output_file.exists() and output_file.stat().st_size > 100 * 1024:
                    logger.info(f"File already exists: {output_file}")
                    return output_file, video_title

            logger.info(f"Download attempt {attempt}/{max_retries}: {video_title}")
            ydl_opts = get_ydl_opts(safe_title, bitrate, output_path, progress_callback, client, process_playlist)
            success, result = simple_download(ydl_opts, url)

            if success:
                # Find all downloaded MP3 files in the output directory
                downloaded_files = list(output_path.glob("*.mp3"))
                if downloaded_files:
                    # Get the most recently modified files
                    downloaded_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
                    if process_playlist:
                        # For playlists, return the count of downloaded files
                        return downloaded_files[0], f"Playlist downloaded ({len(downloaded_files)} files)"
                    else:
                        # For single videos, return the most recent file
                        if downloaded_files[0].stat().st_size > 1024:
                            logger.info(f"Successfully downloaded to {downloaded_files[0]}")
                            return downloaded_files[0], video_title
                
                last_error = f"Download completed but output file not found in {output_path}"
            else:
                last_error = result
                logger.warning(f"Attempt {attempt} failed: {result}")

            if attempt < max_retries:
                wait_time = min(2 ** attempt, 30)
                logger.info(f"Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
        except Exception as e:
            last_error = f"Unexpected error: {str(e)}"
            logger.error(f"Attempt {attempt} error: {last_error}")
            if attempt < max_retries:
                time.sleep(5)

    final_error = last_error or "Download failed after all retry attempts"
    logger.error(f"❌ Failed to download: {video_title or 'Unknown'}")
    logger.error(f"  Error: {final_error}")
    if progress_callback:
        progress_callback({'status': 'error', 'message': final_error})
    return None, None

def download_audio(url: str, output_path: Path, bitrate: int = 320, timeout: int = 600,
                  progress_callback=None, max_retries: int = 3, process_playlist: bool = False):
    if not url:
        if progress_callback:
            progress_callback({'status': 'error', 'message': 'No URL provided'})
        return None, None

    try:
        output_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        error_msg = f"Failed to create output directory: {str(e)}"
        logger.error(error_msg)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return None, None

    clients = ['web', 'android', 'tv'] if process_playlist else ['android', 'web', 'tv']
    last_error = None
    downloaded_files = set()

    for client in clients:
        try:
            logger.info(f"Trying download with {client} client")
            result = _download_with_client(
                url=url,
                output_path=output_path,
                bitrate=bitrate,
                timeout=timeout,
                progress_callback=progress_callback,
                max_retries=max_retries,
                client=client,
                process_playlist=process_playlist
            )
            if result[0] is not None:
                if isinstance(result[0], list):
                    for f in result[0]:
                        if f and os.path.exists(f):
                            downloaded_files.add(os.path.abspath(f))
                    if downloaded_files:
                        return result[0][0], f"Downloaded {len(downloaded_files)} files"
                else:
                    if os.path.exists(result[0]):
                        downloaded_files.add(os.path.abspath(result[0]))
                        return result
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Download with {client} client failed: {last_error}")

    if downloaded_files:
        return list(downloaded_files)[0], f"Partially downloaded {len(downloaded_files)} files"

    error_msg = f"All download attempts failed. Last error: {last_error or 'unknown'}"
    logger.error(error_msg)
    if progress_callback:
        progress_callback({'status': 'error', 'message': error_msg})
    return None, None

def process_single_url(url: str, output_dir: Union[str, Path], bitrate: int = 320,
                     skip_existing: bool = True, timeout: int = 300,
                     progress_callback=None, process_playlist: bool = False):
    # Convert output_dir to Path if it's a string
    output_dir = Path(output_dir).resolve()
    
    # Ensure output directory exists and is writable
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        # Test if directory is writable
        test_file = output_dir / ".write_test"
        test_file.touch()
        test_file.unlink()
    except Exception as e:
        error_msg = f"Cannot write to output directory '{output_dir}': {str(e)}"
        logger.error(error_msg)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return False, error_msg
    try:
        start_time = time.time()
        output_dir.mkdir(parents=True, exist_ok=True)

        info_result = [None]
        info_exception = [None]
        def info_thread():
            try:
                with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': False}) as ydl:
                    info_result[0] = ydl.extract_info(url, download=False)
            except Exception as e:
                info_exception[0] = e

        t = threading.Thread(target=info_thread)
        t.start()
        t.join(timeout=20)
        if t.is_alive():
            error_msg = "Timed out while extracting video info"
            logging.error(error_msg)
            if progress_callback:
                progress_callback({'status': 'error', 'message': error_msg})
            return False, error_msg
        if info_exception[0]:
            error_msg = f"Error extracting video info: {info_exception[0]}"
            logging.error(error_msg)
            if progress_callback:
                progress_callback({'status': 'error', 'message': error_msg})
            return False, error_msg

        info = info_result[0]
        if not info:
            error_msg = "Could not get video information"
            logging.error(error_msg)
            return False, error_msg

        if info.get('_type') == 'playlist':
            if not process_playlist:
                error_msg = "Playlist URLs require --process-playlist flag."
                logging.error(error_msg)
                if progress_callback:
                    progress_callback({'status': 'error', 'message': error_msg})
                return False, error_msg
            else:
                logging.info("Processing full playlist as requested.")

        video_title = info.get('title', 'Unknown_Video')
        safe_title = sanitize_filename(video_title)
        output_file = output_dir / f"{safe_title}.mp3"

        if skip_existing and output_file.exists() and output_file.stat().st_size > 100 * 1024:
            if progress_callback:
                progress_callback({
                    'status': 'skipped',
                    'output_file': str(output_file),
                    'reason': 'File already exists'
                })
            logging.info(f"File already exists: {output_file}")
            return True, output_file

        result = download_audio(
            url, 
            output_dir, 
            bitrate=bitrate, 
            timeout=timeout, 
            progress_callback=progress_callback,
            process_playlist=process_playlist
        )

        if not result or result == (None, None):
            error_msg = "Download failed - No file was created"
            logging.error(error_msg)
            if progress_callback:
                progress_callback({'status': 'error', 'message': error_msg})
            return False, error_msg

        downloaded_file, downloaded_title = result
        if not downloaded_file or not isinstance(downloaded_file, Path) or not downloaded_file.exists():
            error_msg = f"Failed to download audio from: {url}"
            logging.error(error_msg)
            if progress_callback:
                progress_callback({'status': 'error', 'message': error_msg})
            return False, error_msg

        try:
            file_size = downloaded_file.stat().st_size
            if file_size < 1024:
                error_msg = f"Downloaded file is too small ({file_size} bytes): {downloaded_file}"
                logging.error(error_msg)
                downloaded_file.unlink(missing_ok=True)
                if progress_callback:
                    progress_callback({'status': 'error', 'message': error_msg})
                return False, error_msg
        except OSError as e:
            error_msg = f"Error checking file size: {str(e)}"
            logging.error(error_msg)
            if progress_callback:
                progress_callback({'status': 'error', 'message': error_msg})
            return False, error_msg

        try:
            channel = info.get('uploader', '')
            upload_date = info.get('upload_date', '')
            year = upload_date[:4] if upload_date and len(upload_date) >= 4 else ''
            thumbnail_url = None
            if info.get('thumbnails'):
                thumbnails = sorted(
                    [t for t in info['thumbnails'] if t.get('url')],
                    key=lambda x: x.get('width', 0) * x.get('height', 0),
                    reverse=True
                )
                if thumbnails:
                    thumbnail_url = thumbnails[0]['url']
            elif info.get('thumbnail'):
                thumbnail_url = info['thumbnail']

            artwork = None
            if thumbnail_url:
                artwork = download_artwork(thumbnail_url)

            set_mp3_metadata(
                file_path=downloaded_file,
                title=info.get('title', ''),
                artist=channel,
                album=info.get('album', ''),
                album_artist=channel,
                year=year,
                genre=info.get('genre', 'Music'),
                artwork=artwork,
                comment=f'Downloaded from YouTube - {url}'
            )
            logging.info(f"Added metadata to: {downloaded_file}")
        except Exception as e:
            logging.warning(f"Error adding metadata: {str(e)}")

        elapsed = time.time() - start_time
        logging.info(f"Successfully processed: {downloaded_file}")
        if progress_callback:
            progress_callback({
                'status': 'finished',
                'output_file': str(downloaded_file),
                'elapsed': f"{elapsed:.1f}s"
            })
        return True, downloaded_file

    except Exception as e:
        error_msg = f"Error processing URL {url}: {str(e)}"
        logging.error(error_msg, exc_info=True)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return False, error_msg

# --- Batch & CLI ---
def search_youtube_and_download(query: str, output_dir: Path, bitrate: int = 320, timeout: int = 300, skip_existing: bool = True, progress_callback=None) -> tuple:
    search_url = f"ytsearch1:{query}"
    try:
        return process_single_url(search_url, output_dir, bitrate, skip_existing, timeout, progress_callback)
    except Exception as e:
        logging.error(f"Error searching/downloading for query '{query}': {e}")
        return False, None

def parse_txt_file(txt_path: str) -> list:
    queries = []
    with open(txt_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            queries.append(line)
    return queries

def parse_csv_file(csv_path: str) -> list:
    queries = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) == 1:
                queries.append(row[0].strip())
            elif len(row) >= 2:
                queries.append(f"{row[0].strip()} - {row[1].strip()}")
    return queries

def batch_download_from_file(file_path: str, output_dir: Path, bitrate: int = 320, timeout: int = 300, skip_existing: bool = True, progress_callback=None) -> list:
    if file_path.lower().endswith('.csv'):
        queries = parse_csv_file(file_path)
    else:
        queries = parse_txt_file(file_path)
    results = []
    for query in queries:
        print(f"Processing: {query}")
        success, output = search_youtube_and_download(query, output_dir, bitrate, timeout, skip_existing, progress_callback)
        results.append((query, success, str(output) if output else "Failed"))
    return results

# --- Main Entry Point ---
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="YouTube to MP3 Converter")
    parser.add_argument("url", nargs="?", help="YouTube video URL or search query")
    parser.add_argument("output_folder", nargs="?", default=os.getcwd(), 
                       help=f"Output folder (default: {os.getcwd()})")
    parser.add_argument("--bitrate", type=int, default=320, help="Audio bitrate in kbps (default: 320)")
    parser.add_argument("--batch", type=str, help="Path to CSV or TXT file for batch download (Artist - Song Name per line)")
    parser.add_argument("--process-playlist", action="store_true", help="Process all videos in the playlist")
    
    # Convert output folder to absolute path and ensure it exists
    args = parser.parse_args()
    args.output_folder = os.path.abspath(args.output_folder)
    os.makedirs(args.output_folder, exist_ok=True)
    logger.info(f"Final output directory set to: {args.output_folder}")

    setup_logging()
    logger.info(f"Starting with arguments: {vars(args)}")

    try:
        output_dir = Path(args.output_folder).resolve()
        logger.info(f"Output directory is writable")

        ffmpeg_path = find_ffmpeg()
        if not ffmpeg_path:
            error_msg = "FFmpeg not found. Please install FFmpeg."
            logger.error(error_msg)
            print(json.dumps({"success": False, "error": error_msg}))
            sys.exit(1)
        logger.info(f"Using FFmpeg at: {ffmpeg_path}")

        send_progress(0, 0, 0, "N/A", 0, "starting")

        if args.batch:
            results = batch_download_from_file(args.batch, output_dir, bitrate=args.bitrate)
            batch_result = {
                "success": True,
                "message": f"Batch download complete. {len([r for r in results if r[1]])} successful, {len([r for r in results if not r[1]])} failed.",
                "results": [{"query": query, "success": success, "output": output} for query, success, output in results]
            }
            print(json.dumps(batch_result))
        elif args.url:
            success, output_file = process_single_url(
                args.url, 
                output_dir, 
                bitrate=args.bitrate,
                progress_callback=lambda x: None,
                process_playlist=args.process_playlist
            )
            if success and output_file:
                result = {
                    "success": True,
                    "filePath": str(output_file),
                    "message": f"Download completed: {output_file.name}"
                }
                print(json.dumps(result))
            else:
                result = {"success": False, "error": "Download failed"}
                print(json.dumps(result))
        else:
            result = {"success": False, "error": "Nessun URL fornito"}
            print(json.dumps(result))

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.exception(error_msg)
        print(json.dumps({"success": False, "error": error_msg}))
        sys.exit(1)
    finally:
        logger.info("Script execution completed")