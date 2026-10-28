import os
import shutil
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def check_ffmpeg():
    r"""
    Looks for FFmpeg in the following order:
    1. System PATH
    2. Bundled app folders (packaged/unpacked)
    3. Common Windows installation paths
    4. Deep recursive search on C:\ (Windows only, with 8s timeout)
    """
    
    # 1. Check System PATH (Fastest and most standard)
    path_check = shutil.which("ffmpeg")
    if path_check:
        logger.info(f"FFmpeg found in system PATH: {path_check}")
        return str(Path(path_check).resolve())

    # 2. Check Bundled/Relative locations (Specific to your app structure)
    # Note: Using .parent.parent... because this file is in downloader/
    current_file_path = Path(__file__).resolve()
    base_dir = current_file_path.parent.parent.parent # Usually 'python/' or 'app.asar.unpacked/'
    
    app_paths = [
        # Strategy A: We are in resources/python/downloader/
        base_dir / "app.asar.unpacked" / "ffmpeg" / "bin" / "ffmpeg.exe",
        # Strategy B: We are in resources/app.asar.unpacked/python/downloader/
        base_dir / "ffmpeg" / "bin" / "ffmpeg.exe",
        # Strategy C: We are in extraResources/
        base_dir.parent / "app.asar.unpacked" / "ffmpeg" / "bin" / "ffmpeg.exe",
        base_dir.parent / "ffmpeg" / "bin" / "ffmpeg.exe",
        # Strategy D: Relative to python root
        base_dir / ".." / "ffmpeg" / "bin" / "ffmpeg.exe",
        # Fallbacks
        current_file_path.parent / "ffmpeg.exe",
        Path.cwd() / "ffmpeg.exe"
    ]

    for path in app_paths:
        try:
            resolved_path = path.resolve()
            logging.debug(f"Checking FFmpeg at: {resolved_path}")
            if resolved_path.is_file():
                logging.info(f"FFmpeg found at: {resolved_path}")
                return str(resolved_path)
        except Exception:
            continue

    # 3. Common Windows Install Paths
    common_install_paths = [
        Path("C:\\ffmpeg\\bin\\ffmpeg.exe"),
        Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "ffmpeg" / "bin" / "ffmpeg.exe",
        Path(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")) / "ffmpeg" / "bin" / "ffmpeg.exe"
    ]

    for path in common_install_paths:
        try:
            if path.exists():
                logger.info(f"FFmpeg found in common install path: {path}")
                return str(path.resolve())
        except Exception:
            continue

    # 4. DEEP SEARCH fallback (Searching the whole PC)
    if os.name == 'nt':
        try:
            logger.info("FFmpeg not found in standard spots. Starting deep search on C:\\...")
            # 'where /R' is the fastest native Windows search command
            result = subprocess.run(
                ['where', '/R', 'C:\\', 'ffmpeg.exe'], 
                capture_output=True, text=True, timeout=8
            )
            if result.returncode == 0:
                first_match = result.stdout.splitlines()[0]
                logger.info(f"FFmpeg found via deep search: {first_match}")
                return str(Path(first_match).resolve())
        except Exception as e:
            logger.debug(f"Deep search ignored or timed out: {e}")
            pass
    
    logger.error("FFmpeg not found in standard locations or via deep search")
    return None
