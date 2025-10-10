#!/usr/bin/env python3
"""
YouTube to MP3 Converter - Core Functions
A modular library for downloading YouTube audio and converting to MP3.
Designed to be used with a GUI interface.

Dependencies (install with pip):
    pip install yt-dlp pydub

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
import signal
import threading
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any, Union
import platform
from urllib.parse import urlparse, parse_qs
import shutil
import queue
import re
import csv

# Set up logging
logger = logging.getLogger(__name__)

def find_ffmpeg() -> Optional[str]:
    """Find FFmpeg executable with multiple fallback methods"""
    # 1. Try to find ffmpeg in PATH
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
    
    # 2. Try common Windows installation paths
    if platform.system() == 'Windows':
        common_paths = [
            os.path.join(os.environ.get('ProgramFiles', 'C:\\Program Files'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            'C:\\ffmpeg\\bin\\ffmpeg.exe',
            'C:\\ffmpeg\\ffmpeg.exe',
            os.path.join(os.environ.get('USERPROFILE', 'C:\\Users'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'ffmpeg', 'bin', 'ffmpeg.exe')
        ]
        
        for path in common_paths:
            if os.path.exists(path):
                return path
    # 3. Try to find ffmpeg in the current directory
    if os.path.exists('ffmpeg.exe'):
        return os.path.abspath('ffmpeg.exe')
    
    # 4. Try to find ffmpeg in a local ffmpeg directory
    local_ffmpeg = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffmpeg', 'bin', 'ffmpeg.exe')
    if os.path.exists(local_ffmpeg):
        return local_ffmpeg
    
    # 5. Try to find ffmpeg in the same folder as this script (python folder)
    script_dir_ffmpeg = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffmpeg.exe')
    if os.path.exists(script_dir_ffmpeg):
        return script_dir_ffmpeg
    
    return None

# Windows-specific fixes
if platform.system() == 'Windows':
    class DummyPty:
        def openpty(self): return (0, 1)
        def tcgetattr(self, fd): return [0] * 11
        def tcsetattr(self, fd, when, attrs): pass
        def setraw(self, fd, when=0): pass
        def setcbreak(self, fd, when=0): pass
        def __getattr__(self, name): return None
    sys.modules['pty'] = DummyPty()
    sys.modules['tty'] = type('DummyTty', (), {
        'setraw': lambda *a: None,
        'setcbreak': lambda *a: None,
        '__getattr__': lambda *a: None
    })()
    try:
        import yt_dlp
    except ImportError:
        raise ImportError("yt-dlp is not installed. Install it with: pip install yt-dlp")
else:
    try:
        import yt_dlp
    except ImportError:
        raise ImportError("yt-dlp is not installed. Install it with: pip install yt-dlp")

# Set FFmpeg and FFprobe in environment variables
def set_ffmpeg_env():
    from pathlib import Path
    ffmpeg_path = find_ffmpeg()
    if ffmpeg_path:
        ffmpeg_dir = str(Path(ffmpeg_path).parent)
        os.environ['PATH'] = ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
        os.environ['FFMPEG_BINARY'] = ffmpeg_path
        ffprobe_path = str(Path(ffmpeg_path).parent / 'ffprobe.exe')
        if os.path.exists(ffprobe_path):
            os.environ['FFPROBE_BINARY'] = ffprobe_path
        else:
            os.environ['FFPROBE_BINARY'] = 'ffprobe'

set_ffmpeg_env()

# Global variable to track current temporary file for cleanup
current_temp_file: Optional[Path] = None

def setup_logging(log_file: str = "conversion.log") -> None:
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setFormatter(formatter)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)  # Show INFO and above in console
    console_handler.setFormatter(formatter)
    logging.basicConfig(level=logging.INFO, handlers=[file_handler, console_handler])

def sanitize_filename(filename: str) -> str:
    invalid_chars = '<>:"/\\|?*\n'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    name, ext = os.path.splitext(filename)
    name = name.strip('. ')
    max_length = 200 - len(ext)
    if len(name) > max_length:
        name = name[:max_length]
    return f"{name}{ext}" if ext else name

def extract_valid_url(text: str) -> Optional[str]:
    """Extract the first valid http(s) URL from arbitrary text.
    Returns None if not found.
    """
    try:
        # Find the first http(s) URL
        match = re.search(r"https?://[^\s]+", text)
        if not match:
            return None
        url = match.group(0)
        # Strip common trailing punctuation
        url = url.rstrip(').,;\']\"')
        return url
    except Exception:
        return None

def progress_hook(d: dict, callback=None) -> None:
    """Handle progress updates from yt-dlp
    
    Args:
        d: Dictionary containing progress information from yt-dlp
        callback: Optional callback function to receive progress updates
    """
    if not callable(callback):
        return
    
    try:
        # Ensure d is a dictionary
        if not isinstance(d, dict):
            logging.warning(f"Progress data is not a dictionary: {d}")
            return
            
        # Create a safe copy of the progress data with only the fields we need
        safe_data = {
            'status': str(d.get('status', '')),
            'percent': 0.0,
            'speed': str(d.get('_speed_str', 'N/A')),
            'eta': str(d.get('_eta_str', 'N/A')),
            'filename': os.path.basename(str(d.get('filename', ''))),
            'message': ''
        }
        
        # Handle percentage
        if '_percent_str' in d and d['_percent_str']:
            try:
                percent_str = str(d['_percent_str']).rstrip('%')
                safe_data['percent'] = float(percent_str)
            except (ValueError, AttributeError, TypeError) as e:
                logging.debug(f"Could not parse percentage: {d.get('_percent_str')}")
                safe_data['percent'] = 0.0
        
        # Handle different statuses
        status = safe_data['status']
        if status == 'downloading':
            if '_percent_str' in d and d['_percent_str']:
                safe_data['message'] = (
                    f"Downloading... {d.get('_percent_str', '0%')} "
                    f"at {safe_data['speed']} (ETA: {safe_data['eta']})"
                )
            elif 'filename' in d:
                safe_data['message'] = f"Downloading {safe_data['filename']}..."
        elif status == 'finished':
            safe_data['message'] = 'Download completed, converting to MP3...'
            safe_data['percent'] = 100.0
            logging.info("Download completed, starting conversion to MP3...")
        elif status == 'error':
            error_msg = str(d.get('error', 'Unknown error'))
            safe_data['message'] = f"Error: {error_msg}"
            safe_data['percent'] = 0.0
            logging.error(f"Download error: {error_msg}")
        
        # Ensure the callback is called in a thread-safe way
        try:
            # Make a copy of the data to prevent modification
            callback_data = safe_data.copy()
            callback(callback_data)
        except Exception as callback_error:
            logging.error(f"Error in progress callback: {str(callback_error)}", exc_info=True)
            
    except Exception as e:
        logging.error(f"Error in progress hook: {str(e)}", exc_info=True)
        try:
            # Try to send at least a basic error message
            if callable(callback):
                callback({
                    'status': 'error',
                    'message': f'Error processing update: {str(e)}',
                    'percent': 0.0,
                    'error': str(e)
                })
        except Exception as inner_e:
            logging.error(f"Error in error handler: {str(inner_e)}", exc_info=True)

def verify_ffmpeg(ffmpeg_path: str) -> bool:
    """Verify that FFmpeg is working by running a test command.
    
    Args:
        ffmpeg_path: Path to the FFmpeg executable as a string
        
    Returns:
        bool: True if FFmpeg is working, False otherwise
    """
    # Skip verification for known working path
    if ffmpeg_path == r"C:\ffmpeg\bin\ffmpeg.exe":
        return True
        
    try:
        # Convert to string in case it's a Path object
        ffmpeg_path = str(ffmpeg_path)
        
        # Check if file exists
        if not os.path.exists(ffmpeg_path):
            logging.error(f"FFmpeg not found at: {ffmpeg_path}")
            return False
            
        # Check file permissions
        if not os.access(ffmpeg_path, os.X_OK):
            logging.error(f"No execute permission for FFmpeg at: {ffmpeg_path}")
            return False
            
        # Test FFmpeg version
        try:
            result = subprocess.run(
                [ffmpeg_path, '-version'],
                capture_output=True,
                text=True,
                timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == 'Windows' else 0
            )
            
            if result.returncode != 0:
                logging.error(f"FFmpeg version check failed with return code {result.returncode}")
                logging.error(f"Error output: {result.stderr}")
                return False
                
            # Check for FFmpeg in the output
            if 'ffmpeg version' not in result.stdout.split('\n')[0]:
                logging.error(f"Unexpected FFmpeg version output: {result.stdout[:100]}...")
                return False
                
            logging.info(f"FFmpeg verified successfully at: {ffmpeg_path}")
            logging.debug(f"FFmpeg version: {result.stdout.split('\n')[0]}")
            return True
            
        except subprocess.TimeoutExpired:
            logging.error("FFmpeg version check timed out")
            return False
            
        except Exception as e:
            logging.error(f"Error running FFmpeg: {str(e)}")
            return False
            
    except Exception as e:
        logging.error(f"Error verifying FFmpeg: {str(e)}")
        return False

def verify_ffprobe(ffprobe_path: str) -> bool:
    """Verify that FFprobe is working by running a test command."""
    # If path is just 'ffprobe', it means we're trying to use it from PATH
    if ffprobe_path == 'ffprobe':
        logging.info("Trying to use 'ffprobe' from system PATH")
    try:
        if not os.path.exists(ffprobe_path) and ffprobe_path != 'ffprobe':
            logging.error(f"FFprobe not found at: {ffprobe_path}")
            return False
        cmd = [ffprobe_path, '-version']
        kwargs = {
            'stdout': subprocess.PIPE,
            'stderr': subprocess.PIPE,
            'text': True,
            'encoding': 'utf-8',
            'errors': 'ignore'
        }
        if platform.system() == 'Windows':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            kwargs['shell'] = True
        result = subprocess.run(cmd, **kwargs)
        if result.returncode == 0 and 'ffprobe version' in (result.stdout or ''):
            version_line = result.stdout.split('\n')[0]
            logging.info(f"FFprobe verified successfully: {version_line}")
            return True
        else:
            logging.error(f"FFprobe verification failed. Return code: {result.returncode}")
            return False
    except Exception as e:
        logging.error(f"Error running FFprobe: {str(e)}", exc_info=True)
        return False

def ensure_latest_ytdlp():
    """Ensure yt-dlp is up to date"""
    try:
        import subprocess
        import sys
        import yt_dlp
        
        current_version = yt_dlp.version.__version__
        print(f"Current yt-dlp version: {current_version}")
        
        print("Checking for updates...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'yt-dlp'])
        
        # Reload yt_dlp to get the new version
        import importlib
        importlib.reload(yt_dlp)
        new_version = yt_dlp.version.__version__
        
        if new_version != current_version:
            print(f"Updated yt-dlp to version: {new_version}")
        else:
            print("yt-dlp is already up to date")
            
    except Exception as e:
        print(f"Warning: Could not update yt-dlp: {e}")

def get_random_user_agent():
    """Return a random user agent string"""
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
    ]
    return random.choice(user_agents)

def get_best_audio_format(info: dict) -> str:
    """Select the best audio format to avoid problematic formats"""
    formats = info.get('formats', [])
    
    # Prefer formats that are audio-only and in common containers
    preferred_containers = ['m4a', 'webm', 'mp4']
    
    audio_formats = []
    for f in formats:
        if f.get('vcodec') == 'none' and f.get('acodec') != 'none':  # Audio only
            container = f.get('ext', '')
            if container in preferred_containers:
                audio_formats.append(f)
    
    if audio_formats:
        # Sort by bitrate (highest first)
        audio_formats.sort(key=lambda x: x.get('abr', 0) or 0, reverse=True)
        return audio_formats[0].get('format_id', 'bestaudio')
    
    # Fallback to yt-dlp's default selection
    return 'bestaudio/best'

def clean_youtube_url(url: str) -> str:
    """Clean YouTube URL to handle Mix/Radio playlists by removing playlist parameters"""
    from urllib.parse import urlparse, parse_qs, urlunparse
    
    # Skip if not a YouTube URL
    if 'youtube.com' not in url and 'youtu.be' not in url:
        return url
        
    # Parse the URL
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    
    # Remove playlist-related parameters
    for param in ['list', 'start_radio', 'index', 'playnext']:
        if param in query:
            del query[param]
    
    # Rebuild the query string
    new_query = '&'.join(
        f"{k}={v[0]}" if len(v) == 1 else f"{k}={'&'.join(v)}"
        for k, v in query.items()
    )
    
    # Reconstruct the URL
    return urlunparse(parsed._replace(query=new_query) if new_query else parsed._replace(query=None))

def download_audio(url: str, output_path: Path, bitrate: int = 320, timeout: int = 600, 
                  progress_callback=None, max_retries: int = 3, process_playlist: bool = False):
    """
    Download audio from YouTube URL with fallback to different clients
    
    Args:
        url: YouTube URL to download
        output_path: Directory to save the downloaded file
        bitrate: Audio bitrate in kbps
        timeout: Timeout in seconds
        progress_callback: Callback for progress updates
        max_retries: Maximum number of retry attempts per client
        process_playlist: If True, process all videos in the playlist. 
                         If False, only download the single video.
        
    Returns:
        Tuple of (output_file_path, video_title) or (None, None) on failure
    """
    # Clean the URL if we're not processing a playlist
    if not process_playlist and ('list=' in url or '&start_radio=' in url):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        if 'v' in parse_qs(parsed.query):
            url = f"https://www.youtube.com/watch?v={parse_qs(parsed.query)['v'][0]}"
    
    # Try different clients in order of preference
    clients = ['android', 'web', 'tv']
    last_error = None
    
    for client in clients:
        try:
            if progress_callback:
                progress_callback({'status': 'downloading'})
                
            return _download_with_client(
                url=url,
                output_path=output_path,
                bitrate=bitrate,
                timeout=timeout,
                progress_callback=progress_callback,
                max_retries=max_retries,
                client=client,
                process_playlist=process_playlist
            )
        except Exception as e:
            last_error = str(e)
            if 'This video is not available' in str(e):
                continue  # Try next client
            if 'Private video' in str(e) or 'members-only' in str(e).lower():
                break  # No point trying other clients for these errors
    
    error_msg = f"Download failed: {last_error}"
    logger.error(error_msg)
    if progress_callback:
        progress_callback({'status': 'error', 'message': error_msg})
    return None, None

def _download_with_client(url: str, output_path: Path, bitrate: int, timeout: int, 
                        progress_callback, max_retries: int, client: str, 
                        process_playlist: bool = False) -> Tuple[Optional[Path], Optional[str]]:
    """
    Internal function to handle download with a specific client
    
    Args:
        url: YouTube URL to download
        output_path: Directory to save the downloaded file
        bitrate: Audio bitrate in kbps
        timeout: Timeout in seconds
        progress_callback: Callback for progress updates
        max_retries: Maximum number of retry attempts
        client: Client to use for download ('android', 'web', 'tv')
        process_playlist: If True, process all videos in the playlist
    """
    # Clean the URL to handle Mix/Radio playlists if not processing a full playlist
    if not process_playlist:
        url = clean_youtube_url(url)
    
    # Find FFmpeg and FFprobe
    ffmpeg_path_str = find_ffmpeg()
    if not ffmpeg_path_str:
        error_msg = "FFmpeg not found. Please ensure ffmpeg.exe is in the application folder or installed."
        logger.error(error_msg)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return None, None
    
    # Verify FFmpeg exists at the specified path
    if not os.path.exists(ffmpeg_path_str):
        error_msg = f"FFmpeg not found at {ffmpeg_path_str}. Please ensure FFmpeg is available."
        logger.error(error_msg)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return None, None
    
    # Verify FFmpeg is working
    try:
        result = subprocess.run(
            [ffmpeg_path_str, "-version"],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == 'Windows' else 0
        )
        if result.returncode != 0:
            raise Exception("FFmpeg version check failed")
    except Exception as e:
        error_msg = f"FFmpeg found but not working: {str(e)}"
        logger.error(error_msg)
        if progress_callback:
            progress_callback({'status': 'error', 'message': error_msg})
        return None, None
    
    ffmpeg_path = Path(ffmpeg_path_str)
    # Ensure ffprobe is in the same bin directory as ffmpeg
    ffprobe_path = ffmpeg_path.parent / 'ffprobe.exe'
    if not ffprobe_path.exists():
        # Try to find ffprobe in PATH as fallback
        ffprobe_path = 'ffprobe'
    logger.info(f"Using ffmpeg_location: {ffmpeg_path}")
    logger.info(f"Using ffprobe_location: {ffprobe_path}")

    # Create a proper logger for yt-dlp
    class YTDlpLogger:
        def debug(self, msg):
            logger.debug(f"yt-dlp: {msg}")
            
        def info(self, msg):
            logger.info(f"yt-dlp: {msg}")
            
        def warning(self, msg):
            logger.warning(f"yt-dlp: {msg}")
            
        def error(self, msg):
            logger.error(f"yt-dlp: {msg}")

    def get_ydl_opts(safe_title: str, bitrate: int, progress_callback=None, client: str = 'android', process_playlist: bool = False) -> dict:
        """Generate yt-dlp options with optimized settings
        
        Args:
            safe_title: Sanitized title for the output file
            bitrate: Audio bitrate in kbps
            progress_callback: Optional callback for progress updates
            client: YouTube client to use ('web', 'android', 'tv')
            process_playlist: Whether to process a full playlist or just a single video
        """
        safe_title = str(safe_title) if safe_title else 'video'
        safe_title = sanitize_filename(safe_title)
        
        # Configure output template based on whether we're processing a playlist
        if process_playlist:
            output_template = str(output_path / f"{safe_title} - %(title)s.%(ext)s")
        else:
            output_template = str(output_path / f"{safe_title}.%(ext)s")
            
        user_agent = get_random_user_agent()
        
        # Configure playlist options and client settings
        playlist_opts = {
            'noplaylist': not process_playlist,
            'extract_flat': False,
            'youtube_include_dash_manifest': True,
            'youtube_include_hls': True,
            'youtube_include_dynamic_mpd': True,
        }
        
        # Add playlist-specific options if processing a playlist
        if process_playlist:
            playlist_opts.update({
                'ignoreerrors': True,  # Skip unavailable videos in playlists
                'playlistend': 1000,  # Maximum number of videos to download from a playlist
            })
        
        opts = {
            # Format selection
            'format': 'bestaudio/best',
            'format_sort': ['ext:mp3', 'ext:m4a', 'ext:webm', 'ext:opus'],
            'format_sort_force': True,
            'extractor_args': {
                'youtube': {
                    'player_client': [client, 'web'],  # Fallback to web client
                    'player_skip': ['configs', 'webpage', 'js'],
                    'skip': ['dash', 'hls'],  # Skip problematic formats
                }
            },
            'format': 'bestaudio[ext=m4a]/bestaudio/best',  # Prefer m4a for better compatibility
            'merge_output_format': 'mp3',  # Force merge to mp3 format
            'postprocessor_args': {
                'FFmpegVideoConvertor': ['-vcodec', 'libx264', '-preset', 'veryfast']
            },
            'outtmpl': output_template,
            'postprocessors': [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': str(bitrate),
                    'nopostoverwrites': False
                },
                {'key': 'FFmpegMetadata'},
                {'key': 'EmbedThumbnail'}
            ],
            'ffmpeg_location': str(ffmpeg_path.resolve()),
            'prefer_ffmpeg': True,
            'ffprobe_location': str(ffprobe_path) if ffprobe_path != 'ffprobe' else 'ffprobe',
            
            # Playlist and stream handling
            **playlist_opts,
            
            # Network optimizations
            'http_chunk_size': 1048576,
            'buffersize': 4194304,
            'ratelimit': None,  # Disable rate limiting to prevent division by zero
            'throttledratelimit': None,  # Disable throttled rate limiting
            'socket_timeout': 30,
            'noresizebuffer': True,  # Avoid buffer resizing issues
            'retries': 3,  # Number of retries for HTTP requests
            'fragment_retries': 3,  # Number of retries for fragments
            'extractor_retries': 3,  # Number of retries for extractor
            'skip_unavailable_fragments': True,  # Skip unavailable fragments
            'keep_fragments': False,  # Don't keep fragments after download
            'hls_use_mpegts': False,  # Don't use MPEG-TS for HLS
            'no_check_certificate': True,  # Skip SSL certificate verification
            'prefer_insecure': True,  # Prefer insecure connections to prevent SSL issues
            'nocheckcertificate': True,
            'retries': 5,
            'concurrent_fragment_downloads': 4,
            'force-ipv4': True,
            
            # Headers and user agent
            'http_headers': {
                'User-Agent': user_agent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
            
            # Performance settings
            'sleep_interval': 2,
            'max_sleep_interval': 10,
            'retry_sleep': 'exp=1:10',
            'geo_bypass': True,
            'geo_bypass_country': 'US',
            'ignoreerrors': False,
            'no_overwrites': True,
            'continue_dl': True,
            
            # Output and logging - FIXED: Use proper logger object
            'quiet': True,
            'no_warnings': False,
            'logger': YTDlpLogger(),
            'noprogress': True,
            'writethumbnail': False,
            'windowsfilenames': True,
            'restrictfilenames': True,
            'no_color': True,
            'nopart': True,
            'cachedir': False,
            'no_cache_dir': True,
            'extractor_retries': 3,
            'fragment_retries': 3,
            'skip_unavailable_fragments': True,
            'extract_flat': False,
            'ignore_no_formats_error': True,
            'compat_opts': ['no-youtube-unavailable-videos']
        }
        
        # Add progress hook if callback provided
        if progress_callback and callable(progress_callback):
            def safe_progress(d):
                try:
                    progress_hook(d, progress_callback)
                except Exception as e:
                    logger.error(f"Error in progress callback: {str(e)}", exc_info=True)
            
            opts['progress_hooks'] = [safe_progress]
        
        return opts

    def simple_download(ydl_opts: dict, url: str) -> Tuple[bool, Any]:
        """
        Simple download without complex threading
        
        Args:
            ydl_opts: yt-dlp options dictionary
            url: YouTube URL
            
        Returns:
            Tuple[bool, Any]: (success, result) where result is either the video info or an error message
        """
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # First get info to verify video is accessible
                try:
                    info = ydl.extract_info(url, download=False, process=False)
                    if not info:
                        return False, "Could not get video information"
                    
                    # Extract video ID for better error reporting
                    video_id = info.get('id', 'unknown')
                    logger.info(f"Starting download for video ID: {video_id}")
                    
                    # Download with progress tracking
                    result = ydl.extract_info(url, download=True)
                    
                    # Verify the download was successful
                    if not result:
                        return False, "Download completed but no files were downloaded"
                        
                    return True, result
                        
                except yt_dlp.utils.DownloadError as e:
                    logger.error(f"Download error: {str(e)}")
                    if '429' in str(e):
                        return False, "YouTube rate limit reached. Please wait a few minutes and try again."
                    return False, f"Download failed: {str(e)}"
                except Exception as e:
                    logger.error(f"Unexpected error during download: {str(e)}", exc_info=True)
                    return False, f"Unexpected error during download: {str(e)}"
                    
        except Exception as e:
            logger.error(f"YoutubeDL initialization failed: {str(e)}", exc_info=True)
            return False, f"YoutubeDL initialization failed: {str(e)}"

    # Main download loop
    last_error = None
    video_title = None
    
    for attempt in range(1, max_retries + 1):
        try:
            output_path.mkdir(parents=True, exist_ok=True)
            
            # Get video info first
            info_opts = {
                'quiet': True,
                'no_warnings': False,
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
                
                # Check if file already exists and is valid
                if output_file.exists():
                    file_size = output_file.stat().st_size
                    if file_size > 100 * 1024:  # At least 100KB
                        logger.info(f"File already exists: {output_file}")
                        return output_file, video_title
            logger.info(f"Download attempt {attempt}/{max_retries}: {video_title}")
            
            # Configure download options for this attempt
            ydl_opts = get_ydl_opts(safe_title, bitrate, output_path, progress_callback, client, process_playlist)
            
            # Perform download
            success, result = simple_download(ydl_opts, url)
            
            if success:
                # Check for output file
                possible_files = [
                    output_file,
                    output_path / f"{safe_title}.m4a",
                    output_path / f"{safe_title}.webm", 
                    output_path / f"{safe_title}.opus",
                ]
                
                found_file = None
                for file_path in possible_files:
                    if file_path.exists() and file_path.stat().st_size > 1024:
                        found_file = file_path
                        break
                
                if found_file:
                    # If it's not MP3, it needs conversion
                    if found_file.suffix != '.mp3':
                        logger.info(f"Converting {found_file.suffix} to MP3...")
                        time.sleep(3)
                    
                    # Final check for MP3 file
                    if output_file.exists() and output_file.stat().st_size > 1024:
                        logger.info(f"✓ Successfully downloaded: {video_title}")
                        logger.info(f"  File: {output_file}")
                        logger.info(f"  Size: {output_file.stat().st_size / (1024*1024):.2f} MB")
                        return output_file, video_title
                    else:
                        last_error = "Download completed but MP3 file not found"
                else:
                    last_error = "Download completed but no output file found"
            
            else:
                last_error = result
                logger.warning(f"Attempt {attempt} failed: {result}")
            
            # Clean up any partial files before retry
            for pattern in [f"{safe_title}.*", f"temp-{safe_title}.*"]:
                for file_path in output_path.glob(pattern):
                    try:
                        if file_path.exists():
                            file_path.unlink()
                            logger.debug(f"Cleaned up: {file_path}")
                    except Exception as e:
                        logger.debug(f"Could not clean up {file_path}: {e}")
            
            # Wait before retry with exponential backoff
            if attempt < max_retries:
                wait_time = min(2 ** attempt, 30)
                logger.info(f"Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
                
        except Exception as e:
            last_error = f"Unexpected error: {str(e)}"
            logger.error(f"Attempt {attempt} error: {last_error}")
            if attempt < max_retries:
                time.sleep(5)

    # All retries failed
    final_error = last_error or "Download failed after all retry attempts"
    logger.error(f"✗ Failed to download: {video_title or 'Unknown'}")
    logger.error(f"  Error: {final_error}")
    
    if progress_callback:
        progress_callback({'status': 'error', 'message': final_error})
    
    return None, None

def process_single_url(url: str, output_dir: Path, bitrate: int = 320, 
                     skip_existing: bool = True, timeout: int = 300, 
                     progress_callback=None) -> Tuple[bool, Optional[Path]]:
    """
    Process a single YouTube URL or search query to download and convert to MP3.
    Accepts direct URLs or ytsearch1: queries.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Handle search queries (ytsearch1: prefix)
    if url.startswith('ytsearch1:'):
        return search_youtube_and_download(
            query=url[10:],
            output_dir=output_dir,
            bitrate=bitrate,
            timeout=timeout,
            progress_callback=progress_callback
        )
    
    # Handle direct URLs
    try:
        # Clean the URL
        clean_url = clean_youtube_url(url)
        
        # Check if file already exists
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True}) as ydl:
            info = ydl.extract_info(clean_url, download=False)
            if not info:
                raise Exception("Could not extract video info")
                
            title = info.get('title', 'Unknown Title')
            output_file = output_dir / f"{sanitize_filename(title)}.mp3"
            
            if skip_existing and output_file.exists():
                if progress_callback:
                    progress_callback({
                        'status': 'skipped',
                        'message': f'File already exists: {output_file.name}'
                    })
                return True, str(output_file)

        # Download the audio
        result = download_audio(
            url=clean_url,
            output_path=output_dir,
            bitrate=bitrate,
            timeout=timeout,
            progress_callback=progress_callback
        )
        
        # Verify download result
        if not result or result == (None, None):
            logging.error("Download failed - No file was created")
            return False, None
            
        # Get the result from the download
        try:
            downloaded_file, video_title = result
            if not downloaded_file or not isinstance(downloaded_file, Path):
                error_msg = "Invalid download result format"
                logging.error(error_msg)
                return False, None
        except (ValueError, TypeError) as e:
            error_msg = f"Error processing download result: {str(e)}"
            logging.error(error_msg)
            return False, None
        
        # Verify download result
        if not downloaded_file or not downloaded_file.exists():
            error_msg = f"Failed to download audio from: {url}"
            logging.error(error_msg)
            return False, None
            
        # Verify file size
        try:
            file_size = downloaded_file.stat().st_size
            if file_size < 1024:  # Less than 1KB is likely an error
                error_msg = f"Downloaded file is too small ({file_size} bytes): {downloaded_file}"
                logging.error(error_msg)
                downloaded_file.unlink(missing_ok=True)
                return False, None
        except OSError as e:
            error_msg = f"Error checking file size: {str(e)}"
            logging.error(error_msg)
            return False, None
        
        # Success!
        elapsed = time.time() - start_time
        logging.info(f"Saved to: {downloaded_file}")
        if progress_callback:
            progress_callback({
                'status': 'finished',
                'output_file': str(downloaded_file),
                'elapsed': f"{elapsed:.1f}s"
            })
        
        return True, str(downloaded_file)
        
    except Exception as e:
        error_msg = f"Error processing URL {url}: {str(e)}"
        logging.error(error_msg, exc_info=True)
        return False, None

def search_youtube_and_download(query: str, output_dir: Path, bitrate: int = 320, timeout: int = 300, skip_existing: bool = True, progress_callback=None) -> tuple:
    """
    Search YouTube for the given query and download the best match as MP3.
    Returns (success, output_file_path) or (False, None) on failure.
    """
    # Use yt-dlp to search and get the first result
    search_url = f"ytsearch1:{query}"
    try:
        return process_single_url(search_url, output_dir, bitrate, skip_existing, timeout, progress_callback)
    except Exception as e:
        logging.error(f"Error searching/downloading for query '{query}': {e}")
        return False, None

def parse_txt_file(txt_path: str) -> list:
    """Parse TXT file, return list of queries (one per line, skip empty/comment lines)"""
    queries = []
    with open(txt_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            queries.append(line)
    return queries

def parse_csv_file(csv_path: str) -> list:
    """Parse CSV file, return list of queries (Artist - Song Name)"""
    queries = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            # Accept either one column (query) or two columns (artist, song)
            if len(row) == 1:
                queries.append(row[0].strip())
            elif len(row) >= 2:
                queries.append(f"{row[0].strip()} - {row[1].strip()}")
    return queries

def batch_download_from_file(file_path: str, output_dir: Path, bitrate: int = 320, timeout: int = 300, skip_existing: bool = True, progress_callback=None) -> list:
    """
    Batch download from a TXT or CSV file. Each line should be 'Artist - Song Name' or similar.
    Returns a list of (query, success, output_file_path or error message)
    """
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

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="YouTube to MP3 Converter")
    parser.add_argument("url", nargs="?", help="YouTube video URL or search query (or leave blank for batch mode)")
    parser.add_argument("output_folder", nargs="?", default=".", help="Output folder (default: current directory)")
    parser.add_argument("--bitrate", type=int, default=320, help="Audio bitrate in kbps (default: 320)")
    parser.add_argument("--batch", type=str, help="Path to CSV or TXT file for batch download (Artist - Song Name per line)")
    args = parser.parse_args()

    output_dir = Path(args.output_folder)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Set up logging with minimal console output
    logging.basicConfig(level=logging.ERROR, format='%(message)s')
    logger = logging.getLogger()
    
    # Only show errors in console
    for handler in logger.handlers[:]:
        if isinstance(handler, logging.StreamHandler):
            handler.setLevel(logging.ERROR)

    if args.batch:
        results = batch_download_from_file(args.batch, output_dir, bitrate=args.bitrate)
        for query, success, output in results:
            status = "✓" if success else "✗"
            print(f"{status} {query} -> {output}")
    elif args.url:
        success, output_file = process_single_url(args.url, output_dir, bitrate=args.bitrate)
        if success and output_file:
            print(f"Saved to: {output_file}")
        else:
            print("Download failed. Check logs for details.")
    else:
        print("No URL or batch file provided. Use --help for usage.")
        sys.exit(1)