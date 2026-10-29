import os
import shutil
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _executable_name() -> str:
    return "ffmpeg.exe" if os.name == "nt" else "ffmpeg"


def _working_ffmpeg(candidate: str) -> str:
    """Return a resolved path only when ffmpeg -version succeeds."""
    try:
        path = Path(candidate).resolve()
        if not path.is_file():
            return ""
        result = subprocess.run(
            [str(path), "-version"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode == 0:
            return str(path)
        logger.debug("FFmpeg candidate failed version check: %s", path)
    except Exception as exc:
        logger.debug("FFmpeg candidate ignored: %s (%s)", candidate, exc)
    return ""


def _env_candidates() -> list[str]:
    raw = os.environ.get("AUDIT_FFMPEG_PATH", "").strip().strip('"')
    if not raw:
        return []
    path = Path(raw)
    try:
        if path.is_dir():
            return [str(path / _executable_name())]
    except Exception:
        pass
    return [raw]


def _bundle_candidates() -> list[str]:
    current = Path(__file__).resolve()
    base = current.parent.parent.parent
    exe = _executable_name()
    return [
        str(base / "ffmpeg" / "bin" / exe),
        str(base / "app.asar.unpacked" / "ffmpeg" / "bin" / exe),
        str(base.parent / "ffmpeg" / "bin" / exe),
        str(base.parent / "app.asar.unpacked" / "ffmpeg" / "bin" / exe),
        str(base / exe),
        str(base.parent / exe),
        str(current.parent / exe),
        str(Path.cwd() / exe),
    ]


def _common_candidates() -> list[str]:
    exe = _executable_name()
    if os.name == "nt":
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        user_profile = os.environ.get("USERPROFILE", "")
        paths = [
            r"C:\ffmpeg\bin\ffmpeg.exe",
            str(Path(program_files) / "ffmpeg" / "bin" / "ffmpeg.exe"),
            str(Path(program_files_x86) / "ffmpeg" / "bin" / "ffmpeg.exe"),
            r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
        ]
        if local_app_data:
            paths.append(str(Path(local_app_data) / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe"))
        if user_profile:
            paths.append(str(Path(user_profile) / "scoop" / "shims" / "ffmpeg.exe"))
        return paths
    return [
        f"/usr/bin/{exe}",
        f"/usr/local/bin/{exe}",
        f"/opt/homebrew/bin/{exe}",
    ]


def check_ffmpeg():
    r"""Find FFmpeg without scanning the whole filesystem.

    Order:
    1. AUDIT_FFMPEG_PATH
    2. bundled app files
    3. PATH
    4. common install locations
    """
    candidates = [
        *_env_candidates(),
        *_bundle_candidates(),
    ]
    path_check = shutil.which("ffmpeg")
    if path_check:
        candidates.append(path_check)
    candidates.extend(_common_candidates())

    seen = set()
    for candidate in candidates:
        try:
            key = str(Path(candidate).resolve())
        except Exception:
            key = candidate
        if key in seen:
            continue
        seen.add(key)
        resolved = _working_ffmpeg(candidate)
        if resolved:
            logger.info("FFmpeg found at: %s", resolved)
            return resolved

    logger.error("FFmpeg not found in AUDIT_FFMPEG_PATH, the app bundle, PATH, or common locations")
    return None
