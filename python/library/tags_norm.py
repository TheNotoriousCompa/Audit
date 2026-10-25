"""Artist/title normalization shared by downloader and library scanner.

YouTube-sourced files usually carry the *channel* as artist and the raw
video title (full of "(Official Audio)"-style noise) as title. These
helpers clean both sides and reconcile tag vs filename evidence so the
library can group by real artist.

Clean-room: hand-written heuristics, no vendor code.
"""
import re
from typing import Dict, Optional, Tuple

# Bracketed/parenthesized noise commonly found in video titles.
_NOISE_PATTERNS = [
    r"\(official\s+(music\s+)?video\)",
    r"\(official\s+audio\)",
    r"\[official\s+(music\s+)?video\]",
    r"\[official\s+audio\]",
    r"\(music\s+video\)",
    r"\(lyric\s+video\)",
    r"\(lyrics?\)",
    r"\blyric\s+video\b",
    r"\(audio\)",
    r"\(visualizer\)",
    r"\(visualiser\)",
    r"\[4k\]",
    r"\[hd\]",
    r"\(hd\)",
    r"\(hq\)",
    r"\(m/?v\)",
]
_NOISE_RE = re.compile("|".join(f"(?:{p})" for p in _NOISE_PATTERNS), re.IGNORECASE)

_SEPARATORS = [" - ", " – ", " — ", " :: ", " ― "]


def clean_title(raw: str) -> str:
    """Strip platform noise from a song title."""
    if not raw:
        return ""
    s = raw.strip()
    s = _NOISE_RE.sub("", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" -–—~|")
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\[\s*\]", "", s)
    return re.sub(r"\s{2,}", " ", s).strip()


def clean_artist(raw: str) -> str:
    """Strip channel cruft (auto-generated channels, VEVO suffixes)."""
    if not raw:
        return ""
    s = raw.strip()
    s = re.sub(r"\s+-\s+topic\s*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*vevo\s*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^official\s+", "", s, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", s).strip()


def split_artist_title(text: str) -> Optional[Tuple[str, str]]:
    """Split 'Artist - Title' style strings. Returns None when no split."""
    if not text:
        return None
    s = text.strip()
    for sep in _SEPARATORS:
        if sep in s:
            left, right = s.split(sep, 1)
            left, right = left.strip(), right.strip()
            if left and right and len(left) <= 80:
                return left, right
    # Quoted form: Artist "Title"
    m = re.match(r'^(.+?)\s+"([^"]+)"\s*$', s)
    if m and m.group(1).strip() and m.group(2).strip():
        return m.group(1).strip(), m.group(2).strip()
    return None


def reconcile(tag_title: str, tag_artist: str, filename_stem: str) -> Dict[str, str]:
    """Pick the best (title, artist) from tag vs filename evidence.

    Rules:
    - Clean everything first.
    - If the filename splits cleanly into artist + title, prefer it when
      tags carry no artist OR the tag title still contains the filename
      stem (i.e. tags are just the raw video title).
    - Otherwise keep tags, cleaned.
    """
    t_title = clean_title(tag_title or "")
    t_artist = clean_artist(tag_artist or "")
    stem = (filename_stem or "").strip()
    split = split_artist_title(stem)
    if split:
        f_artist, f_title = clean_artist(split[0]), clean_title(split[1])
        if f_artist and f_title:
            stem_low = stem.lower()
            tag_has_stem = stem_low and (
                stem_low in (tag_title or "").lower() or stem_low in (tag_artist or "").lower()
            )
            if not t_artist or tag_has_stem or t_artist.lower() == f_artist.lower():
                return {"title": f_title or t_title or stem,
                        "artist": f_artist}
    if t_title:
        return {"title": t_title, "artist": t_artist}
    if split:
        return {"title": clean_title(split[1]), "artist": clean_artist(split[0])}
    cleaned_stem = clean_title(stem)
    return {"title": cleaned_stem or stem, "artist": t_artist}
