"""Genre inference audit.

Runs the library scanner and reports WHERE every guess comes from, which
rules fire, and which tracks remain unknown. Read-only: no tags are written.

Usage:
  python scripts/genre-audit.py "<library root>" [--md docs/genre-audit-<date>.md]
"""
import argparse
import collections
import datetime
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN = ROOT / "python" / "library" / "scan.py"
CONF_BUCKETS = [(0.9, "0.90+"), (0.75, "0.75-0.89"), (0.6, "0.60-0.74"), (0.0, "<0.60")]

# Console output may contain CJK/punctuation from raw tags: never crash on
# the Windows default code page.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass


def run_scan(root: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(SCAN), root],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    for line in proc.stdout.splitlines():
        if line.startswith("{"):
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if payload.get("type") == "scan-result":
                return payload["data"]
    raise SystemExit(f"scan failed:\n{proc.stderr[-2000:]}")


def bucket(conf: float) -> str:
    for floor, label in CONF_BUCKETS:
        if conf >= floor:
            return label
    return "<0.60"


def build_report(data: dict) -> dict:
    tracks = data["tracks"]
    total = len(tracks)
    guessed = [t for t in tracks if t.get("genre_guess")]
    unknown = [t for t in tracks if not t.get("genre_guess")]

    sources = collections.Counter(t.get("genre_source") or "none" for t in tracks)
    rules = collections.Counter(t.get("genre_rule") or "(none)" for t in guessed)
    genres = collections.Counter(t["genre_guess"] for t in guessed)
    confs = collections.Counter(bucket(float(t.get("genre_confidence") or 0)) for t in guessed)

    unknown_artists = collections.Counter((t.get("artist") or "(none)").strip() for t in unknown)
    unknown_folders = collections.Counter(
        Path(t.get("path", "")).parent.name for t in unknown if t.get("path")
    )

    # Folder-sourced sample for manual spot checks (highest false-positive risk).
    folder_sample = [
        {
            "genre": t.get("genre_guess"),
            "rule": t.get("genre_rule"),
            "path": t.get("path"),
        }
        for t in guessed
        if t.get("genre_source") == "folder"
    ][:25]

    # Conflicts: tracks with a tag whose artist majority disagrees.
    votes = collections.defaultdict(collections.Counter)
    for t in guessed:
        if t.get("genre_source") == "tag":
            artist = (t.get("artist") or "").strip().lower()
            if artist:
                votes[artist][t["genre_guess"]] += 1
    conflicts = []
    for t in guessed:
        if t.get("genre_source") != "tag":
            continue
        artist = (t.get("artist") or "").strip().lower()
        counter = votes.get(artist)
        if not counter or sum(counter.values()) < 3:
            continue
        top, n = counter.most_common(1)[0]
        total_votes = sum(counter.values())
        if n / total_votes >= 0.6 and top != t["genre_guess"]:
            conflicts.append({"artist": t.get("artist"), "tag": t["genre_guess"], "majority": top, "votes": f"{n}/{total_votes}"})

    return {
        "root": data.get("root"),
        "total": total,
        "guessed": len(guessed),
        "coverage": round(100.0 * len(guessed) / total, 1) if total else 0.0,
        "sources": sources.most_common(),
        "rules": rules.most_common(25),
        "genres": genres.most_common(),
        "confidence": confs.most_common(),
        "unknown_artists": unknown_artists.most_common(25),
        "unknown_folders": unknown_folders.most_common(15),
        "folder_sample": folder_sample,
        "tag_conflicts": conflicts[:25],
        "tag_conflict_total": len(conflicts),
    }


def render_markdown(r: dict) -> str:
    lines = [
        f"# Genre audit — {datetime.date.today().isoformat()}",
        "",
        f"Library: `{r['root']}`",
        "",
        "## Coverage",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Tracks | {r['total']} |",
        f"| Guessed | {r['guessed']} |",
        f"| Coverage | {r['coverage']}% |",
        "",
        "## Sources",
        "",
        "| Source | Tracks |",
        "|---|---|",
    ]
    lines += [f"| {name} | {count} |" for name, count in r["sources"]]
    lines += ["", "## Rules fired (top 25)", "", "| Rule | Tracks |", "|---|---|"]
    lines += [f"| `{name}` | {count} |" for name, count in r["rules"]]
    lines += ["", "## Genres", "", "| Genre | Tracks |", "|---|---|"]
    lines += [f"| {name} | {count} |" for name, count in r["genres"]]
    lines += ["", "## Confidence buckets", "", "| Bucket | Tracks |", "|---|---|"]
    lines += [f"| {name} | {count} |" for name, count in r["confidence"]]
    lines += ["", "## Unknown — top artists", "", "| Artist | Tracks |", "|---|---|"]
    lines += [f"| {name} | {count} |" for name, count in r["unknown_artists"]]
    lines += ["", "## Unknown — top folders", "", "| Folder | Tracks |", "|---|---|"]
    lines += [f"| {name} | {count} |" for name, count in r["unknown_folders"]]
    lines += [
        "",
        f"## Tag vs artist-majority conflicts ({r['tag_conflict_total']})",
        "",
        "| Artist | Tag | Majority | Votes |",
        "|---|---|---|---|",
    ]
    lines += [f"| {c['artist']} | {c['tag']} | {c['majority']} | {c['votes']} |" for c in r["tag_conflicts"]]
    lines += ["", "## Folder-sourced sample (manual precision check)", "", "| Genre | Rule | Path |", "|---|---|---|"]
    lines += [f"| {c['genre']} | `{c['rule']}` | `{c['path']}` |" for c in r["folder_sample"]]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", help="library root to scan")
    ap.add_argument("--md", help="write a markdown report to this path")
    ap.add_argument("--json", help="write the raw report as JSON")
    args = ap.parse_args()

    report = build_report(run_scan(args.root))

    print(f"coverage: {report['guessed']}/{report['total']} ({report['coverage']}%)")
    print("sources:", ", ".join(f"{n}={c}" for n, c in report["sources"]))
    print("top rules:", ", ".join(f"{n}={c}" for n, c in report["rules"][:10]))
    print(f"tag conflicts: {report['tag_conflict_total']}")

    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print("wrote", args.json)
    if args.md:
        Path(args.md).write_text(render_markdown(report), encoding="utf-8")
        print("wrote", args.md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
