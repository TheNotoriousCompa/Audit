"""Smart genre inference from local metadata (no audio analysis).

Three passes, cheapest first:

1. Normalize the file's own genre tag onto a small canonical taxonomy
   (handles ID3v1 numeric genres and the usual synonym soup).
2. Vote by album and artist: a tagged majority labels the untagged rest.
3. Keyword rules on folder names and filenames (e.g. ".../DARK SOULS III OST").

The result is additive: original tags are never modified. The scanner exposes
``genre_guess``, ``genre_confidence`` and ``genre_source`` for the UI.
"""
import os
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Canonical taxonomy
# ---------------------------------------------------------------------------
CANONICAL = [
    "Pop", "Rock", "Hip Hop", "Rap", "R&B", "Soul & Funk",
    "Electronic", "House", "Techno", "Trance", "Drum & Bass", "Dubstep",
    "Ambient", "Lo-fi",
    "Metal", "Punk",
    "Jazz", "Blues", "Classical",
    "Folk", "Country",
    "Reggae", "Latin", "World",
    "Soundtrack",
]

# ID3v1 genre list (0-147) — still the most common numeric tag payload.
ID3V1_GENRES = [
    "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge",
    "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B",
    "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska",
    "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient",
    "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical",
    "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise",
    "AlternRock", "Bass", "Soul", "Punk", "Space", "Meditative",
    "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave",
    "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream",
    "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap",
    "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave",
    "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal",
    "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll",
    "Hard Rock", "Folk", "Folk-Rock", "National Folk", "Swing", "Fast Fusion",
    "Bebop", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde",
    "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock",
    "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour",
    "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony",
    "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club",
    "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul",
    "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A cappella", "Euro-House",
    "Dance Hall", "Goa", "Drum & Bass", "Club-House", "Hardcore", "Terror",
    "Indie", "BritPop", "Afro-Punk", "Polsk Punk", "Beat", "Christian Gangsta",
    "Heavy Metal", "Black Metal", "Crossover", "Contemporary Christian",
    "Christian Rock", "Merengue", "Salsa", "Thrash Metal", "Anime", "JPop",
    "Synthpop",
]

# Order matters: the most specific patterns are matched first.
_RULES = [
    (r"drum ?(?:and|&|n) ?bass|\bdnb\b|\bd&b\b|\bjungle\b", "Drum & Bass"),
    (r"dubstep|riddim|brostep|future bass", "Dubstep"),
    (r"psy ?trance|\btrance\b", "Trance"),
    (r"deep house|tech house|progressive house|acid house|electro house|\bhouse\b", "House"),
    (r"techno|schranz", "Techno"),
    (r"phonk|trap|drill|grime|boom ?bap|hip ?hop|hiphop|gangsta|rap\b|rapper", "Hip Hop"),
    (r"r ?& ?b\b|rnb|rhythm and blues|contemporary r&b", "R&B"),
    (r"soul|funk|disco|motown|neo ?soul", "Soul & Funk"),
    (r"metal|metalcore|deathcore|grindcore|doom|djent", "Metal"),
    (r"punk|emo\b|screamo|hardcore punk", "Punk"),
    (r"indie|alternative|alt ?rock|grunge|shoegaze|post ?rock|classic rock|hard rock|rock ?n ?roll|\brock\b", "Rock"),
    (r"jazz|bebop|bop\b|swing|fusion", "Jazz"),
    (r"blues|boogie", "Blues"),
    (r"classical|orchestral|orchestra|symphon|baroque|opera|chamber|sonata|piano solo", "Classical"),
    (r"soundtrack|\bost\b|original score|\bscore\b|video game|game music|\bgame\b|anime|film music|movie", "Soundtrack"),
    (r"ambient|drone|new age|meditative|space music", "Ambient"),
    (r"lo ?-?fi|chillhop", "Lo-fi"),
    (r"reggae|dancehall|dub\b|ska\b|rocksteady", "Reggae"),
    (r"latin|salsa|bachata|merengue|reggaeton|reggaetón|cumbia|bossa nova|tango|samba", "Latin"),
    (r"country|bluegrass|americana", "Country"),
    (r"folk|celtic|acoustic|singer ?- ?songwriter|ballad", "Folk"),
    (r"afrobeat|afropop|highlife|ethnic|tribal|world music|\bworld\b|polka|celtic", "World"),
    (r"synth ?pop|dream pop|k ?pop|j ?pop|pop ?punk|power pop|\bpop\b", "Pop"),
    (r"electronic|electronica|\bedm\b|\belectro\b|\bidm\b|synthwave|vaporwave|breakbeat|\bgarage\b|chiptune|8 ?-?bit|downtempo|big beat|hardcore techno|hardstyle|gabber|industrial", "Electronic"),
]

_FOLDER_HINTS = [
    (r"\bost\b|soundtrack|original score|game rip|vgm", "Soundtrack"),
    (r"\brap\b|hip ?hop|mixtape", "Hip Hop"),
    (r"\bmetal\b", "Metal"),
    (r"\bjazz\b", "Jazz"),
    (r"\bclassical\b", "Classical"),
    (r"\bphonk\b", "Hip Hop"),
    (r"\btechno\b", "Techno"),
    (r"\bhouse\b", "House"),
]

_COMPILED = [(re.compile(pattern, re.IGNORECASE), genre) for pattern, genre in _RULES]
_COMPILED_FOLDER = [(re.compile(pattern, re.IGNORECASE), genre) for pattern, genre in _FOLDER_HINTS]

_CONFIDENCE = {"tag": 0.95, "artist_seed": 0.9, "album": 0.8, "artist": 0.68, "folder": 0.6, "filename": 0.55}

# Small seed lexicon: well-known artists whose genre is unambiguous. Matched as
# substrings of the cleaned artist string, so "Yuka Kitamura, Yuka Kitamura"
# still maps. Covers libraries that carry no genre tags at all.
ARTIST_SEEDS = {
    # hip hop / rap
    "caparezza": "Rap", "eminem": "Hip Hop", "logic": "Hip Hop", "kanye west": "Hip Hop",
    "travis scott": "Hip Hop", "kendrick lamar": "Hip Hop", "nas": "Hip Hop",
    "mobb deep": "Hip Hop", "the notorious b.i.g": "Hip Hop", "denzel curry": "Hip Hop",
    "jedi mind tricks": "Hip Hop", "freddie dredd": "Hip Hop", "moxifloxi": "Hip Hop",
    "yad oud": "Hip Hop", "don toliver": "Hip Hop", "playboi carti": "Hip Hop",
    "future": "Hip Hop", "metro boomin": "Hip Hop", "jid": "Hip Hop", "joey bada$$": "Hip Hop",
    "pusha t": "Hip Hop", "wu-tang clan": "Hip Hop", "ice cube": "Hip Hop", "jay-z": "Hip Hop",
    "a$ap rocky": "Hip Hop", "schoolboy q": "Hip Hop", "tyler, the creator": "Hip Hop",
    "mac miller": "Hip Hop", "lil wayne": "Hip Hop", "drake": "Hip Hop", "21 savage": "Hip Hop",
    "run the jewels": "Hip Hop", "mf doom": "Hip Hop", "rakim": "Hip Hop", "gang starr": "Hip Hop",
    "scarlxrd": "Hip Hop", "ghostemane": "Hip Hop", "suicideboys": "Hip Hop",
    # electronic
    "daft punk": "Electronic", "crystal castles": "Electronic", "aphex twin": "Electronic",
    "bonobo": "Electronic", "four tet": "Electronic", "flume": "Electronic",
    "skrillex": "Dubstep", "excision": "Dubstep", "zeds dead": "Dubstep",
    "fisher": "House", "disclosure": "House",
    "gesaffelstein": "Techno", "amelie lens": "Techno", "charlotte de witte": "Techno",
    "carpenter brut": "Electronic", "perturbator": "Electronic", "m|o|o|n": "Electronic",
    # rock / metal / punk
    "radiohead": "Rock", "nirvana": "Rock", "tame impala": "Rock", "arctic monkeys": "Rock",
    "franz ferdinand": "Rock", "queen": "Rock", "mgmt": "Rock", "mac demarco": "Rock",
    "the rolling stones": "Rock", "tom petty": "Rock", "supertramp": "Rock",
    "linkin park": "Metal", "slipknot": "Metal", "metallica": "Metal", "opeth": "Metal",
    "green day": "Punk", "blink-182": "Punk", "misfits": "Punk",
    # pop / soul / funk
    "dua lipa": "Pop", "the weeknd": "Pop", "michael jackson": "Pop", "calcutta": "Pop",
    "franco battiato": "Pop", "tom misch": "Soul & Funk", "vulfpeck": "Soul & Funk",
    "stevie wonder": "Soul & Funk", "james brown": "Soul & Funk", "earth, wind & fire": "Soul & Funk",
    # jazz / blues / classical / folk
    "miles davis": "Jazz", "john coltrane": "Jazz", "bill evans": "Jazz", "nujabes": "Jazz",
    "bb king": "Blues", "b.b. king": "Blues", "robert johnson": "Blues",
    "ludovico einaudi": "Classical", "johann sebastian bach": "Classical", "chopin": "Classical",
    "fabrizio de andre": "Folk", "fabrizio de andré": "Folk", "bob dylan": "Folk",
    "fleet foxes": "Folk", "nick drake": "Folk",
    # reggae / latin / world
    "bob marley": "Reggae", "damian marley": "Reggae", "alborosie": "Reggae",
    "bad bunny": "Latin", "manu chao": "Latin",
    # soundtracks / game composers
    "toby fox": "Soundtrack", "omori": "Soundtrack", "square enix music": "Soundtrack",
    "yuka kitamura": "Soundtrack", "motoi sakuraba": "Soundtrack", "keigo hoashi": "Soundtrack",
    "kumi tanioka": "Soundtrack", "nobuyoshi suzuki": "Soundtrack", "tsukasa saitoh": "Soundtrack",
    "christopher larkin": "Soundtrack", "howard shore": "Soundtrack", "hans zimmer": "Soundtrack",
    "ennio morricone": "Soundtrack", "jeremy soule": "Soundtrack", "inon zur": "Soundtrack",
    "marcin przybyłowicz": "Soundtrack", "p.t. adamczyk": "Soundtrack", "paul leonard-morgan": "Soundtrack",
    "yuka kitamura, yuka": "Soundtrack", "yasunori mitsuda": "Soundtrack", "joe hisaishi": "Soundtrack",
    "lorenzo cappuccio": "Soundtrack", "guillaume david": "Soundtrack", "hideki taniuchi": "Soundtrack",
}




def _clean(raw: str) -> str:
    """Lowercase, fold accents and strip bracketed noise for matching."""
    s = (raw or "").strip().lower()
    # Fold diacritics so "Fabrizio De André" matches the ASCII seed key.
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    s = re.sub(r"\bfeat\.?\b.*$", " ", s)
    s = re.sub(r"[^a-z0-9&]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# Seed keys are normalized with the same function as artist strings, then
# matched longest-first. Without this, keys containing dots/punctuation
# ("the notorious b.i.g", "a$ap rocky", "m|o|o|n") could never match.
_SEED_KEYS = sorted(
    (((_clean(key), genre) for key, genre in ARTIST_SEEDS.items())),
    key=lambda kv: len(kv[0]),
    reverse=True,
)


def _from_text(text: str) -> str:
    cleaned = _clean(text)
    if not cleaned:
        return ""
    for pattern, genre in _COMPILED:
        if pattern.search(cleaned):
            return genre
    return ""


def normalize_genre(raw: str) -> str:
    """Map a raw tag value (text or ID3v1 number) onto the taxonomy."""
    value = (raw or "").strip()
    if not value:
        return ""
    if value.isdigit():
        index = int(value)
        if 0 <= index < len(ID3V1_GENRES):
            value = ID3V1_GENRES[index]
    # "(17)Rock", "17 - Rock" and similar numeric prefixes
    m = re.match(r"^\(?(\d{1,3})\)?\s*[-.]?\s*(.*)$", value)
    if m and m.group(2):
        index = int(m.group(1))
        if 0 <= index < len(ID3V1_GENRES):
            value = f"{m.group(2)} {ID3V1_GENRES[index]}"
    return _from_text(value)


def _majority(counter: Optional[Counter], min_votes: int = 2, share: float = 0.6) -> str:
    if not counter:
        return ""
    total = sum(counter.values())
    name, votes = counter.most_common(1)[0]
    if total >= min_votes and votes / total >= share:
        return name
    return ""


def _from_path(path_str: str) -> Tuple[str, str]:
    """Closest folder wins; check up to four parent segments."""
    try:
        parents = list(Path(path_str).parents)[:4]
    except Exception:
        return "", ""
    for folder in parents:
        segment = folder.name
        if not segment:
            continue
        for pattern, genre in _COMPILED_FOLDER:
            if pattern.search(segment):
                return genre, segment
        for pattern, genre in _COMPILED:
            if pattern.search(_clean(segment)):
                return genre, segment
    return "", ""


def _from_artist_seed(artist: str) -> Tuple[str, str]:
    cleaned = _clean(artist)
    if not cleaned:
        return "", ""
    for key, genre in _SEED_KEYS:
        if key and key in cleaned:
            return genre, key
    return "", ""


def infer_tracks(tracks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach genre_guess / genre_confidence / genre_source / genre_rule."""
    for track in tracks:
        raw_tag = str(track.get("genre", "") or "")
        guess = normalize_genre(raw_tag)
        track["genre_guess"] = guess
        track["genre_confidence"] = _CONFIDENCE["tag"] if guess else 0.0
        track["genre_source"] = "tag" if guess else ""
        track["genre_rule"] = f"tag:{raw_tag[:40]}" if guess else ""

    album_votes: Dict[tuple, Counter] = defaultdict(Counter)
    artist_votes: Dict[str, Counter] = defaultdict(Counter)
    for track in tracks:
        guess = track.get("genre_guess") or ""
        if not guess:
            continue
        artist = str(track.get("artist", "") or "").strip().lower()
        album = str(track.get("album", "") or "").strip().lower()
        if artist:
            artist_votes[artist][guess] += 1
        if artist or album:
            album_votes[(artist, album)][guess] += 1

    for track in tracks:
        if track.get("genre_guess"):
            continue
        artist_raw = str(track.get("artist", "") or "")
        artist = artist_raw.strip().lower()
        album = str(track.get("album", "") or "").strip().lower()

        guess, seed_key = _from_artist_seed(artist_raw)
        rule = f"seed:{seed_key}" if guess else ""
        source = "artist_seed"
        if not guess and (artist or album):
            guess = _majority(album_votes.get((artist, album)))
            rule = "vote:album"
            source = "album"
        if not guess:
            guess = _majority(artist_votes.get(artist)) if artist else ""
            rule = "vote:artist"
            source = "artist"
        if not guess:
            guess, segment = _from_path(str(track.get("path", "") or ""))
            rule = f"folder:{segment[:40]}" if guess else ""
            source = "folder"
        if not guess:
            stem = os.path.splitext(str(track.get("filename", "") or ""))[0]
            guess = _from_text(stem)
            rule = "filename"
            source = "filename"

        if guess:
            track["genre_rule"] = rule
            track["genre_guess"] = guess
            track["genre_confidence"] = _CONFIDENCE.get(source, 0.5)
            track["genre_source"] = source

    return tracks
