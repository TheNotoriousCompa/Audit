# Plan — "sort by recently downloaded" + macOS evaluation

Status: **plan only** (no code changes yet).

---

## Part 1 — Sort songs by when *the app downloaded them*

### 1.1 Goal

In the player/library, songs must be sortable by the moment **Audit downloaded
them**, newest first. Not by title, not by song release date, not by file
timestamp. The choice persists across restarts.

### 1.2 Why file metadata is the wrong source

| Field | What it actually is | Why it fails |
|---|---|---|
| `mtime` | file last modified | the **tag editor** rewrites tags → old song jumps to the top |
| `birthtime` | file creation on disk | correct for fresh downloads, but a **copy** gets the copy time, and library files imported from elsewhere have no meaning |
| `release year` (tag) | when the *music* was published | explicitly not what we want |

We need an **app-owned download history**: a journal written when a download
finishes, independent of the filesystem.

### 1.3 Data model — download journal (recommended)

New sidecar in `userData`: **`audit-downloads.json`**

```json
{
  "version": 1,
  "entries": {
    "C:\\Users\\x\\Music\\Artist - Title.mp3": {
      "downloadedAt": 1793055422000,
      "sourceUrl": "https://youtube.com/watch?v=...",
      "bytes": 7340032
    }
  }
}
```

- Key = final absolute path (normalized), value = `downloadedAt` (UTC ms) plus
  optional provenance.
- Written **only by the app**, at the moment a track is finalized.
- Merged into `Track` as `downloaded_at` during scan/cache load.
- Song order = `downloaded_at` desc.

Fallbacks for files the app never downloaded (older library, imports):

1. `downloaded_at` from the journal (authoritative)
2. `firstSeenAt` (persisted first time the scanner saw the path) — added in a
   second step; until then skip this)
3. `mtime` (last resort; file is grouped at the bottom)

### 1.4 Where the journal is written (hook points)

The downloader already returns the final path per track; we need the *per-track*
moment, including playlists.

- `python/downloader/core.py`
  - After conversion + tag write for **each** track, emit an extra progress
    record: `{"status": "saved", "path": "<final mp3>", "downloaded_at": <ms>}`
  - Single track: just before returning `True, <output_path>, ...`
  - Playlist: inside the per-item loop, once the item is renamed/converted
- `src/main/python-bridge.ts`
  - `safeProgressData` currently keeps only the basename for display; add
    `saved_path` + `downloaded_at` passthrough (internal fields, not rendered)
- `src/main/downloads-journal.ts` (new)
  - `recordDownload(path, meta)` → debounced atomic write of the JSON
  - `getDownloadedAt(path)` / `mergeJournal(tracks)` helpers
- `src/main/library.ts`
  - After scan, merge journal entries into tracks (`downloaded_at`)
  - Tag writes: no journal change (download time must not move)
- `src/types/electron.d.ts` → `Track.downloaded_at?: number`

### 1.5 UI changes

- `src/components/player/LibraryHome.tsx`
  - Sort control in the list header:
    **Recently downloaded (default) · Title · Artist · Album · Duration · Rating**
  - Persist choice in `localStorage['audit-library-sort']`
  - "Recently Added" tile becomes **"Recently downloaded"**: top 50 by
    `downloaded_at`, then `mtime` fallback
  - Under the artist line: relative time (`2h ago`, `3d ago`) with the absolute
    timestamp in the tooltip — only when `downloaded_at` exists
- Optional phase 2: same sort in the queue header (`QueueView`)

### 1.6 Edge cases

- **Renamed/moved file**: journal key no longer matches. Fallback: match by
  `size + basename` once, then migrate the key (best effort).
- **Deleted file**: prune journal entries older than N days that are not in the
  library (on library save).
- **Re-download of the same path**: overwrite the entry with the new timestamp.
- **Playlist**: every completed item gets its own timestamp, so a 9-track
  playlist is ordered exactly in the order it finished.
- **Clock skew**: store UTC ms; format locally at render time.
- **Corrupt journal**: ignore file, start empty (never block downloads).

### 1.7 Acceptance criteria

| Criterion | Target |
|---|---|
| Download 3 tracks, open library | newest download first, in the exact finish order |
| Edit tags on an old track | order unchanged |
| Restart the app | order and sort choice unchanged |
| Playlist of 9 | 9 distinct timestamps, consistent order |
| Old library (pre-journal) | falls back to `mtime`, no empty lists |
| 1.4k tracks sorted | < 50 ms, memoized |

### 1.8 Rollout

1. **MVP (~1.5 h)**: journal + `downloaded_at` + sort dropdown + "Recently
   downloaded" tile. Covers everything for tracks downloaded after this update.
2. **Hardening (~1 h)**: prune/rename logic, `firstSeenAt` for imports, relative
   dates in the UI.
3. **Optional**: queue sorting.

---

## Part 2 — macOS evaluation

### 2.1 What already works

- `setup-python.js` supports darwin (python-build-standalone, arch-aware)
- `setup-ffmpeg.js` supports darwin (evermeet)
- `main.ts` already handles `window-all-closed` (darwin stays alive) and `activate`
- Renderer is standard web tech; glass/backdrop-filter works in Chromium on macOS

### 2.2 Blockers (verified in code)

| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | Hardcoded `python-runtime/python.exe` | `python-bridge.ts:133`, `library.ts:64` | platform-aware binary: `python/bin/python3` on darwin |
| 2 | `frame: false` + Windows-style HTML window buttons | `window.ts:68`, `page.tsx` titlebar | native traffic lights (`titleBarStyle: 'hiddenInset'`, `trafficLightPosition`), hide custom Min/Max/Close on darwin |
| 3 | No application menu | `main.ts` | `Menu.buildFromTemplate` with roles (Cmd+Q/W, copy/paste, About) |
| 4 | Tray uses a normal PNG | `tray.ts` | `setTemplateImage(true)` + 16/32px template assets |
| 5 | ffmpeg darwin build is x86_64 only | `setup-ffmpeg.js:29` | separate arm64 static build; per-arch packaging |
| 6 | No DMG maker, no signing/notarization | `forge.config.js` | `maker-dmg`, entitlements, hardened runtime, `notarytool` |
| 7 | Auto-update path is Windows-centric | `auto-updater.ts` | Squirrel.Mac requires signed app + zip |
| 8 | Mini window geometry assumes Windows work area | `mini-player.ts` | clamp to `screen.getDisplayMatching` on macOS (minor) |

### 2.3 Phases

**Phase A — portability (2–3 h, can be done from Windows)**
- Platform-aware Python/ffmpeg resolution + dev fallbacks (`python3`, Homebrew)
- Window chrome + menu + tray template + shortcut audit
- Result: `npm run dev` on a Mac should work with system Python/ffmpeg

**Phase B — packaging (2 h)**
- `maker-dmg` + zip, separate `arm64` / `x64` builds (python and ffmpeg must match)
- `.icns`, `minimumSystemVersion: '11.0'`, entitlements + hardened runtime
- CI matrix `macos-14` producing unsigned artifacts

**Phase C — distribution (needs Apple account)**
- Developer ID signing (`codesign`), notarization (`notarytool`), stapling
- Squirrel.Mac auto-update; publish both architectures

### 2.4 Effort & risk

- Phase A: low risk, all compile-checked on Windows; real validation needs a Mac or CI runner
- Phase B: medium risk (python/ffmpeg arch mismatch is the usual failure)
- Phase C: blocking on **Apple Developer Program ($99/yr)**; unsigned builds require
  `xattr -dr com.apple.quarantine` (documented workaround)

### 2.5 Decisions needed

1. Apple Developer account available? (affects Phase C)
2. Apple Silicon only, or Intel too? (two builds vs one universal)
3. Minimum macOS: 11 Big Sur? (affects Electron version and python-standalone tag)
4. Ship unsigned CI artifacts first, or wait for signing?

### 2.6 Recommended order

1. Implement Part 1 MVP (download journal + sort) — small, self-contained, testable now.
2. Harden the journal (rename/prune/imports).
3. macOS Phase A + CI `macos-14` build (no signing) to validate packaging.
4. macOS Phases B/C once the Apple account decision is made.
