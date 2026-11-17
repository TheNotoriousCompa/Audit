# Audit Android v2 — Standalone Music App + Downloader

> **ALTERNATIVE ONLY — NOT THE CHOSEN BUILD.**
> The chosen build is `AUDIT_ANDROID_RN_AGENT.md` (Expo/React Native UI + local Kotlin module).
> Use this pure-Compose brief only if the user explicitly abandons React Native. Do not combine
> the two briefs in one implementation.
>
> **This brief supersedes `AUDIT_MOBILE_V1_AGENT.md` and every previous Expo/React Native/desktop-sync plan.**
> Do not reuse the old mobile branch, the old sync contract, or the old pairing UI.
> The app must be **standalone**. It must not connect to Audit Desktop, a LAN server, a cloud account,
> or any companion process. Delete that work; do not try to adapt it.

---

## 1. Reset: what changed

The previous brief was wrong for these requirements:

- It tied the phone to the desktop for downloads and library sync.
- It used Expo/React Native for features that are inherently native Android.
- It used a translucent-card approximation instead of real backdrop-sampled glass.

The new product is:

> **A standalone Android app that downloads audio/video with yt-dlp, scans a local music folder,
> manages a real library, plays music in the background with EQ, and looks like a simple,
> premium music app with genuine liquid-glass surfaces.**

No PC. No pairing. No server. No account. No cloud library.

### Hard reset instructions

- Work from `dev` on a **new branch** `feat/android-v2` and a new worktree. Do not reuse
  `feat/mobile-v1`.
- If a `mobile/` Expo app or `src/main/mobile-sync/` exists from the wrong attempt, remove it.
  Do not carry over its screens, dependencies, contracts, or branding.
- Remove any desktop pairing/sync UI, HTTP server, WebSocket protocol, device token, QR code,
  or “Waiting for PC” state from the product.
- Do not modify Audit Desktop for this release, except for documentation links if explicitly asked.
  The desktop app and the Android app are independent products that share a visual language.
- If old code is in git history, leave it there; do not merge it forward.

---

## 2. Mission and platform

Ship **Audit Android 1.0** as one Android release.

- **Platform:** Android only for this brief. iOS is explicitly out of scope.
  Direct yt-dlp downloads, arbitrary folder access, and a GPL native engine make iOS a different
  product/architecture; do not pretend it can share this build.
- **Stack:** native **Kotlin + Jetpack Compose**. Not Expo. Not React Native. Not Flutter.
- **Distribution assumption:** GitHub Releases / F-Droid / direct APK first. Google Play is not
  guaranteed because direct YouTube downloading can conflict with store policy. Build an AAB and
  prepare a Play listing, but treat Play approval as a separate gate. Never promise “on the Play Store”
  before approval.
- **One release** means one v1 scope and one signed Android release; implementation is still phased.

### Why native — DECIDED

Every core feature is native Android:

| Requirement | Native reality |
|---|---|
| Autonomous yt-dlp downloads | `youtubedl-android` is a Kotlin/Java Android library; background work needs a foreground service |
| Local folder scanning | SAF `ACTION_OPEN_DOCUMENT_TREE`, `DocumentsContract`, `ContentResolver`, MediaStore |
| Tag and artwork reading | `MediaMetadataRetriever`, `jaudiotagger`/TagLib, `ContentResolver` |
| Background playback | Media3 `ExoPlayer` + `MediaSessionService` |
| Audio EQ | Android `Equalizer` / `LoudnessEnhancer` attached to the player audio session |
| Real glass | Compose + Haze 2 `haze-glass` with backdrop sampling, refraction and AGSL fallbacks |
| Share-to-download | Android `ACTION_SEND` / `ACTION_VIEW` intents |

React Native would require a custom native module for **all** of the above, plus a second runtime,
plus native build/debug complexity. It adds no value for an Android-only app. If the user insists on
React Native later, stop and write a new ADR; do not mix the two stacks in this release.

---

## 3. Product invariants

1. **Standalone.** No desktop, no server, no pairing, no LAN, no account, no cloud sync.
2. **Local-first.** Library metadata and playback work offline. Only downloads and optional online
   cover search use the network.
3. **User-controlled.** No silent downloads, no background fetch of the whole library, no forced
   updates, no analytics by default.
4. **One app, one library.** Downloads and scanned files appear in the same library and player.
5. **No fake glass.** Every glass surface must sample and transform the content behind it. A
   translucent rectangle with a border is not glass.
6. **No copied apps.** Seal is an architecture reference, not a source to copy. Poweramp is a
   behavior reference for library/cover lookup, not a source or asset pack. Spotify is a structural
   reference for music-app navigation, not a visual identity to clone.
7. **Licenses are a release gate.** `youtubedl-android` is GPL-3.0. See §5.1 before writing code.

---

## 4. What the app must do

### 4.1 Download (standalone, Seal-like)

The app downloads directly on the phone. It does not ask a PC.

Architecture, based on the proven Seal approach:

- Bundle **`io.github.junkfood02.youtubedl-android`** (library + FFmpeg + optional aria2c).
  Initialize in `Application.onCreate()`:
  `YoutubeDL.init(context)`, `FFmpeg.init(context)`, `Aria2c.init(context)` (if used).
- Run downloads in a **foreground service** with a persistent notification and a compliant
  foreground-service type. Keep a singleton task queue (max 3 concurrent tasks) with explicit states:
  `Idle → FetchingInfo → Ready → Downloading → Converting → Completed | Error | Cancelled`.
- Use `YoutubeDLRequest` and `YoutubeDL.execute(request, taskId, callback)` for progress; cancel with
  `YoutubeDL.destroyProcessById(taskId)`. Persist tasks so process death does not lose the queue.
- Support:
  - paste URL or search query;
  - share sheet (`ACTION_SEND text/plain`) and `ACTION_VIEW http/https`;
  - audio: MP3 (320/256/192/128), M4A/AAC, Opus, FLAC, WAV, best;
  - video: MP4, best available;
  - playlists: fetch flat playlist, select items, `--playlist-items`, item x/y progress;
  - metadata + thumbnail embedding: `--embed-metadata`, `--embed-thumbnail`,
    `--convert-thumbnails jpg`, `--parse-metadata` for album/track where possible;
  - skip-existing / download archive (optional), retry, cancel, clear completed;
  - Wi-Fi-only toggle and metered-network warning;
  - output naming template and a user-chosen destination.
- yt-dlp is updated from inside the app with the library updater (check on launch/weekly, show
  progress/errors). Stale extractors are the main failure mode; surface a clear “Update yt-dlp” action.
- Use `--no-playlist` for single items unless the user selected a playlist.
- Validate URLs: `http`/`https` only; reject `file://`, `content://` input, `-`-prefixed strings and
  arbitrary command injection. The yt-dlp library supports many sites; default UX is YouTube, and
  unsupported sites must fail with a readable error.
- After completion, publish the file to MediaStore or copy it into the user-selected SAF tree, then
  insert it into the local library so it appears immediately with cover/tags.

**Important:** `yt-dlp` uses **mutagen** internally for embedding metadata/thumbnails in supported
containers. That is the mutagen reference from Seal/Audit Desktop. The app itself does not need to
run mutagen for local library scanning (see §6.4).

### 4.2 Real liquid glass UI

The UI must look like **Apple’s liquid glass simulated on Android**, while staying as simple and
readable as Airbnb/Spotify.

Use **Haze 2** (`dev.chrisbanes.haze:haze` + `haze-glass`), which provides source-backed blur,
refraction-driven glass, tint, depth, lighting, highlights and press response. It is Apache-2.0 and
supports Android with graceful degradation.

Requirements:

- `hazeSource` on the scrolling content that sits behind glass; `hazeGlass` (not a translucent Box)
  on floating surfaces: bottom navigation, mini player, Now Playing control dock, bottom sheets,
  floating chips.
- `GlassStyle.regular` or `clear`, with a tint and `RoundedCornerShape(28.dp)`; refine with edge
  highlight, subtle noise (2–3%), inner shadow and a specular top-left streak.
- Real backdrop sampling: when album art, lists or artwork scroll under the glass, the glass must
  visually blur/refract them in real time. A static alpha fill is a rejection.
- API 33+ may use AGSL refraction; API 31–32 gets blur + tint; lower APIs get a graceful opaque/
  translucent fallback. Never crash or show unreadable text on fallback.
- Glass budget: at most 2–3 glass surfaces per screen. Long lists, settings rows, search fields and
  content cards use solid/translucent surfaces, not blur.
- Test on a low-end Android device. Haze performance modes must be measured; no janky scroll.
- Edge-to-edge, transparent system bars, correct insets; glass must not sit under unreadable content.

**Do not** use “glassmorphism” as an excuse for low contrast, random gradients, or blur everywhere.
The design must stay quiet: near-black background, strong typography, album art as the main color.

### 4.3 Library scan from a phone folder

The user has a music folder and expects a real library scan, not one-file-at-a-time import.

- Primary flow: “Add music folder” → `ACTION_OPEN_DOCUMENT_TREE` → persist permission with
  `takePersistableUriPermission` → recursive scan of all audio files.
- Support multiple folders; show folder name, track count, last scan, rescan and remove.
- Use `DocumentsContract` child queries + `ContentResolver` for speed; `DocumentFile` only where
  convenient. Do not recursively call slow `DocumentFile.listFiles()` in nested loops when a direct
  child query is available.
- Filter by MIME (`audio/*`) and extensions: mp3, m4a, aac, flac, wav, ogg, opus, wma (read-only if
  parsing works). Skip hidden/trash/temp files.
- Read metadata in batches on `Dispatchers.IO`; use `MediaMetadataRetriever` for title/artist/album/
  duration/embedded picture, and `jaudiotagger`/TagLib as a fallback for genre, album artist,
  track/disc number and formats where MediaMetadataRetriever is weak.
- Incremental scan: compare document id, `lastModified` and size; insert/update/remove; never rescan
  everything on every launch. Use WorkManager (unique work) with progress, cancel and a foreground
  notification for long scans.
- Handle revoked SAF permission, deleted files, duplicate files, corrupt tags and 0-byte files without
  crashing. Show a re-grant CTA.
- Target: 1,000 tracks scanned under ~90 seconds on a mid-range phone, with a responsive UI and
  paginated Room queries. 10,000 tracks must remain usable.
- Also offer an optional “scan all device audio” via MediaStore (`READ_MEDIA_AUDIO` on Android 13+,
  `READ_EXTERNAL_STORAGE` on older versions), clearly separate from the SAF folder flow. Do not request
  broad storage permissions when SAF is enough.
- After a download, insert the new track directly and trigger a MediaStore scan for the output folder.

### 4.4 Cover art and metadata (Poweramp-like behavior)

The user must see covers everywhere and be able to look one up from the context menu.

**Automatic covers**

- Embedded artwork (ID3 APIC / FLAC picture / M4A covr) is the first source.
- Folder images: `cover.jpg`, `folder.jpg`, `front.jpg`, `albumart.jpg`, same-basename `.jpg/.png`,
  case-insensitive.
- Artwork from another track in the same album folder can be reused.
- Cache thumbnails (e.g. 256px) and full-size art under `filesDir/covers/`; use Coil with memory/disk
  cache. Never decode full artwork for every list row.
- Show a designed placeholder when no art exists; never blank squares.
- Album/artist grids derive their cover from the first track with art in the group.

**Context menu “Find cover” (Poweramp-style)**

Long-press a track, album, or the Now Playing artwork opens a sheet:

- Current cover preview.
- Candidate covers found locally: embedded, folder images, sibling album tracks.
- “Search online” button (explicit user action, not automatic): query a legal source such as
  MusicBrainz/Cover Art Archive or iTunes Search API using title/artist/album; show 6–12 thumbnails
  with source labels.
- Select a cover → persist an override in Room (`cover_overrides`) → invalidate Coil cache → update
  lists, mini player and Now Playing immediately.
- Optional “Write to file” via jaudiotagger/TagLib, only if the document is writable; if it fails,
  keep the app-level override and tell the user. Do not silently lose the choice.
- Respect network consent; no bulk scraping, no background crawling of the whole library.

**Metadata editing**

- Edit title, artist, album, genre, album artist, track/disc number where supported.
- Update Room immediately; write embedded tags when the file is writable and the format is supported.
- If tag writing fails, keep the DB edit and mark “App only”.
- Do not claim mutagen is used for local edits. Use the native tag stack. Downloaded files may have
  been tagged by yt-dlp/mutagen.

### 4.5 Player, queue, EQ

- Media3 **ExoPlayer** + **MediaSessionService** for playback, lock screen, control center, Bluetooth/
  headset buttons, audio focus and interruptions.
- Queue: add, play next, reorder, remove, clear, save as playlist; shuffle; repeat off/all/one.
- Play local SAF content URIs directly with persisted permission; do not copy every file into the app.
- 10-band EQ via Android `Equalizer` attached to the player audio session; preamp with
  `LoudnessEnhancer`; presets (Flat, Rock, Pop, Jazz, Classical, Bass, Vocal, etc.); persist.
  Device EQ band counts vary: map the nearest bands, show the actual available bands, and never
  pretend 10 bands exist if the device exposes fewer.
- Optional visualizer from the player audio session; do not block release on it.
- Sleep timer optional; playback speed optional.
- Mini player above the bottom navigation, expandable to full Now Playing; real glass on both.

### 4.6 Playlists, search, library views

- Playlists: create/rename/delete, add/remove/reorder, play/shuffle, cover mosaic, persist in Room.
- Search: Room FTS over title/artist/album/genre/filename; debounced; results grouped by type.
- Library: Songs, Albums, Artists, Genres, Folders, Playlists, Downloads; sort by title/artist/album/
  duration/recently added/recently downloaded; multi-select for queue/playlist/delete.
- Album/artist detail: hero cover, play/shuffle, track list, “Find cover”, “Rescan folder”.
- Folders screen: source of truth for scanned trees; counts; add/remove/rescan.
- Downloads screen: URL field, paste, share target, options, active/waiting/completed/failed; progress,
  speed, ETA; cancel/retry; open output folder.
- Settings: theme (Liquid Glass), accent tint, EQ, download quality/format/destination, Wi-Fi-only,
  yt-dlp updates, storage/cache, about/licenses/privacy.
- No “sync”, “pair”, “PC”, “server”, “remote”, or “account” UI anywhere.

---

## 5. Engineering architecture

### 5.1 License gate — read before coding

- `io.github.junkfood02.youtubedl-android` is **GPL-3.0**. If you link it into the app and distribute
  the app, the app must comply with GPL-3.0 (source availability and notice). This is not compatible
  with a closed-source proprietary distribution.
- Seal itself is **GPL-3.0** and explicitly restricts use of its name for derivatives. Do not copy
  Seal source, resources, name, or branding. Use it as an architecture reference only.
- `yt-dlp` is Unlicense; Python/FFmpeg/aria2c have their own licenses. Verify the exact FFmpeg build.
- Haze is Apache-2.0; Media3, Coil and AndroidX are Apache-2.0; jaudiotagger is LGPL.
- Before implementation, write `docs/android/LICENSE_STRATEGY.md` and choose:
  1. **GPL-3.0 app with public source** (simplest, aligned with the Seal approach); or
  2. a different extractor/architecture that is license-compatible with the intended distribution.
- If the product must be closed-source, **stop** and resolve this before writing the downloader.
- Add a licenses screen in the app and keep third-party notices up to date.

### 5.2 Stack

- Kotlin (latest stable compatible with AGP), JDK 17/21 as required.
- Jetpack Compose + Material 3 as a base, but a custom design system, not default Material.
- Navigation Compose, single-activity, edge-to-edge.
- Room + KSP, Paging 3, Flow.
- Hilt or Koin (pick one, document; do not mix).
- DataStore (settings) + Room (library/downloads).
- WorkManager for scans; foreground service for downloads.
- Media3 ExoPlayer + MediaSessionService.
- Coil for artwork.
- Haze 2 (`haze`, `haze-glass`) for glass.
- `youtubedl-android` + FFmpeg + optional aria2c.
- `MediaMetadataRetriever` + `jaudiotagger` (or TagLib) for local tags/art.
- Kotlinx Coroutines, Kotlinx Serialization (playlist/export), Turbine/JUnit for tests.
- Min SDK: 26+ (Haze glass degrades gracefully); target the latest stable Android SDK.
- Build with Gradle Kotlin DSL; GitHub Actions for lint/test/build; signed release APK/AAB.

### 5.3 Package layout

Keep one app module until it hurts; use clear packages:

```text
app/src/main/java/<pkg>/
  AuditApp.kt
  MainActivity.kt
  core/
    audio/          ExoPlayer, MediaSessionService, EQ
    design/         tokens, glass, typography, components
    download/       YoutubeDL engine, queue, service, notifications
    library/        SAF scanner, MediaStore, Room, tags, artwork
    model/          domain models
    util/           permissions, files, network, hashing
  data/
    db/             Room entities/DAOs/migrations/FTS
    repo/           library, downloads, playlists, settings
  feature/
    home/
    search/
    library/
    folders/
    downloads/
    player/
    queue/
    playlists/
    settings/
    coveredit/
    tagedit/
```

### 5.4 Download service details

- `DownloadService` is a foreground service with a persistent notification and a binder or a singleton
  repository; the UI observes a `StateFlow` of tasks.
- Use a bounded queue (3 concurrent), not an unbounded coroutine launch per tap.
- Persist task states in Room so a process kill/crash can restore or clearly mark them as failed.
- Notification actions: cancel, open app, open completed file.
- `POST_NOTIFICATIONS` on Android 13+; if denied, downloads still work but foreground notification
  behavior must be explained.
- Battery optimization: do not force users to disable it; provide a help link if downloads are killed.
- Foreground service type must be declared and justified for the target SDK. Do not use a loophole.
- No `MANAGE_EXTERNAL_STORAGE`; use SAF/MediaStore. If a feature truly requires “all files access”,
  stop and justify it; it is not needed for the core flow.

### 5.5 Library data model (Room)

```text
tracks(
  id TEXT PRIMARY KEY,              -- stable hash of document URI / media id
  mediaUri TEXT NOT NULL,           -- content:// URI
  documentId TEXT,                  -- SAF document id
  folderUri TEXT,                   -- SAF tree URI
  relativePath TEXT,
  displayName TEXT,
  title TEXT, artist TEXT, album TEXT, albumArtist TEXT,
  genre TEXT, trackNo INTEGER, discNo INTEGER, year INTEGER,
  durationMs INTEGER, sizeBytes INTEGER, lastModified INTEGER,
  mimeType TEXT, extension TEXT,
  source TEXT,                      -- 'scanned' | 'downloaded'
  hasEmbeddedArt INTEGER, coverKey TEXT,
  addedAt INTEGER, updatedAt INTEGER, deletedAt INTEGER
)

folders(id TEXT PRIMARY KEY, treeUri TEXT, displayName TEXT, lastScanAt INTEGER, trackCount INTEGER)

playlists(id TEXT PRIMARY KEY, name TEXT, createdAt INTEGER, updatedAt INTEGER)
playlist_tracks(playlistId TEXT, trackId TEXT, position INTEGER, PRIMARY KEY(playlistId, trackId))

downloads(
  id TEXT PRIMARY KEY, url TEXT, title TEXT, format TEXT, quality TEXT,
  status TEXT, progress REAL, speed TEXT, eta TEXT, error TEXT,
  outputUri TEXT, trackId TEXT, createdAt INTEGER, updatedAt INTEGER
)

cover_overrides(trackId TEXT PRIMARY KEY, source TEXT, localPath TEXT, updatedAt INTEGER)
settings(key TEXT PRIMARY KEY, value TEXT)
```

Add an FTS table for title/artist/album/genre/filename with triggers. Use migrations from v1; never
drop the user’s library on upgrade.

### 5.6 SAF scanning algorithm

1. Persist the tree URI and read/write flags.
2. Build the children URI with `DocumentsContract.buildChildDocumentsUriUsingTree`.
3. Query `Document.COLUMN_DOCUMENT_ID`, `DISPLAY_NAME`, `MIME_TYPE`, `LAST_MODIFIED`, `SIZE` in pages.
4. Recurse into `MIME_TYPE_DIR` with a queue/stack; cap depth to a sane value; skip hidden and
   `nomedia` directories if appropriate.
5. For each audio file, read metadata off the main thread; insert/update Room in batches.
6. Compare `lastModified`/size for incremental runs; mark missing rows as deleted with a tombstone.
7. Emit progress: folders visited, files found, current file; support cancel.
8. On completion, update folder counts and `lastScanAt`.

Test with a folder containing nested albums, non-audio files, broken tags, duplicate names and a
revoked permission.

### 5.7 Playback and EQ details

- Use `MediaSessionService` so playback survives the UI and shows lock-screen/Bluetooth controls.
- Build a `MediaItem` per local track with a content URI; ExoPlayer can read persisted SAF URIs.
- Handle `SecurityException` by prompting to re-add the folder, not by crashing.
- EQ: attach `android.media.audiofx.Equalizer` to the ExoPlayer audio session id; enable only when
  playback is active; release on stop; persist band gains and preset. Preamp via `LoudnessEnhancer`.
- Audio focus: pause/duck on calls and other apps; resume appropriately.
- Gapless/crossfade optional; do not add if it destabilizes the queue.

### 5.8 Cover art pipeline

- Cover key = hash of track id + source.
- Read embedded art bytes; downscale to thumbnail (e.g. 256px) and full (e.g. 1024px) with BitmapFactory
  sampling; write to cache.
- Folder image lookup: query siblings once per album folder, not per track.
- Coil custom fetcher/key for `content://` art; avoid re-reading large images on every scroll.
- Cover override wins over embedded/folder in all UI.
- Online cover search caches results; user must pick; no automatic replacement of existing covers.

---

## 6. Visual design — “Liquid Glass, simple like Airbnb/Spotify”

### 6.1 Direction

A dark, calm music app with genuine depth. Spotify supplies the music-app structure (bottom nav,
mini player, full Now Playing, album art, queue). Airbnb supplies the calm spacing, large imagery,
clear hierarchy and friendly simplicity. Apple supplies the glass material, not a copied iOS UI.

Keywords: **calm, tactile, deep, precise, album-first, uncluttered**.

### 6.2 Color and type

- Background: near-black `#050607`, elevated `#0B0E11`.
- Text: `#F5F7F8`; muted `#9AA5AD`.
- Accent: **Audit Lime `#B8FF3C`** for primary actions and active states only.
- Album art supplies ambient tint; clamp saturation; never let it reduce contrast.
- Typography: **Manrope** (SIL OFL) for UI, **Geist Mono** or tabular Manrope for timestamps.
  Bundle fonts; no runtime font downloads.
- Radii: cards 24dp, hero 32dp, pills 999dp, glass 28dp.
- Spacing: 4/8dp grid; 20dp screen gutters; generous section spacing.

### 6.3 Glass rules

- Glass surfaces: bottom nav, mini player, Now Playing control dock, bottom sheets, cover picker,
  floating scan/status chips. Not every card.
- Must use Haze source-backed glass; real blur/refraction; moving content behind it changes it.
- Add 1px top/left specular highlight, dark bottom/right edge, 2–3% noise, soft shadow.
- Keep text on a tinted glass layer with enough opacity for 4.5:1 contrast.
- Fallback on unsupported devices: opaque elevated surface, not a washed-out transparent box.
- Haze performance: measure release build; degrade glass on low-end devices if needed.

### 6.3.1 Reference patterns from CSS liquid-glass demos

Use the visual ideas from CSS liquid-glass galleries, but **do not paste CSS/SVG filters into Android**.
Browser snippets rely on `backdrop-filter`, `filter: contrast()`, SVG `feDisplacementMap`, and
pseudo-elements; Android has no CSS compositor. Translate them like this:

| CSS demo pattern | Android/Compose translation |
|---|---|
| `backdrop-filter: blur()` | Haze 2 `hazeBlur` / `hazeGlass` with `HazeInput.Sources`; real captured backdrop |
| SVG `feDisplacementMap` / chromatic RGB split | Haze Glass refraction, or a custom AGSL `RuntimeShader`; optional dispersion/chromatic aberration |
| `filter: contrast(3)` lens punch | Do **not** apply a global contrast filter; increase specular/edge contrast inside the glass shader and keep text contrast |
| 6-layer inset `box-shadow` bevels | Compose `drawWithContent`/`drawBehind` with multiple inset strokes, top-left highlight, bottom-right shade |
| `:before` / `:after` blurred rim glare | Separate `Canvas` layers/draw passes with low-alpha gradients; clip to the shape |
| conic-gradient rim + `mask-composite` | `Brush.sweepGradient` + `clipPath`/`BlendMode` or AGSL; animate the angle with `animateFloat` |
| 3D press (`rotate3d`) | `Modifier.graphicsLayer { rotationX = ...; scaleX/Y = ... }` + spring; keep it subtle |
| `contain: strict` / paint isolation | Clip each glass surface, avoid invalidating the whole screen, keep blur layers small |
| noise overlay | 2–3% tiled noise drawable above the glass fill, below content |

Concrete component targets:

- **Glass action button** (download, play, “Add folder”): pill/28dp radius, Haze glass, conic/sweep
  rim highlight, inner top specular line, 2–3% noise, press scale 0.97 + light haptic, no global
  contrast hack. Text must keep 4.5:1 contrast.
- **Glass bottom nav / mini player**: source-backed blur of the scrolling content, 1px top highlight,
  soft shadow, opaque-enough tint for icons/labels.
- **Glass Now Playing dock**: strongest glass effect; limit to the control dock, not the whole screen.
- **Glass sheets**: glass header/handle, solid content surface; do not blur long lists.
- **Cover picker cards**: solid dark cards with a thin glass selection ring; not 12 blurred thumbnails.

Reject any implementation that:
- only changes `backgroundColor` alpha;
- blurs a static image instead of the live content behind the surface;
- applies blur to every list row;
- hides text contrast problems behind a gradient;
- uses `filter: contrast()`-style global effects that distort the entire app.

For React Native, the closest prebuilt mapping is `@uginy/react-native-liquid-glass` (AGSL on Android
13+, real refraction/chromatic aberration/glare/edge glow/noise) plus `react-native-saf-x` for SAF.
For Compose, use Haze 2 `haze-glass`; add a custom AGSL shader only for a specific hero/button effect.
Do not mix both stacks in the same app.

### 6.4 Motion

- 200–300ms, spring; Now Playing morph from mini player; album art parallax; sheet slide.
- Haptic feedback on play/pause, skip, long-press menu; not on scroll.
- Respect “Remove animations”/reduced motion; no essential content behind animation.
- Avoid gratuitous blur/scale animations that fight scrolling.

### 6.5 Accessibility

- TalkBack labels for artwork, controls, progress, scan state, cover candidates.
- 48dp touch targets; Dynamic Type/font scale up to 200% without clipping.
- Contrast checks on glass and over artwork.
- Edge-to-edge insets; no content under system bars.
- Color not the only status indicator; progress has text/percentage.

---

## 7. Screen map

```text
Home
  ├─ greeting / scan status / storage
  ├─ Recently added, Recently played, Downloads
  ├─ Folders, Playlists, Artists
  └─ empty state: “Add a music folder” / “Download something”

Search
  └─ Songs / Albums / Artists / Playlists / Videos + recent searches

Library
  ├─ Songs / Albums / Artists / Genres / Folders / Playlists / Downloads
  ├─ sort, multi-select, context menu
  └─ detail screens

Downloads
  ├─ URL/search input + paste + share
  ├─ format/quality/playlist sheet
  ├─ Active / Waiting / Completed / Failed
  └─ settings: destination, Wi-Fi only, metadata/thumbnail

Now Playing (full-screen modal)
  ├─ blurred art backdrop, large cover
  ├─ title/artist/album, seek, time
  ├─ shuffle / prev / play / next / repeat
  └─ queue, EQ, cover, “available offline” (local file)

Queue (bottom sheet)
Playlists / Playlist detail
Folders / Folder detail / Scan progress
Cover picker sheet
Tag editor sheet
EQ screen
Settings
```

No pairing screen, no sync screen, no “PC” state, no account screen.

### 7.1 Home

- Greeting/time, library count, last scan, storage used.
- “Recently added” horizontal cards; “Recently played”; “Your folders”; “Your playlists”.
- If no library: primary “Add music folder”, secondary “Download from a link”.
- If a scan is running: compact glass progress card with cancel; do not block browsing.

### 7.2 Library / Folders

- Songs list: cover, title, artist, duration, source badge, overflow.
- Albums/Artists: grid; use real covers; counts.
- Folders: show SAF folder name, track count, last scan, rescan/remove.
- Context menu: Play, Play next, Add to queue, Add to playlist, Find cover, Edit tags, Go to album/
  artist, Delete from library (not necessarily from disk), Rescan folder.
- Multi-select: queue, playlist, delete; no destructive action without confirmation.

### 7.3 Downloads

- URL field with paste; accepts share intents.
- Options: audio/video; format; quality; playlist; embed metadata/thumbnail; destination.
- Queue with progress, speed, ETA; cancel/retry; completed opens file/folder.
- Clear “no network”, “storage full”, “yt-dlp update needed”, “unsupported URL” states.
- Do not show a desktop/PC dependency.

### 7.4 Now Playing

- Full-bleed blurred artwork behind; glass control dock.
- Large cover; title/artist/album; seek with elapsed/remaining.
- Large play/pause; shuffle/repeat; queue; EQ; cover menu.
- Swipe down to mini; swipe up for queue.
- Show source: local file vs downloaded; no “streaming from PC”.

### 7.5 Cover picker

- Bottom sheet with current cover and local candidates.
- “Search online” secondary action; spinner; results grid; source labels.
- Apply updates all views immediately; optional write-to-file toggle.
- Cancel leaves the existing cover untouched.

---

## 8. Implementation plan

### Phase 0 — ADR and spikes (2–4 days)

- Write `docs/android/ARCHITECTURE.md` and `docs/android/LICENSE_STRATEGY.md`.
- Spike A: `youtubedl-android` init + one audio download + metadata/thumbnail embed + cancel.
- Spike B: SAF folder scan of 1,000 files + metadata/art extraction + progress.
- Spike C: Haze 2 glass over scrolling album art on a low-end device; measure frame time.
- Spike D: Media3 background playback + lock screen + EQ on a real device.
- Decide min SDK, Hilt/Koin, tag library, and distribution channel.

**Stop if:** the license cannot be accepted, or Haze glass cannot sustain 60fps on the target
mid-range device without a fallback design.

### Phase 1 — Design system and shell

- Tokens, type, glass components, bottom nav, mini player, Now Playing shell.
- App icon/splash using the Audit mark; dark-only.
- Navigation and empty states.

### Phase 2 — Library scan and data

- Room schema/migrations/FTS, SAF picker, recursive scanner, WorkManager progress.
- Metadata and covers; folder list; songs/albums/artists/genres.
- Search/sort/pagination; context menu skeleton.

### Phase 3 — Playback and EQ

- ExoPlayer/MediaSessionService, queue, shuffle/repeat, lock screen, focus.
- Mini player/full player, seek, haptics.
- EQ + presets + persistence.

### Phase 4 — Downloads

- DownloadService, queue, notifications, share intent, options, progress.
- Metadata/thumbnail embed, output destination, MediaStore publish.
- yt-dlp updater, error states, retry/cancel.

### Phase 5 — Covers, tags, playlists, polish

- Cover pipeline, cover picker + online search, overrides.
- Tag editor, playlists, multi-select.
- Settings, storage, licenses, privacy.

### Phase 6 — Performance and release

- Haze performance, low-end fallback, scroll/memory profiling.
- TalkBack, font scale, contrast, edge-to-edge.
- Signed APK/AAB, F-Droid metadata if applicable, GitHub release, screenshots.

---

## 9. Acceptance criteria

A release candidate is not done until all of these pass on a real Android device:

### Library

- Add a folder with 1,000 tracks; scan completes under ~90s; progress is visible and cancellable.
- Covers appear for embedded art, folder images and sibling album art; no blank squares.
- Re-scan is incremental; deleted files are marked missing; revoked permission shows a recovery CTA.
- Search returns results under 150ms; 10,000-track library remains usable; no ANR.

### Cover menu

- Long-press → Find cover opens candidates; selecting one updates list, mini player and Now Playing.
- Online search only runs on tap; results show source; cancel preserves the old cover.
- App-level override survives restart; optional file write reports success/failure honestly.

### Downloads

- Paste/share a YouTube URL; fetch info; choose MP3/320; download with progress and notification.
- Screen off / app background: download continues via foreground service.
- Cancel stops the process; retry works; playlist downloads show x/y.
- Completed file appears in the library with metadata and cover; no duplicate rows.
- Invalid URL, no network, storage full and expired extractor show clear errors.
- No PC/server/account is involved anywhere.

### Playback

- Background playback 30+ minutes; lock screen/Bluetooth controls; calls interrupt and resume.
- Queue reorder/remove/clear; shuffle/repeat; seek; mini→full player morph.
- EQ bands/presets persist and audibly change output; device band limits are shown honestly.

### Glass/UI

- Bottom nav/mini player visibly blur and refract scrolling album art; it is not a static alpha fill.
- 60fps scrolling on the target mid-range device with glass; low-end fallback is usable.
- Contrast, TalkBack, 200% font scale, edge-to-edge insets pass.
- The design reads as simple/calm, not “blur everywhere”.

### Engineering

- `./gradlew lint test assembleRelease` green; no crash on cold start.
- GPL/source obligations and third-party notices satisfied.
- No secrets, no analytics, no desktop sync code, no dangling “coming soon” screens.

---

## 10. Distribution and store reality

- Direct YouTube downloading is a legal/store risk. Seal itself distributes via GitHub/F-Droid,
  not as a standard Play Store app. Do not assume Play approval.
- Prepare:
  - signed APK for GitHub/F-Droid;
  - AAB for a future Play submission;
  - privacy policy and permissions rationale;
  - a clear “download only content you have the right to download” notice;
  - no YouTube branding/affiliation claims.
- If Play rejects the downloader, fall back to GitHub/F-Droid distribution; do not silently remove
  the download feature or ship a fake UI.
- In-app updates: GitHub releases or F-Droid; optional `REQUEST_INSTALL_PACKAGES` only if you actually
  implement APK updates and explain it. Never force updates.
- Do not publish on the Play Store with a GPL library unless the license strategy is resolved.

---

## 11. Guardrails

- **No desktop linkage:** remove pairing, sync, LAN server, device tokens, QR codes, “PC offline”,
  “waiting for PC”, IPC, and the old sync contract. The app is standalone.
- **No React Native/Expo:** this is a native Kotlin/Compose app. Do not add a JS runtime.
- **No cloud:** no account, no hosted library, no remote download server.
- **No `MANAGE_EXTERNAL_STORAGE`** for the core flow; use SAF/MediaStore.
- **No fake glass:** no static translucent cards passed off as glass.
- **No copied assets/code:** Seal/Poweramp/Spotify are references only. Read licenses.
- **No silent network:** downloads/cover search are user-initiated; no background crawling.
- **No misleading claims:** “mutagen” is used by yt-dlp for downloaded metadata, not as the local
  scanner; describe it accurately.
- **No destructive library action** without confirmation; deleting from library must not delete the
  user’s file unless explicitly chosen.
- **No placeholder primary screens:** if a feature is not ready, remove it from the release build.

---

## 12. Deliverables

Code:

- New Android app (Kotlin/Compose) with the full v1 scope.
- No `mobile/` Expo app, no desktop sync server, no pairing code.
- Signed release APK/AAB and Gradle build.

Docs:

- `docs/android/ARCHITECTURE.md`
- `docs/android/LICENSE_STRATEGY.md`
- `docs/android/LIBRARY_SCAN.md` (SAF, MediaStore, tags, covers)
- `docs/android/DOWNLOAD_ENGINE.md` (yt-dlp/youtubedl-android, service, storage)
- `docs/android/DESIGN.md` (tokens, Haze glass recipe, screenshots)
- `docs/android/RELEASE.md` (signing, F-Droid/GitHub, Play risk)
- `docs/android/KNOWN_LIMITATIONS.md`

Evidence:

- Screenshots of Home, Library, Folders, Downloads, Now Playing, Cover picker, EQ, Settings.
- A device demo: scan 1,000-track folder → covers → play → background → EQ → download → metadata/
  cover → context menu cover search.
- Performance report for glass on a low-end device.

---

## 13. Defaults for open decisions

| Decision | Default |
|---|---|
| Platform | Android only; iOS out of scope |
| Stack | Kotlin + Jetpack Compose, single activity, edge-to-edge |
| Download engine | `io.github.junkfood02.youtubedl-android` + FFmpeg (+ aria2c optional) |
| Background download | Foreground service, persistent notification, 3 concurrent max |
| Storage | SAF folder for library/download destination; MediaStore publish; no all-files permission |
| Library DB | Room + FTS, Paging 3, WorkManager scans |
| Tags/art | MediaMetadataRetriever + jaudiotagger/TagLib; yt-dlp/mutagen only for downloaded metadata |
| Playback | Media3 ExoPlayer + MediaSessionService |
| EQ | Android Equalizer + LoudnessEnhancer, device-band-aware |
| Glass | Haze 2 `haze-glass`, real backdrop sampling; fallback below API 33 |
| Accent | Audit Lime `#B8FF3C`; album tint secondary |
| Typography | Manrope + tabular numerals, bundled |
| Distribution | GitHub/F-Droid first; Play Store only after policy/license review |
| Theme | One shipped Liquid Glass theme; token engine ready but no remote themes |
| Languages | English + Italian, no hardcoded strings |

---

## 14. Final instruction to the agent

Do not start by porting the old mobile app. Start by deleting the wrong architecture from the branch,
then prove the four risky capabilities with spikes: **yt-dlp download**, **SAF folder scan**,
**real Haze glass**, and **background playback + EQ**. Only after those proofs should you build the
full UI.

If any spike fails, stop and report the exact device/API/error. Do not replace a failed native
capability with a fake UI, a placeholder, or a desktop dependency.
