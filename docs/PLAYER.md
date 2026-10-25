# Audit Player — fusion design (Poweramp observations → Audit implementation)

Downloader + pro local player in one desktop app. All player code is
**clean-room**: behavior inspired by the reference APK, zero vendor code,
zero vendor assets vendored.

## 1. What REA observed (evidence, no APK execution)

APK: `com.maxmpz.audioplayer`, `build-1025-uni` (vCode 1025009),
targetSdk 35, minSdk 21 — REA `inspect_android_package`
(evidence `ev_9012e8b8…`, full bundle in temp `poweramp-package.json`).

| Observation | Evidence |
|---|---|
| 6213 classes / 3267 resources | package inspection `loaded` |
| Foreground playback service + headset/BT/media-button receivers | manifest: `player.PlayerService`, `HeadsetMicroService`, `BTReceiver`, `PSMediaButtonReceiver`, `ManifestHeadsetPlugReceiver` |
| Library scanner (dirs + tags) | manifest: `scanner.ScanDispatcherService`, `StorageBroadcastReceiver`, actions `ACTION_SCAN_DIRS`, `ACTION_SCAN_TAGS`, `ACTION_RELOAD_DATA` |
| EQ + presets + reverb | manifest aliases: `EqActivity`, `EqPresetsActivity`, `AddEqPresetActivity`, `EqPresetAssignActivity`, `AddReverbPresetActivity` |
| Lyrics | manifest: `dialogs.LyricsActivity`, actions `ACTION_NEED_LYRICS`/`ACTION_UPDATE_LYRICS`; `queries` for QuickLyric, Musixmatch, Letras, WalkmanLyrics |
| Tag editor | manifest: `dialogs.EditTagActivity` |
| Playlists / library views | `PlayListActivity`, `ListActivity`, `PlayerUIActivity`, `PlaylistSortActivity`, `MusicFoldersActivity` |
| MilkDrop visualizer | `milk.scanner.MilkScanService`, `MilkPresetsFileProvider`, action `com.maxmpz.milk.ACTION_SCAN`, 252× `.milk` presets in `assets/milk_presets/` |
| Headphone EQ database | `assets/auto_eq.db` (7.1 MB SQLite: `eq_presets`, **17703 rows**, proprietary `PaP` binary blobs, `parametric` 0/1 flag) |
| Native DSP + FFmpeg | `lib/arm64-v8a|armeabi-v7a/libpowerampcore.so` + `libffmpeg_neon.so` (zip inventory) |
| Android Auto / Cast / widgets / skins | `BrowserService`, `CastOptionsProvider`, widget providers, 22 launcher aliases, `SKIN_MAIN` |

REA limits hit (honest): `search_android_classes` fails on this APK
(`JADX class inventory is duplicated or differs from the loaded class
count`); `extract-artifact`/`inspect-artifact` refuse on Windows
(case-colliding obfuscated `res/-c.xml` vs `res/-C.xml`). No decompiled
method bodies were used — and none are needed: the fusion reimplements
behavior, it does not port code.

Environment used: `rea-agents@6.2.0`, `jadx-headless-mcp-0.7.1`
(SHA-256 `6e5eacf5…ff75`, pinned by REA), Microsoft OpenJDK 21
(`D:\tools\jdk-21`), jar at `D:\tools\rea-android\…jar`.

## 2. Mapping → Audit implementation (this repo)

| Reference behavior | Audit implementation | Files |
|---|---|---|
| ScanDispatcherService + SCAN_DIRS/TAGS | Instant library from `%APPDATA%/Audit/audit-library.json` cache + one background refresh per launch (no rescan from zero); queue + roots restored too | `python/library/scan.py`, `src/main/library.ts`, IPC `library:scan/loadCache/saveCache` |
| PlayerService (foreground) | Hidden `<audio>` + queue with shuffle/repeat off·all·one, ended-advance | `src/components/player/PlayerBar.tsx`, `PlayerSection.tsx` |
| EqActivity + presets | 10-band peaking EQ (31–16k) + preamp, Web Audio graph, 9 hand-authored presets, localStorage persistence | `EQEngine.ts`, `eq-presets.ts`, `EqualizerPanel.tsx` |
| Headphone AutoEQ DB | **Not vendored** (proprietary blob). Upstream open data instead | `scripts/fetch-autoeq.js` (AutoEq/MIT → 10-band resample) |
| Milk visualizer | Built-in live spectrum on the same AnalyserNode; `.milk` files **not** vendored (author licensing unclear) — `MilkCanvas` drop-in point | `Visualizer.tsx` |
| LyricsActivity | `.lrc` sidecar flag shown in rows (mic icon); full synced-lyrics panel = phase 2 | `TrackRow.tsx` |
| Library categories (songs/artists/albums/genres/recent/top) | Tag-grouped views with counts, search, drill-down; ratings 1–5 persisted, Top Rated from ratings | `LibraryHome.tsx`, `ratings.ts` |
| Music Folders browser | Multi-root folders with per-folder play/shuffle/enqueue, expandable tracks | `FoldersView.tsx` |
| Player screen + queue | Album art (embedded → folder fallback via `library:art`), visualizer, reorderable queue with save-as-playlist | `NowPlaying.tsx`, `QueueView.tsx`, `useArt.ts` |
| Playlists | Create/play/append/remove, resolved against the live scan | `PlaylistsPanel.tsx`, `playlists.ts` |
| MEDIA_BUTTON / headset | Phase 2: Electron `globalShortcut` + `thumbar` buttons | — |
| EditTagActivity | Phase 2: mutagen write via `python/library/tags.py` + IPC | — |
| Local playback sandbox | `media://audio?path=` protocol with MIME + Range/seek, traversal-guarded | `src/main/media-protocol.ts` |

## 3. Architecture

```
Renderer (Next.js)                    Main (Electron)              Python sidecar
┌ LibraryView ──scanLibrary()──┐     ┌ library.ts ──spawn──┐      ┌ library/scan.py
│ PlayerBar ──<audio>──┐       │     │ media-protocol.ts   │      │  mutagen → JSON
│ EQEngine (WebAudio)  │       │     │  media:// + Range   │      └─────────────────
│ Visualizer (Analyser)┘       │     └────────────────────┘
└──────────────────────────────┘
Downloader tab untouched (page.tsx conditional).
```

Downloads land in the output folder → Library tab scans the same folder:
download-to-listen in one window, no server, no upload.

## 4. License / provenance rules for contributors

- Never paste decompiled Poweramp code or ship its `.so`/`.dex`/artwork.
- Never vendor `auto_eq.db` or `.milk` files from the APK. `.milk`
  presets are community-authored; support user-supplied directories.
- Headphone correction comes from upstream AutoEq (MIT) via the fetch script.
- REA evidence bundles stay out of git (temp dir only).

## 5. Roadmap (phase 2)

1. Tag editor (mutagen write + IPC `library:writeTags`).
2. Synced lyrics panel (parse sidecar `.lrc` + embedded USLT).
3. `.milk` renderer (Butterchurn-compatible `MilkCanvas` on AnalyserNode).
4. Media keys (`globalShortcut`), taskbar `thumbar`, MPRIS on Linux.
5. Gapless preloading (dual-element crossfade) + replay-gain (EBU R128 via ffmpeg).
