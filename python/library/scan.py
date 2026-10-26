"""Local library scanner (clean-room).

Scans a directory for audio files and returns track metadata as JSON.
Uses mutagen when available, degrades to filename parsing otherwise.

Protocol: prints exactly one line
  {"type": "scan-result", "data": {"success": bool, "root": str,
   "count": int, "tracks": [...], "error": str}}
on stdout. Human logs go to stderr.
"""
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Embedded Python distributions run in "._pth" mode: the script directory is
# NOT added to sys.path, so the local helper modules (tags_norm, genres) must
# be registered explicitly or every scan fails with ImportError.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
except Exception:
    pass

AUDIO_EXTS = {".mp3", ".m4a", ".mp4", ".flac", ".wav", ".opus", ".ogg", ".wma", ".aac"}

try:
    import mutagen  # type: ignore
    from mutagen import File as MutagenFile  # type: ignore
    HAS_MUTAGEN = True
except Exception:
    mutagen = None  # type: ignore
    MutagenFile = None  # type: ignore
    HAS_MUTAGEN = False


def _read_tags(path: Path) -> Dict[str, Any]:
    meta: Dict[str, Any] = {"title": "", "artist": "", "album": "", "genre": "",
                             "duration": 0.0, "has_art": False, "lrc": False}
    if HAS_MUTAGEN:
        try:
            audio = MutagenFile(str(path), easy=True)
            if audio is not None:
                def first(key: str) -> str:
                    try:
                        vals = audio.get(key)
                        if vals:
                            return str(vals[0])
                    except Exception:
                        pass
                    return ""

                meta["title"] = first("title")
                meta["artist"] = first("artist")
                meta["album"] = first("album")
                meta["genre"] = first("genre")
                try:
                    length = getattr(audio.info, "length", 0.0) or 0.0
                    meta["duration"] = round(float(length), 2)
                except Exception:
                    pass
                # Embedded art detection without loading bytes.
                try:
                    raw = MutagenFile(str(path))
                    has_art = False
                    if raw is not None:
                        if raw.__class__.__name__ in ("MP3",):
                            from mutagen.id3 import APIC  # type: ignore
                            has_art = any(isinstance(v, APIC)
                                          for v in raw.values()) if hasattr(raw, "values") else False
                        elif hasattr(raw, "pictures") and getattr(raw, "pictures", None):
                            has_art = True
                        elif "covr" in getattr(raw, "keys", lambda: [])():
                            has_art = True
                    meta["has_art"] = bool(has_art)
                except Exception:
                    pass
        except Exception as exc:
            print(f"[scan] tag read failed for {path.name}: {exc}", file=sys.stderr)
    # Reconcile tag evidence with the filename (YouTube tags are noisy).
    try:
        from library.tags_norm import reconcile, clean_title
    except ImportError:  # pragma: no cover - direct script fallback
        from tags_norm import reconcile, clean_title  # type: ignore
    best = reconcile(meta["title"], meta["artist"], path.stem)
    meta["title"] = best["title"] or clean_title(path.stem) or path.stem
    meta["artist"] = best["artist"]
    # Lyrics sidecar: <basename>.lrc next to the audio file.
    try:
        meta["lrc"] = path.with_suffix(".lrc").exists()
    except Exception:
        pass
    return meta


def scan_directory(root: str) -> Dict[str, Any]:
    base = Path(root)
    tracks: List[Dict[str, Any]] = []
    if not base.exists():
        return {"success": False, "root": str(root), "count": 0,
                "tracks": [], "error": f"Directory does not exist: {root}"}
    try:
        files = sorted(p for p in base.rglob("*")
                       if p.is_file() and p.suffix.lower() in AUDIO_EXTS
                       and not p.name.startswith(".write-test"))
    except Exception as exc:
        return {"success": False, "root": str(root), "count": 0,
                "tracks": [], "error": str(exc)}
    for p in files:
        try:
            st = p.stat()
            tags = _read_tags(p)
            tracks.append({
                "path": str(p),
                "filename": p.name,
                "size": st.st_size,
                "mtime": st.st_mtime,
                "ext": p.suffix.lower().lstrip("."),
                **tags,
            })
        except Exception as exc:
            print(f"[scan] skipped {p}: {exc}", file=sys.stderr)
    # Smart genre pass (tag normalization + album/artist votes + path rules).
    try:
        try:
            from library.genres import infer_tracks
        except ImportError:  # pragma: no cover - direct script fallback
            from genres import infer_tracks  # type: ignore
        infer_tracks(tracks)
    except Exception as exc:
        print(f"[scan] genre inference skipped: {exc}", file=sys.stderr)
    return {"success": True, "root": str(base), "count": len(tracks),
            "tracks": tracks, "error": ""}


FOLDER_ART_NAMES = {"cover", "folder", "albumart", "album_art", "front"}
FOLDER_ART_EXTS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                   ".png": "image/png", ".webp": "image/webp"}
MAX_ART_BYTES = 4 * 1024 * 1024


def _embedded_art(path: Path) -> Optional[tuple]:
    """Return (mime, bytes) of embedded art, or None."""
    if not HAS_MUTAGEN:
        return None
    try:
        raw = MutagenFile(str(path))
        if raw is None:
            return None
        cname = raw.__class__.__name__
        if cname == "MP3" and hasattr(raw, "tags") and raw.tags is not None:
            from mutagen.id3 import APIC  # type: ignore
            for v in raw.tags.values():
                if isinstance(v, APIC) and getattr(v, "data", None):
                    return (getattr(v, "mime", None) or "image/jpeg", bytes(v.data))
        pics = getattr(raw, "pictures", None)
        if pics:
            p = pics[0]
            return (getattr(p, "mime", None) or "image/jpeg", bytes(p.data))
        try:
            keys = list(raw.keys())
        except Exception:
            keys = []
        if "covr" in keys:  # MP4/M4A
            cov = raw["covr"][0]
            fmt = getattr(cov, "imageformat", None)
            mime = "image/png" if str(fmt).upper().endswith("PNG") else "image/jpeg"
            return (mime, bytes(cov))
        if "WM/Picture" in keys:  # WMA/ASF
            attr = raw["WM/Picture"][0]
            data = getattr(attr, "value", None)
            if data is not None and getattr(data, "data", None):
                mime = getattr(data, "mime", None) or "image/jpeg"
                if isinstance(mime, bytes):
                    mime = mime.decode("utf-16-le", "replace").rstrip("\x00")
                return (str(mime), bytes(data.data))
        if "metadata_block_picture" in keys:  # OGG/Opus
            import base64
            from mutagen.flac import Picture  # type: ignore
            pic = Picture(base64.b64decode(str(raw["metadata_block_picture"][0])))
            if pic.data:
                return (pic.mime or "image/jpeg", bytes(pic.data))
    except Exception as exc:
        print(f"[scan] art read failed for {path.name}: {exc}", file=sys.stderr)
    return None


def get_art(path_str: str) -> Dict[str, Any]:
    """Embedded art first, then folder art files. Returns data-URL or found=False."""
    import base64
    p = Path(path_str)
    found = _embedded_art(p) if p.exists() else None
    if found is None and p.exists():
        try:
            for sib in p.parent.iterdir():
                if (sib.is_file() and sib.stem.lower() in FOLDER_ART_NAMES
                        and sib.suffix.lower() in FOLDER_ART_EXTS
                        and sib.stat().st_size <= MAX_ART_BYTES):
                    return {"found": True, "mime": FOLDER_ART_EXTS[sib.suffix.lower()],
                            "data_url": "data:{};base64,{}".format(
                                FOLDER_ART_EXTS[sib.suffix.lower()],
                                base64.b64encode(sib.read_bytes()).decode("ascii")),
                            "source": "folder", "error": ""}
        except Exception as exc:
            return {"found": False, "mime": "", "data_url": "",
                    "source": "", "error": str(exc)}
    if found is None:
        return {"found": False, "mime": "", "data_url": "", "source": "", "error": ""}
    mime, data = found
    if len(data) > MAX_ART_BYTES:
        return {"found": False, "mime": "", "data_url": "",
                "source": "", "error": "art too large"}
    return {"found": True, "mime": mime,
            "data_url": "data:{};base64,{}".format(
                mime, base64.b64encode(data).decode("ascii")),
            "source": "embedded", "error": ""}


def write_tags(path_str: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort tag write (title/artist/album/genre). Returns fresh track dict."""
    p = Path(path_str)
    if not p.exists():
        return {"success": False, "track": None, "error": "file not found"}
    if not HAS_MUTAGEN:
        return {"success": False, "track": None, "error": "mutagen unavailable"}
    title = str(fields.get("title", "") or "")
    artist = str(fields.get("artist", "") or "")
    album = str(fields.get("album", "") or "")
    genre = str(fields.get("genre", "") or "")
    try:
        ext = p.suffix.lower()
        if ext == ".mp3":
            from mutagen.id3 import ID3, TIT2, TPE1, TALB, TCON  # type: ignore
            try:
                tags = ID3(str(p))
            except Exception:
                tags = ID3()
            if title:
                tags.delall("TIT2")
                tags.add(TIT2(encoding=3, text=title))
            if artist:
                tags.delall("TPE1")
                tags.add(TPE1(encoding=3, text=artist))
            if album:
                tags.delall("TALB")
                tags.add(TALB(encoding=3, text=album))
            if genre:
                tags.delall("TCON")
                tags.add(TCON(encoding=3, text=genre))
            tags.save(str(p), v2_version=3)
        elif ext in (".m4a", ".mp4"):
            from mutagen.mp4 import MP4  # type: ignore
            audio = MP4(str(p))
            tags = audio.tags
            if tags is None:
                audio.add_tags()
                tags = audio.tags
            assert tags is not None
            if title:
                tags["\xa9nam"] = [title]
            if artist:
                tags["\xa9ART"] = [artist]
            if album:
                tags["\xa9alb"] = [album]
            if genre:
                tags["\xa9gen"] = [genre]
            audio.save()
        elif ext in (".flac", ".ogg", ".opus"):
            audio = MutagenFile(str(p), easy=True)
            if audio is None:
                raise ValueError("unsupported file")
            if title:
                audio["title"] = [title]
            if artist:
                audio["artist"] = [artist]
            if album:
                audio["album"] = [album]
            if genre:
                audio["genre"] = [genre]
            audio.save()
        elif ext == ".wma":
            from mutagen.asf import ASF  # type: ignore
            from mutagen.asf import ASFUnicodeAttribute  # type: ignore
            audio = ASF(str(p))
            if title:
                audio["Title"] = ASFUnicodeAttribute(title)
            if artist:
                audio["Author"] = ASFUnicodeAttribute(artist)
            if album:
                audio["WM/AlbumTitle"] = ASFUnicodeAttribute(album)
            if genre:
                audio["WM/Genre"] = ASFUnicodeAttribute(genre)
            audio.save()
        else:
            return {"success": False, "track": None,
                    "error": f"write not supported for {ext}"}
    except Exception as exc:
        return {"success": False, "track": None, "error": str(exc)}
    try:
        st = p.stat()
        tags = _read_tags(p)
        return {"success": True, "track": {
            "path": str(p), "filename": p.name, "size": st.st_size,
            "mtime": st.st_mtime, "ext": p.suffix.lower().lstrip("."), **tags,
        }, "error": ""}
    except Exception as exc:
        return {"success": False, "track": None, "error": str(exc)}


def main(argv: Optional[List[str]] = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if len(args) == 2 and args[0] == "--art":
        print(json.dumps({"type": "art-result", "data": get_art(args[1])}), flush=True)
        return 0
    if len(args) == 3 and args[0] == "--set-tag":
        try:
            fields = json.loads(args[2])
            if not isinstance(fields, dict):
                raise ValueError("fields must be an object")
        except Exception as exc:
            print(json.dumps({"type": "tag-result", "data": {
                "success": False, "track": None, "error": str(exc)}}), flush=True)
            return 2
        result = write_tags(args[1], fields)
        print(json.dumps({"type": "tag-result", "data": result}), flush=True)
        return 0 if result["success"] else 1
    if len(args) != 1:
        print(json.dumps({"type": "scan-result", "data": {
            "success": False, "root": "", "count": 0,
            "tracks": [], "error": "Usage: scan.py <directory> | scan.py --art <file> | scan.py --set-tag <file> <json>"}}))
        return 2
    result = scan_directory(args[0])
    print(json.dumps({"type": "scan-result", "data": result}), flush=True)
    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
