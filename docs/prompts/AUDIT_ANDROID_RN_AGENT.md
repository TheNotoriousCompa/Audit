# Audit Android RN Hybrid — Build Brief for a Parallel Agent

> **This is the chosen architecture for the next Android build.**
> It supersedes the pure-Kotlin brief for this release. Do **not** combine the two briefs.
>
> **React Native for the product UI; one local Kotlin Expo module for the Android multimedia core.**
> This is not a pure-JavaScript app, and it must not pretend to be. yt-dlp, SAF scanning, tag/artwork
> extraction and the audio effects chain are native Android capabilities; the React Native layer
> owns screens, navigation, state, design and the user experience.
>
> **No desktop. No pairing. No LAN server. No cloud. No account.**
> The app is standalone: it downloads on the phone and scans the phone’s music folder.

---

## 1. Mission

Ship **Audit Android 1.0**, a standalone music app that:

- downloads audio/video autonomously with **yt-dlp** and **FFmpeg** on the phone;
- scans a user-selected music folder recursively via **Android SAF**;
- reads tags and embedded/folder artwork, and shows covers everywhere;
- has a **Poweramp-style context menu** with “Find cover” / “Edit tags”;
- plays music in the background with lock-screen controls and a 10-band EQ;
- looks like a **premium liquid-glass Android app**: Spotify/Airbnb simplicity, Apple-like glass,
  genuine backdrop blur/refraction, not translucent-card fake glass.

The app must work without a PC. Delete every previous desktop-sync/pairing concept.

---

## 2. Non-negotiable decisions

1. **UI stack: Expo / React Native + TypeScript.** Expo Router, New Architecture, development build
   (not Expo Go). Do not switch the UI to Compose.
2. **Native core: a local Expo module written in Kotlin**, under `modules/audit-core/`.
   It is the only place allowed to run yt-dlp/FFmpeg, SAF traversal, tag extraction and the native
   audio/EQ service. It is not optional.
3. **Download engine: `youtubedl-android` (Seal-like architecture), not a JS extractor.**
   Bundle library + FFmpeg. Wrap it with a typed Expo module and run it in a foreground service.
4. **Glass: `@uginy/react-native-liquid-glass`** (AGSL on Android 13+) as the primary glass renderer,
   with an `expo-blur`/opaque fallback below API 33. Do not fake glass with just an alpha fill.
5. **Android only.** iOS is out of scope for this release. Do not promise iOS; a different architecture
   and store policy would be required.
6. **No desktop connection.** No sync, no QR pairing, no device tokens, no LAN server, no “PC offline”.
7. **No cloud.** No account, no hosted library, no remote download server.
8. **Licenses are a release gate.** `youtubedl-android` is GPL-3.0. Resolve this before shipping.
9. **Clean-room.** Seal is an architecture reference; do not copy its code, name, resources or branding.
   Poweramp/Spotify are behavior/visual references, not asset sources.

---

## 3. Why this hybrid

Every core requirement is native Android:

| Requirement | Reality |
|---|---|
| Autonomous yt-dlp + FFmpeg | `youtubedl-android` is a Kotlin/Java Android library with a bundled Python runtime and FFmpeg |
| Background download | Requires an Android foreground service + notification |
| SAF folder scan | `DocumentsContract` / `ContentResolver` traversal; JS bridge alone is too slow for 1,000+ files |
| Tags/artwork | `MediaMetadataRetriever` + `jaudiotagger`/TagLib native parsing; embedded art bytes |
| Background playback/EQ | ExoPlayer/Media3 + `Equalizer`/`LoudnessEnhancer`; TrackPlayer does not expose a stable EQ graph |
| True glass | Native AGSL shader via `@uginy/react-native-liquid-glass` (prebuilt module) |

A pure-JS solution cannot provide these. The hybrid keeps the product UI in React Native while the
multimedia core stays reliable and testable in Kotlin.

---

## 4. Repository layout

Work in a **new branch/worktree** `feat/android-rn` from `dev`. Do not reuse `feat/mobile-v1`.

```text
mobile/                         # Expo app (own package.json + lockfile)
  app/                          # Expo Router routes
    _layout.tsx
    (tabs)/_layout.tsx
    (tabs)/index.tsx            # Home
    (tabs)/search.tsx
    (tabs)/library.tsx
    (tabs)/downloads.tsx
    player.tsx                  # full Now Playing modal
    queue.tsx
    folders.tsx
    playlists/...
    settings/...
  src/
    design/                     # tokens, GlassSurface, type, components
    db/                         # expo-sqlite + Drizzle schema/migrations
    state/                      # Zustand player/UI stores
    data/                       # repositories, queries
    native/                     # typed bridge to modules/audit-core
    features/                   # screens/components
  modules/audit-core/           # local Expo module (Kotlin)
    android/src/main/java/.../
      AuditCoreModule.kt
      download/                 # YoutubeDL + FFmpeg foreground service
      library/                  # SAF scanner, tags, artwork
      playback/                 # ExoPlayer + MediaSession + EQ (if chosen)
    android/src/main/AndroidManifest.xml
    expo-module.config.json
    src/AuditCore.types.ts
    src/AuditCoreModule.ts
  app.json / app.config.ts
  eas.json
```

Do not convert the desktop repo to npm workspaces. The mobile app has its own lockfile and native
build. Add `.easignore`/`.gitignore` entries for `node_modules`, build outputs, logs and test media.

---

## 5. React Native stack

Use the latest stable Expo SDK that supports the chosen native modules; pin versions in
`package.json` and document them. Enable React Native New Architecture.

| Concern | Choice |
|---|---|
| App framework | Expo + Expo Router, TypeScript strict |
| Navigation | Expo Router, typed routes, single stack + tabs |
| State | Zustand for playback/UI; TanStack Query for async data if useful |
| Database | `expo-sqlite` + Drizzle ORM + migrations; FTS for search |
| Lists | `@shopify/flash-list` |
| Motion | `react-native-reanimated` + `react-native-gesture-handler` |
| Sheets | `@gorhom/bottom-sheet` |
| Images | `expo-image` + Coil-compatible cache paths from native covers |
| Glass | `@uginy/react-native-liquid-glass` (Android 13+ AGSL); `expo-blur` fallback |
| Icons | `lucide-react-native` |
| Haptics | `expo-haptics` |
| Fonts | Manrope + tabular numerals, bundled locally (OFL) |
| Files | `react-native-saf-x` for folder picking/permissions; native module for recursive scan |
| Media library | `expo-media-library` only if publishing to public Music; SAF is primary |
| Testing | Jest + React Native Testing Library; Maestro/Detox smoke; native unit tests |

Development builds only. `@uginy/react-native-liquid-glass` and the local Kotlin module do not work
in Expo Go; EAS Build / `expo run:android` is required.

---

## 6. Native module contract (`modules/audit-core`)

Create a local Expo module with the Expo Modules API. Keep the JS API typed, small and stable.
All methods return promises; long-running work emits events.

### 6.1 Download API

```ts
export type DownloadFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav' | 'mp4' | 'best';
export type DownloadQuality = '320' | '256' | '192' | '128' | 'best';

export interface DownloadRequest {
  url: string;
  format: DownloadFormat;
  quality?: DownloadQuality;
  playlist?: boolean;
  playlistItems?: number[];
  outputUri?: string;          // SAF tree URI; omit for app-specific Music/Audit
  embedMetadata?: boolean;
  embedThumbnail?: boolean;
}

export interface DownloadTask {
  id: string;
  url: string;
  title?: string;
  status: 'queued' | 'extracting' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;            // 0..1
  speed?: string;
  eta?: string;
  outputUri?: string;
  error?: string;
}

AuditCore.enqueueDownload(request): Promise<DownloadTask>;
AuditCore.cancelDownload(taskId): Promise<boolean>;
AuditCore.retryDownload(taskId): Promise<DownloadTask>;
AuditCore.getDownloads(): Promise<DownloadTask[]>;
AuditCore.updateYtDlp(): Promise<{ version: string }>;
AuditCore.getYtDlpVersion(): Promise<string>;
AuditCore.onDownloadEvent(cb: (event: DownloadEvent) => void): Subscription;
```

Native implementation:

- Initialize `YoutubeDL`, `FFmpeg` and optional `Aria2c` in `Application.onCreate()`.
- `YoutubeDLRequest` with:
  - `-x` for audio, `--audio-format`, `--audio-quality`;
  - `--embed-metadata`, `--embed-thumbnail`, `--convert-thumbnails jpg`;
  - `--parse-metadata` for album/track where possible;
  - `--no-playlist` for singles, `--playlist-items` for selections;
  - `--concurrent-fragments`/aria2 optional;
  - `--socket-timeout`, retries.
- Foreground service (persistent notification, cancel action) with a bounded queue (3 concurrent).
- Progress callback → throttle to ~200ms → emit to JS.
- Cancellation via `YoutubeDL.destroyProcessById(taskId)`.
- Persist active/recent job state (SharedPreferences/Room) so a process restart can show failure or
  restore; do not silently lose queued jobs.
- Completed file: write to app-specific external storage first; then copy/publish to selected SAF
  tree or MediaStore; return a content URI that the library can index.
- URL validation: `http`/`https` only; reject `file://`, `content://` input, leading `-`, newlines and
  command-injection attempts. The library supports many sites; default UX is YouTube, and unsupported
  sites fail with a readable error.
- yt-dlp updater: expose current version and update action; check on launch/weekly with consent.
- No `MANAGE_EXTERNAL_STORAGE`; use SAF/MediaStore.

### 6.2 Library scan API

```ts
export interface ScanRequest {
  treeUri: string;
  incremental?: boolean;
}

export interface ScannedTrack {
  id: string;                  // stable hash of document URI
  mediaUri: string;
  documentId?: string;
  folderUri: string;
  relativePath: string;
  displayName: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  genre?: string;
  trackNo?: number;
  discNo?: number;
  year?: number;
  durationMs: number;
  sizeBytes: number;
  lastModified: number;
  mimeType: string;
  extension: string;
  coverUri?: string;           // cached thumbnail file URI, if found
  hasEmbeddedArt: boolean;
}

export interface ScanProgress {
  scanId: string;
  foldersVisited: number;
  filesFound: number;
  filesProcessed: number;
  currentName?: string;
  done: boolean;
  cancelled: boolean;
  error?: string;
}

AuditCore.startScan(request): Promise<{ scanId: string }>;
AuditCore.cancelScan(scanId): Promise<boolean>;
AuditCore.onScanProgress(cb: (progress: ScanProgress) => void): Subscription;
AuditCore.onScanBatch(cb: (tracks: ScannedTrack[]) => void): Subscription;
AuditCore.getTags(uri): Promise<TagData>;
AuditCore.writeTags(uri, fields): Promise<TagData>;
AuditCore.findLocalCovers(uri): Promise<CoverCandidate[]>;
AuditCore.cacheCover(uri, source): Promise<string>;   // returns cached file URI
```

Native scanner:

- `DocumentsContract.buildChildDocumentsUriUsingTree` + `ContentResolver.query` for speed; avoid
  recursive `DocumentFile.listFiles()` where possible.
- Supported extensions: mp3, m4a, aac, flac, wav, ogg, opus, wma (read-only if parsing works).
- `MediaMetadataRetriever` for title/artist/album/duration/embedded art; `jaudiotagger` fallback for
  genre/album artist/track/disc and formats where the framework is weak.
- Batch 100–200 tracks to JS; do not cross the bridge once per file for 10k tracks.
- Cache thumbnails/full art in `filesDir/covers/` with deterministic keys; return file URIs.
  Cover priority: embedded → folder (`cover.jpg`, `folder.jpg`, `front.jpg`, `albumart.jpg`,
  same-basename image) → sibling album track art.
- Incremental scan: compare document id, `lastModified`, size; emit upsert/remove. Handle revoked
  permission, deleted files, duplicates, corrupt tags, 0-byte files.
- Persist no library state in native; JS inserts `ScannedTrack` batches into expo-sqlite in a
  transaction. Keep scan progress smooth and cancellable.

### 6.3 Cover / tag API

- `findLocalCovers(uri)` returns candidates with source labels (`embedded`, `folder`, `album`).
- Online cover search stays in JS (MusicBrainz/Cover Art Archive or iTunes Search API), explicit tap
  only. Download the chosen image with `expo-file-system`; store it under app cache; update
  `cover_overrides` in SQLite.
- `writeTags` uses jaudiotagger/TagLib for writable SAF documents; report `APP_ONLY` when the file
  is read-only. Never claim a file write succeeded if it did not.
- “Find cover” is a first-class context-menu action, not a hidden settings page.

### 6.4 Playback / EQ API — Phase 0 decision

This is the highest-risk native piece. Choose **one** route and document it:

**Route A — TrackPlayer + native EQ bridge (less native code)**
- `react-native-track-player` owns playback/background/lock screen.
- A small native module attaches `android.media.audiofx.Equalizer` to the player audio session.
- Risk: TrackPlayer historically does not expose the ExoPlayer audio session id reliably. If a
  supported API/config exists, use it; otherwise this route requires a fork/patch and is not
  acceptable without proof.

**Route B — native AuditPlaybackService (recommended for EQ parity)**
- Kotlin `MediaSessionService` + Media3 ExoPlayer owns playback, notifications, audio focus,
  lock screen and queue.
- `Equalizer` + `LoudnessEnhancer` attach directly to the ExoPlayer audio session.
- JS sends queue/tracks and transport commands; native emits state/progress/metadata.
- More native code, but one audio engine and reliable EQ.

**Route C — `react-native-audio-api` + custom background bridge**
- Only if it passes background/lock-screen/interruption tests; not the default.

The brief default is **Route B** if Route A cannot prove session-id access. Do not ship two audio
engines. If EQ cannot be delivered, stop and report; do not fake the UI.

Suggested bridge (Route B):

```ts
AuditCore.setQueue(tracks: PlayableTrack[], startIndex: number): Promise<void>;
AuditCore.play(): Promise<void>;
AuditCore.pause(): Promise<void>;
AuditCore.seek(positionMs: number): Promise<void>;
AuditCore.next(): Promise<void>;
AuditCore.previous(): Promise<void>;
AuditCore.setRepeat(mode: 'off' | 'all' | 'one'): Promise<void>;
AuditCore.setShuffle(enabled: boolean): Promise<void>;
AuditCore.getPlaybackState(): Promise<PlaybackState>;
AuditCore.setEqEnabled(enabled: boolean): Promise<void>;
AuditCore.setEqPreset(name: string): Promise<void>;
AuditCore.setEqBand(index: number, gainDb: number): Promise<void>;
AuditCore.setPreamp(gainDb: number): Promise<void>;
AuditCore.onPlaybackEvent(cb: (event: PlaybackEvent) => void): Subscription;
AuditCore.onEqBands(cb: (bands: EqBand[]) => void): Subscription;
```

Queue/repeat/shuffle semantics must match the desktop’s behavior:
shuffle, repeat off/all/one, seek, next/prev, ended-advance. Persist queue and position in JS.

### 6.5 Share intent / deep links

- Add `ACTION_SEND` (text/plain) and `ACTION_VIEW` (http/https) intent filters to `MainActivity`.
- Native module exposes `getPendingSharedUrl()` / emits `onSharedUrl`; JS opens the download sheet
  pre-filled.
- Do not auto-start a download from a share without user confirmation.

### 6.6 Permissions / manifest

- `INTERNET`, `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE`, the correct foreground-service type,
  `POST_NOTIFICATIONS` (Android 13+), `WAKE_LOCK` if needed.
- No `MANAGE_EXTERNAL_STORAGE`; no broad storage permission for SAF.
- SAF `ACTION_OPEN_DOCUMENT_TREE` + `takePersistableUriPermission`.
- Request notification permission contextually; downloads still work if denied, but explain.
- Add a FileProvider only if sharing completed files externally is required.
- Document Android 14/15 foreground-service limits and the `dataSync`/`specialUse` declaration.

---

## 7. Local database (TypeScript / expo-sqlite)

Use Drizzle schema + migrations. The native core returns scan batches; JS owns persistence.

```text
tracks(
  id TEXT PRIMARY KEY,
  mediaUri TEXT NOT NULL,
  documentId TEXT,
  folderUri TEXT,
  relativePath TEXT,
  displayName TEXT,
  title TEXT, artist TEXT, album TEXT, albumArtist TEXT,
  genre TEXT, trackNo INTEGER, discNo INTEGER, year INTEGER,
  durationMs INTEGER, sizeBytes INTEGER, lastModified INTEGER,
  mimeType TEXT, extension TEXT,
  source TEXT,                 -- 'scanned' | 'downloaded'
  hasEmbeddedArt INTEGER,
  coverUri TEXT,
  addedAt INTEGER, updatedAt INTEGER, deletedAt INTEGER
)

folders(id TEXT PRIMARY KEY, treeUri TEXT, displayName TEXT, lastScanAt INTEGER, trackCount INTEGER)
playlists(id TEXT PRIMARY KEY, name TEXT, createdAt INTEGER, updatedAt INTEGER)
playlist_tracks(playlistId TEXT, trackId TEXT, position INTEGER, PRIMARY KEY(playlistId, trackId))
downloads(id TEXT PRIMARY KEY, url TEXT, title TEXT, format TEXT, quality TEXT,
          status TEXT, progress REAL, speed TEXT, eta TEXT, error TEXT,
          outputUri TEXT, trackId TEXT, createdAt INTEGER, updatedAt INTEGER)
cover_overrides(trackId TEXT PRIMARY KEY, source TEXT, localUri TEXT, updatedAt INTEGER)
settings(key TEXT PRIMARY KEY, value TEXT)
```

Add FTS5 (or FTS4 if the SQLite build lacks FTS5) for title/artist/album/genre/filename with triggers.
Batch inserts in transactions; use Paging 3? For RN, use `FlashList` + keyset pagination from SQLite.

---

## 8. UX and screens

### 8.1 Information architecture

- Bottom tabs: **Home**, **Search**, **Library**, **Downloads**.
- Persistent mini player above the tab bar.
- Full Now Playing as a modal; queue as a bottom sheet.
- Settings via Home header; Folders/Playlists as Library sub-routes.
- No pairing/sync/account/PC screen anywhere.

### 8.2 Screens

**Home**
- Greeting/time; library count; storage; last scan.
- Recently added; recently played; folders; playlists; downloaded.
- Empty state: “Add music folder” primary, “Download from a link” secondary.

**Search**
- Search over local FTS; 250ms debounce; filters Songs/Albums/Artists/Playlists/Videos.
- Recent searches; no fake recommendations.

**Library**
- Songs / Albums / Artists / Genres / Folders / Playlists / Downloads.
- Sort by title/artist/album/duration/recently added/recently downloaded.
- Multi-select; context menu; source badge.
- Album/artist detail with cover hero, play/shuffle, track list.

**Folders**
- Add folder via SAF; show name, track count, last scan, rescan, remove.
- Scan progress with cancel; revoked-permission recovery.

**Downloads**
- URL/search input + paste; share target.
- Format/quality/playlist sheet.
- Active / Waiting / Completed / Failed; progress, speed, ETA; cancel/retry.
- Destination picker; Wi-Fi-only; metadata/thumbnail toggles.
- No “PC” state.

**Now Playing**
- Full-bleed blurred artwork backdrop; large cover; title/artist/album.
- Seek; elapsed/remaining; shuffle/repeat; prev/play/next.
- Queue, EQ, cover menu; local/downloaded badge.
- Swipe down to mini; swipe up to queue.

**Queue / Playlists / EQ / Settings / Cover picker / Tag editor**
- Same functional behavior as the desktop player, adapted to touch.
- Cover picker: local candidates + “Search online” (explicit), preview, apply, optional write-to-file.
- EQ: bands from native `getEqBands`; presets; preamp; persist in JS and re-apply on startup.

---

## 9. Visual design — real liquid glass, Airbnb/Spotify simplicity

### 9.1 Direction

Dark, calm, tactile. Spotify gives the music-app structure; Airbnb gives the generous spacing and
clear hierarchy; Apple gives the glass material. Do not clone Spotify branding or iOS chrome.

- Background `#050607`; elevated `#0B0E11`; text `#F5F7F8`; muted `#9AA5AD`.
- Accent **Audit Lime `#B8FF3C`**; album art provides secondary tint.
- Type: Manrope (OFL) for UI; tabular numerals for time. Bundle fonts.
- Radii: 24dp cards, 28–32dp glass, 999dp pills; 20dp gutters.

### 9.2 Liquid glass implementation

Use `@uginy/react-native-liquid-glass`:

```tsx
<LiquidGlassView
  blurRadius={40}
  tintColor="#ffffff"
  glassOpacity={0.08}
  refractionStrength={0.08}
  chromaticAberration={0.18}
  edgeGlowIntensity={0.35}
  glareIntensity={0.45}
  noiseIntensity={0.025}
  cornerRadius={28}
  style={styles.glass}
>
  {children}
</LiquidGlassView>
```

- Full refraction/chromatic aberration requires **Android 13+ (API 33)** and New Architecture.
- Below API 33, use a real `expo-blur` (Dimezis) fallback plus a translucent tint; if blur is not
  available, use an opaque elevated surface. Never render unreadable text.
- Glass surfaces: bottom nav, mini player, Now Playing control dock, primary action button,
  bottom-sheet headers. Not every list row/card.
- Add a 1px top/left specular highlight, dark bottom/right edge, soft shadow and subtle noise.
- Do not use a global `filter: contrast(3)` equivalent; keep text contrast at 4.5:1.
- Measure on a low-end Android device; reduce blur radius/layers or fall back if frame time suffers.

### 9.3 CSS reference mapping

The CSS liquid-glass demos on freefrontend use browser compositor features. Translate the **look**,
not the code:

| CSS reference | RN implementation |
|---|---|
| `backdrop-filter: blur()` | `LiquidGlassView` live backdrop blur |
| SVG `feDisplacementMap` | `refractionStrength` + `chromaticAberration` |
| `filter: contrast(3)` | Do not port globally; use stronger specular/edge contrast inside the glass |
| inset bevel shadows | nested gradient/border views, top-left highlight, bottom-right shade |
| `:before`/`:after` rim glare | `expo-linear-gradient` overlay/clip or `react-native-svg` |
| conic-gradient rim | `react-native-svg` sweep gradient or Skia; optional on the primary button |
| 3D press | Reanimated `scale`/`rotateX` spring + `expo-haptics` |
| noise | `noiseIntensity` prop or a 2–3% tiled PNG |
| `contain: strict` | clip each glass surface; avoid invalidating the screen; limit layers |

Reject “glass” that is only transparent background, static image blur, or blur on every row.

### 9.4 Motion and accessibility

- 200–300ms spring; mini→full player morph; album art parallax; sheet slide.
- Haptics on play/pause, skip, long-press; not on scroll.
- Respect Reduce Motion; no essential content hidden behind animation.
- TalkBack labels; 48dp targets; 200% font scale; edge-to-edge insets; contrast checks.

---

## 10. Implementation plan

### Phase 0 — Proofs (3–5 days)

1. Create Expo dev build + local module skeleton.
2. Prove `youtubedl-android` initialization and one audio download with FFmpeg/metadata/thumbnail.
3. Prove foreground download survives screen off; cancel works.
4. Prove SAF recursive scan of 1,000 files in batches, with tags/art and progress.
5. Prove `@uginy/react-native-liquid-glass` on a real Android 13+ device; test API 31 fallback.
6. Decide playback/EQ route A/B/C and document it.

**Stop if** the license cannot be accepted, or any core spike fails without a concrete fallback.
Do not build the full UI before these proofs.

### Phase 1 — Design system and shell
- Tokens, fonts, `GlassSurface`, buttons, rows, cover, empty states, tab bar, mini player.
- Expo Router routes and typed navigation.

### Phase 2 — Library
- SAF picker, native scanner bridge, expo-sqlite schema/FTS, batches/progress.
- Songs/Albums/Artists/Genres/Folders/Playlists; search/sort/pagination.
- Covers everywhere; cover cache; context menu skeleton.

### Phase 3 — Playback/EQ
- Implement chosen route; queue, shuffle/repeat, background, lock screen, focus.
- Mini/full player; seek; EQ bands/presets; persistence.

### Phase 4 — Downloads
- Native foreground service; queue/notifications; share intent; format/quality sheet.
- Progress/cancel/retry; output to SAF/MediaStore; metadata/thumbnails; library ingest.
- yt-dlp updater.

### Phase 5 — Covers/tags/playlists/polish
- Cover picker + online search; tag editor; playlists; multi-select.
- Settings, storage, licenses, privacy.

### Phase 6 — Release
- Performance/glass fallback, accessibility, edge-to-edge.
- Signed APK/AAB; F-Droid/GitHub metadata; store-risk review.

---

## 11. Acceptance criteria

### Library
- Add a folder with 1,000 tracks; scan completes under ~90s; progress visible/cancellable.
- Covers appear for embedded art, folder images and sibling album art; no blank squares.
- Incremental rescan; deleted files marked; revoked permission recovery.
- Search <150ms; 10,000 tracks usable; no ANR.

### Cover context menu
- Long-press → Find cover shows local candidates; selecting updates list/mini/player.
- Online search only on tap; source labels; cancel preserves old cover.
- Override persists; optional file write reports success/failure honestly.

### Downloads
- Paste/share URL; fetch info; MP3 320; progress/notification; screen-off continues.
- Cancel/retry; playlist x/y; completed file enters library with tags/art.
- Invalid URL/network/storage/expired extractor clear errors.
- No PC/server/account involved.

### Playback
- Background 30+ min; lock screen/Bluetooth; interruptions; queue; seek; EQ audible/persistent.
- Mini→full player morph; no double audio.

### Glass
- Nav/mini player visibly blur/refract scrolling art; not a static alpha fill.
- 60fps on target mid-range; API 31 fallback usable.
- Contrast/TalkBack/font scale/insets pass.

### Engineering
- `npx expo-doctor`, TypeScript, ESLint, Jest, native unit tests, release build green.
- `npm run verify` in desktop repo remains green (no desktop changes).
- License notices/source obligations satisfied.

---

## 12. License and distribution reality

- `io.github.junkfood02.youtubedl-android` is **GPL-3.0**. Linking it means the distributed app must
  comply with GPL-3.0 (source availability/notice). If closed-source distribution is required, stop
  and resolve before coding.
- Seal itself is GPL-3.0 and restricts its name; do not copy its code or branding.
- `yt-dlp` is Unlicense; FFmpeg/Python/aria2c have their own licenses; audit the exact build.
- `@uginy/react-native-liquid-glass` is MIT; `react-native-saf-x` is MIT; Expo/RN/AndroidX are
  Apache-2.0/MIT as per their licenses.
- Direct YouTube downloading is a store/legal risk. Seal distributes via GitHub/F-Droid, not as a
  standard Play Store app. Prepare GitHub/F-Droid first; Play Store approval is not guaranteed.
- Add an in-app licenses screen and a permissions rationale.
- In-app APK update is optional; if added, use `REQUEST_INSTALL_PACKAGES` honestly and never force it.

---

## 13. Guardrails

- No desktop/sync/pairing/LAN/server code. Remove old `mobile/` Expo sync attempt and
  `src/main/mobile-sync/` if present.
- No pure-JS yt-dlp extractor; no `ytdl-core`-style scraping.
- No `MANAGE_EXTERNAL_STORAGE` for the core flow.
- No fake glass; no blur on every surface.
- No copied Spotify/Poweramp/Seal assets or code.
- No silent downloads or background library crawling.
- No claim that local scanning uses mutagen. yt-dlp uses mutagen for downloaded metadata/art;
  local scanning uses MediaMetadataRetriever + jaudiotagger/TagLib.
- Do not break the desktop `npm run verify`.
- Do not ship two audio engines or two glass implementations.
- If a native spike fails, stop and report; do not replace it with a fake UI.

---

## 14. Deliverables

- `mobile/` Expo app with the full UI and typed native bridge.
- `mobile/modules/audit-core/` Kotlin module:
  - download foreground service (youtubedl-android + FFmpeg);
  - SAF scanner + tag/artwork extraction;
  - playback/EQ route chosen in Phase 0;
  - share intent bridge;
  - typed JS API and events.
- Docs:
  - `docs/android-rn/ARCHITECTURE.md`
  - `docs/android-rn/NATIVE_MODULE.md`
  - `docs/android-rn/LICENSE_STRATEGY.md`
  - `docs/android-rn/DESIGN.md`
  - `docs/android-rn/RELEASE.md`
  - `docs/android-rn/KNOWN_LIMITATIONS.md`
- Evidence:
  - real-device screenshots of Home, Library, Folders, Downloads, Now Playing, Cover picker, EQ;
  - a demo: scan 1,000 tracks → covers → play/background → EQ → download → metadata/art → cover search;
  - glass performance report on a low-end API 33 device and an API 31 fallback device.

---

## 15. Defaults for open decisions

| Decision | Default |
|---|---|
| Platform | Android only |
| UI | Expo/React Native + TypeScript, dev build |
| Native core | Local Expo module in Kotlin |
| Download | `youtubedl-android` + FFmpeg, foreground service |
| Glass | `@uginy/react-native-liquid-glass`, API 33+; fallback below |
| Folder access | SAF via `react-native-saf-x`; native recursive scanner |
| Local DB | expo-sqlite + Drizzle + FTS |
| Covers | MediaMetadataRetriever + jaudiotagger/TagLib; cache files |
| Playback/EQ | Phase 0: TrackPlayer+EQ bridge or native Media3 service; default native service if EQ blocked |
| Distribution | GitHub/F-Droid first; Play Store separate gate |
| Theme | Liquid Glass only, token engine ready |
| Language | English + Italian, no hardcoded strings |

---

## 16. Final instruction to the agent

Start by removing the wrong sync/Expo-only architecture from the branch. Then prove the core with
real-device spikes before building screens:

1. yt-dlp download + FFmpeg + metadata/thumbnail + foreground service;
2. SAF recursive scan of 1,000 tracks + tags/art;
3. `@uginy/react-native-liquid-glass` on Android 13+ and fallback;
4. playback/EQ route.

Only after those proofs should you build the full UI. Do not stop at scaffolding. If a spike fails,
report the exact device/API/error and a concrete fallback; never replace a native capability with a
fake UI or a desktop dependency.
