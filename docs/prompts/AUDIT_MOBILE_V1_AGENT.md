# Audit Mobile v1 — Build Brief for a Parallel Agent

> **How to use this document:** give this entire file to the agent, together with the repository at
> `https://github.com/TheNotoriousCompa/Audit`. The agent must read the repo before writing code.
> This is a product + engineering brief, not a suggestion list. Where a decision is marked
> **DECIDED**, do not reopen it. Where a risk is marked **SPIKE**, investigate before committing.

---

## 1. Mission

Ship **Audit Mobile 1.0** for **iOS and Android** as one coordinated release.

Audit Mobile is a **local-first, offline-capable music app** with:

- a Spotify-like information architecture: Home, Search, Library, persistent mini player,
  full-screen Now Playing, queue, playlists;
- a distinctive **Liquid Glass / After Dark** visual language;
- local playback, background audio, lock-screen controls, EQ, playlists, themes and metadata editing;
- optional pairing with **Audit Desktop 1.5.1+** for library sync and download delegation.

The phone must be useful **without the desktop**: imported local audio, playlists, playback, EQ,
themes and settings all work offline. The desktop adds the library, the downloader, and the
yt-dlp/FFmpeg engine.

**Do not build a cloud service in v1.** Do not add accounts, subscriptions, social features,
recommendations, or a hosted backend. A remote/self-hosted sync server is explicitly a later phase;
the protocol must leave room for it, but v1 is LAN-first.

---

## 2. Current product context

Audit Desktop is an Electron app that downloads YouTube audio/video and plays a local library.

- Repository: `https://github.com/TheNotoriousCompa/Audit`
- Current release at the time of this brief: **v1.5.1** (commit `7844247`)
- Desktop stack: Electron 28, Next.js 15.5 static renderer, React 19, Tailwind 4,
  TypeScript, better-sqlite3, bundled Python 3.13 + yt-dlp + FFmpeg.
- Packaging: Electron Forge, Squirrel.Windows installer + portable ZIP.
- Platform today: Windows is the primary tested target; the codebase contains macOS/Linux paths
  but do not assume they are release-quality for mobile sync.

### Desktop features that define the product

| Area | Current behavior |
|---|---|
| Downloader | YouTube URL or `ytsearch:` query, MP3/M4A/FLAC/WAV/Opus/best, bitrate/quality, playlist support, progress, cancel, skip-existing, embedded cover art/metadata |
| Library | Multiple folders, recursive scan, SQLite + FTS, sort/filter/pagination, artists/albums/genres/recent/videos, stats, artwork (embedded or folder fallback), `.lrc` flag |
| Player | Hidden HTML audio element, queue, shuffle, repeat off/all/one, seek, volume, mini player, visualizer, 10-band EQ + preamp + presets |
| Playlists | Renderer localStorage, ordered absolute paths, create/rename/delete/add/remove/reorder |
| Tags | Read tags via Python/mutagen; write title/artist/album/genre to files via mutagen |
| Themes | Offline declarative JSON (`schemaVersion: 1`), Default, Pixel, Retro 98, Vista Aero, custom wallpaper, import/export, decorators `pixel`, `win98`, `aero` |
| Updates | Background GitHub check, visible notification, nothing downloaded until user chooses, nothing installed until “Restart and install” |
| Mini player | Separate always-on-top window, theme-synced through shared `localStorage` snapshot |

### Files the agent must read first

Read these before designing the mobile data model or protocol:

- `src/types/electron.d.ts` — the complete desktop API and data contracts.
- `src/app/page.tsx` — app shell, downloader, themes, update UI, window chrome.
- `src/components/player/PlayerSection.tsx` — library/queue/player orchestration.
- `src/components/player/PlayerBar.tsx` — queue, repeat, shuffle, playback state.
- `src/components/player/NowPlaying.tsx` — current now-playing composition.
- `src/components/player/LibraryHome.tsx` — library categories, search, pagination.
- `src/components/player/playlists.ts` — playlist semantics.
- `src/components/player/EqualizerPanel.tsx` and `EQEngine.ts` — EQ model.
- `src/components/player/MiniView.tsx` — mini-player behavior and theme sync.
- `src/components/theme.ts` — theme tokens and CSS mapping.
- `src/main/db.ts` — schema, migrations, FTS, path keys.
- `src/main/ipc-handlers.ts` — trusted IPC surface and path policy.
- `src/main/python-bridge.ts` — download execution and progress events.
- `src/main/library.ts`, `src/main/media-protocol.ts` — scanning, artwork, Range streaming.
- `src/main/theme-store.ts` — offline theme validation and samples.
- `docs/PLAYER.md` — player design decisions and provenance rules.
- `docs/UPDATES.md` — user-controlled update contract.
- `DESIGN.md` — an analysis of Spotify’s web design. Use it as **structural inspiration**, not a
  visual clone. The mobile visual direction in this brief supersedes it.
- `themes/*.audit-theme.json` — the token vocabulary the mobile theme engine must accept.

### Product invariants that must survive

1. **Local-first and private.** No account, no telemetry by default, no upload of the user’s library.
2. **Downloads are desktop-owned.** Mobile never runs yt-dlp or FFmpeg and never scrapes YouTube
   itself in v1. It sends a validated request to the paired desktop.
3. **User consent for network and updates.** No silent downloads, no forced updates, no installing
   an update without an explicit action.
4. **Themes are offline.** No theme fetching over the network. Theme JSON may embed a wallpaper.
5. **Path safety.** The desktop must never expose arbitrary files. Only approved library roots and
   completed download outputs may be read. Reject traversal, symlinks outside roots, and non-audio MIME.
6. **Clean-room.** Do not copy Spotify, Poweramp, or any third-party app’s code, assets, fonts, icons,
   screenshots, or proprietary data. No `.milk` presets, no Poweramp `auto_eq.db`, no Spotify fonts or
   logo, no Spotify green/wordmark.
7. **Desktop build stays green.** `npm run verify` in the desktop project must continue to pass.

---

## 3. Scope for v1 (one release, one scope)

This is the authoritative parity matrix. “1:1” means functional parity where the platform allows it;
it does not mean copying desktop chrome or Windows-only behavior.

| Capability | Mobile v1 behavior | Release gate |
|---|---|---|
| Onboarding | 3 short pages, optional pairing, permissions explained | Yes |
| Desktop pairing | QR scan + manual host/code, device token, revoke | Yes |
| Library sync | Incremental metadata + artwork from desktop, local cache, offline | Yes |
| Phone library import | Document picker / share sheet into app sandbox; local DB | Yes |
| Library browsing | Songs, artists, albums, genres, recently added/downloaded, videos, search, sort | Yes |
| Local playback | Play/pause, seek, next/prev, shuffle, repeat off/all/one, volume/mute | Yes |
| Background audio | Lock screen, control center, Bluetooth/headset, interruptions, audio focus | Yes |
| Mini player | Persistent above tabs, theme-aware, expand/collapse | Yes |
| Full Now Playing | Artwork, metadata, seek, queue, EQ shortcut, output state | Yes |
| Queue | Reorder, remove, clear, save as playlist | Yes |
| Playlists | Create/rename/delete, add/remove/reorder, sync with desktop | Yes |
| Downloads | Paste URL/search, choose format/quality, send to paired desktop, progress, cancel, retry, “PC offline” queue | Yes |
| Offline copies | Mark synced tracks “available offline”, download file from desktop over LAN, storage management | Yes |
| EQ | 10 bands 31 Hz–16 kHz, preamp, presets, persistence | Yes (see audio spike) |
| Themes | One shipped **Liquid Glass** preset + token engine compatible with `AuditTheme` | Yes |
| Tag editor | Edit title/artist/album/genre in local DB; sync edit to desktop; desktop writes embedded tags | Yes |
| Video | Play local/synced MP4 in a dedicated player; keep music player state separate | Yes |
| Updates | Store update + EAS Update check, release notes, user-controlled install/restart | Yes |
| Visualizer | Optional analyser view; may be deferred if audio engine cannot expose samples | No |
| Lyrics panel | Desktop has only `.lrc` detection, no panel. Do not invent it in v1. | No |
| Cloud/remote | No hosted backend, no remote access, no accounts | No |
| Android Auto / CarPlay | Deferred | No |
| Widgets | Deferred | No |
| Cast/AirPlay | Deferred | No |
| Light mode | Deferred; v1 is dark only | No |
| Tag writing on-device | Only if a maintained cross-format library exists; otherwise desktop-owned | No |

If a feature in the “No” rows sneaks into the UI, it must be clearly disabled or absent, not a
placeholder that looks shipped.

---

## 4. Architecture

### 4.1 Repository strategy — DECIDED

Use the **same repository**, in a new top-level `mobile/` directory, on a dedicated branch
`feat/mobile-v1`, from `dev` (not `main`).

Reasons:

- shared theme token vocabulary, sync contract and product language;
- one place for release documentation;
- no risky npm workspace conversion of the Electron root.

Rules:

- `mobile/` has its own `package.json`, lockfile and `node_modules`. Do **not** convert the root to
  npm workspaces; better-sqlite3 + Electron ABI rebuilds are fragile.
- Add a root `.easignore` (or `mobile/.easignore`) that excludes `node_modules`, `dist`, `out`,
  `.next`, `python-runtime`, `ffmpeg`, test databases, logs and screenshots from EAS uploads.
- Do not move the existing Next.js app. `src/app` remains the desktop renderer.
- Add a `mobile/README.md` with exact local run commands and EAS commands.
- If the mobile build genuinely cannot coexist, stop and write an ADR before creating a separate repo.
  Do not silently fork the product.

### 4.2 Mobile stack — DECIDED, versions verified at implementation time

Use the latest stable Expo SDK supported by EAS at the time of implementation. Do not hardcode an SDK
number from this brief. Enable the React Native New Architecture.

- **Expo + Expo Router** (typed routes), TypeScript strict.
- **expo-sqlite + Drizzle ORM** with explicit migrations; FTS5 for search.
- **expo-secure-store** for device tokens; **expo-file-system** for audio and artwork cache.
- **expo-image** for artwork, blurhash/thumbhash placeholders, memory/disk cache.
- **expo-blur**, **expo-linear-gradient**, **expo-haptics**.
- **react-native-reanimated** + **react-native-gesture-handler** for motion.
- **@gorhom/bottom-sheet** for queue/options sheets.
- **FlashList** for long track lists; never render 1,000 rows with `ScrollView`.
- **lucide-react-native** for icons, consistent with the desktop’s Lucide language.
- **expo-localization + i18n** for English and Italian; no hardcoded UI strings.
- **expo-camera** for QR pairing.
- **expo-notifications** only if needed for “download completed”; ask for permission at the right moment.
- **EAS Build / EAS Submit / EAS Update** for release.

Do not add Redux. Prefer small Zustand stores for player/UI state + TanStack Query (or equivalent)
for server state, with SQLite as the local source of truth.

### 4.2.1 Native build and platform permissions

- Use an **Expo development build / EAS build**, not Expo Go, for native audio, blur, camera and
  local-network modules.
- iOS:
  - `UIBackgroundModes: ["audio"]` for background playback;
  - `NSLocalNetworkUsageDescription` for LAN sync;
  - ATS exception for local networking (`NSAllowsLocalNetworking`) or HTTPS; do not disable ATS
    globally;
  - explain the local-network prompt in onboarding; do not trigger it on first launch without context.
- Android:
  - `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`
    (Android 13+);
  - cleartext LAN HTTP needs an explicit network-security config; scope it to local/private networks,
    never `usesCleartextTraffic=true` globally;
  - do not request broad storage permissions for the document-picker flow.
- Ask for camera, notifications and local-network access at the moment they are needed, with a
  visible explanation and a working “Not now” path.
- Verify permission-denied states, not just the happy path.

### 4.3 Audio engine — SPIKE, highest risk

The desktop EQ is a Web Audio graph. React Native has no built-in Web Audio graph. Do not assume
`react-native-track-player` can expose an EQ. Run a focused spike before building the player UI.

Candidates:

1. **react-native-track-player + native EQ module**
   - Strength: mature background playback, lock screen, media session, queue.
   - Risk: attaching a 10-band EQ to the underlying ExoPlayer/AVPlayer audio session; needs a small
     Expo native module (Android `Equalizer`/`LoudnessEnhancer`, iOS `AVAudioUnitEQ`).
2. **react-native-audio-api + custom background/Now Playing bridge**
   - Strength: Web Audio-like graph, EQ, analyser/visualizer.
   - Risk: background audio, lock-screen metadata, audio focus, interruptions, Bluetooth controls
     must be implemented and verified on both platforms.

**Gate:** choose one engine that supports all of:

- background playback for at least 30 minutes;
- lock screen / control center metadata and transport;
- headset/Bluetooth play-pause-next-prev;
- audio focus and interruptions (calls, alarms, other apps);
- seek and queue transitions without gaps or double playback;
- 10-band EQ + preamp;
- no competing audio engine in the same build.

Document the decision, versions, trade-offs and test evidence in `docs/mobile/AUDIO_ENGINE.md`.
Do not ship two audio engines “just in case”.

### 4.4 Local data model (mobile)

Use Drizzle schema + migrations. Minimum tables:

```text
tracks(
  id TEXT PRIMARY KEY,            -- stable local id
  remote_id TEXT,                 -- desktop track id when synced
  title, artist, album, genre TEXT,
  duration REAL, size INTEGER, ext TEXT, mtime INTEGER,
  added_at INTEGER, downloaded_at INTEGER,
  has_art INTEGER, lrc INTEGER,
  source TEXT,                    -- 'phone' | 'desktop'
  local_uri TEXT,                 -- file:// in app sandbox, nullable
  remote_stream_url TEXT,         -- only while paired; not persisted as truth
  artwork_uri TEXT,
  updated_at INTEGER,
  deleted_at INTEGER
)

playlists(id TEXT PRIMARY KEY, name TEXT, created_at INTEGER, updated_at INTEGER, deleted_at INTEGER)
playlist_tracks(playlist_id TEXT, track_id TEXT, position INTEGER, PRIMARY KEY(playlist_id, track_id))

download_jobs(
  id TEXT PRIMARY KEY, query TEXT, format TEXT, quality TEXT,
  status TEXT, progress REAL, error TEXT, remote_track_id TEXT,
  created_at INTEGER, updated_at INTEGER
)

sync_state(desktop_id TEXT PRIMARY KEY, cursor INTEGER, last_sync_at INTEGER, device_name TEXT)
settings(key TEXT PRIMARY KEY, value TEXT)
```

Add `tracks_fts` with triggers for title/artist/album/genre, mirroring the desktop’s FTS behavior.
Store artwork as files, not base64 blobs, with a deterministic cache key.

### 4.5 Sync topology

```text
┌─────────────────────────────┐         LAN / Wi-Fi          ┌──────────────────────────────┐
│ Audit Mobile (Expo)         │  HTTPS or HTTP + bearer      │ Audit Desktop (Electron)     │
│                             │  WebSocket events            │                              │
│ SQLite cache                │ <──────────────────────────> │ SQLite library               │
│ local audio files           │                              │ yt-dlp + FFmpeg              │
│ player + EQ                 │  QR pairing / device token   │ mobile-sync HTTP server      │
└─────────────────────────────┘                              └──────────────────────────────┘
```

- The desktop is the **source of truth for downloaded files**.
- The phone is the **source of truth for its own local imports and playback queue**.
- Playlists and metadata edits merge last-write-wins with a device id tiebreaker.
- The phone may stream a desktop track without downloading it; “Available offline” explicitly caches it.
- If the desktop is offline, all cached/local content remains usable; remote actions queue or fail
  with a clear state.

### 4.6 Desktop sync server requirements

Add a feature-flagged module, e.g. `src/main/mobile-sync/`:

- Node `http` server + `ws`; bind to LAN interface, port `47823` by default (configurable).
- Start only when the user enables “Mobile sync” in desktop settings.
- Show a QR + 6-digit pairing code + host/port + fingerprint, with a 5-minute expiry.
- Pairing code is one-use; tokens are random 256-bit, stored hashed on desktop and in
  `expo-secure-store` on mobile.
- Device registry with name, platform, last seen, revoke.
- Reuse `db.ts` queries, `approved-paths.ts`, `library.ts`, `media-protocol.ts` and `python-bridge.ts`.
  Do not create a second library implementation.
- Add a change journal (`sync_changes`) or equivalent so incremental sync does not rescan the library.
- Emit download progress from the existing Python bridge; do not spawn a second downloader.
- Enforce the same YouTube allowlist as `download-policy.ts`.
- Never expose a raw filesystem path in an API response. Use stable track ids.
- No UPnP, no public bind by default, no remote access in v1. If the server detects a non-private
  client address, reject it unless the user explicitly enabled an advanced remote mode (not in v1).
- Document the security model and the future TLS/remote plan.

### 4.7 Sync protocol v1 — contract

Put the authoritative contract in `docs/mobile/SYNC_PROTOCOL.md` and keep both clients aligned.
Use JSON, UTF-8, `Authorization: Bearer <deviceToken>` on every request. WebSocket authenticates
with a first `auth` message, not a token in the URL.

Base: `http://<host>:<port>/v1` (LAN only in v1).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | app version, protocol version, library id, track count |
| `POST` | `/pair` | exchange one-time code + device info for a device token |
| `GET` | `/library/tracks?cursor=&limit=500` | incremental track manifest |
| `GET` | `/library/tracks/:id` | single track metadata |
| `GET` | `/library/tracks/:id/art` | artwork bytes |
| `GET` | `/library/tracks/:id/stream` | audio stream with HTTP Range |
| `POST` | `/library/rescan` | trigger a desktop rescan |
| `GET` | `/playlists?cursor=` | incremental playlist manifest |
| `PUT` | `/playlists/:id` | upsert playlist (name, ordered track ids, updatedAt) |
| `DELETE` | `/playlists/:id` | tombstone |
| `POST` | `/downloads` | enqueue a validated download request |
| `GET` | `/downloads` | active/recent jobs |
| `GET` | `/downloads/:id` | job detail |
| `POST` | `/downloads/:id/cancel` | cancel |
| `GET` | `/events` | WebSocket: download progress, library changes, sync hints |
| `GET` | `/devices` | paired devices (desktop UI may use direct DB instead) |
| `DELETE` | `/devices/:id` | revoke a device |

Track DTO (never include the absolute path):

```json
{
  "id": "sha256-normalized-path-prefix",
  "title": "…",
  "artist": "…",
  "album": "…",
  "genre": "…",
  "duration": 231.4,
  "size": 9123456,
  "ext": "mp3",
  "mtime": 1760000000000,
  "addedAt": 1760000000000,
  "downloadedAt": 1760000000000,
  "hasArt": true,
  "lrc": false,
  "artUrl": "/v1/library/tracks/<id>/art",
  "streamUrl": "/v1/library/tracks/<id>/stream"
}
```

Manifest response:

```json
{
  "protocol": 1,
  "libraryId": "uuid",
  "serverTime": 1760000000000,
  "nextCursor": 42,
  "hasMore": false,
  "tracks": { "upsert": [], "remove": [] },
  "playlists": { "upsert": [], "remove": [] }
}
```

Download request:

```json
{
  "query": "https://www.youtube.com/watch?v=…",
  "format": "mp3",
  "quality": "320",
  "playlist": false
}
```

Download job:

```json
{
  "id": "job-uuid",
  "status": "queued|downloading|converting|ready|error|cancelled",
  "progress": 43.2,
  "trackId": "…",
  "error": null
}
```

WebSocket events:

```json
{ "type": "download.progress", "job": { "id": "…", "status": "downloading", "progress": 43.2 } }
{ "type": "download.ready", "job": { "id": "…", "trackId": "…" } }
{ "type": "library.changed", "cursor": 43 }
{ "type": "device.revoked", "deviceId": "…" }
```

Semantics:

- `cursor` is a monotonically increasing change sequence on the desktop.
- A first sync may be a full manifest; later syncs are incremental.
- Deletes are tombstones with `deletedAt`, not silent disappearance.
- Playlist merge: highest `updatedAt` wins; compare device id as a deterministic tiebreaker.
- Download progress is best-effort; final state is authoritative.
- Range requests must support seek for streaming and resumable file caching.
- `429` + `Retry-After` for rate limiting; `401` for revoked/expired tokens; `409` for cursor resets.

### 4.8 File and artwork transfer

- Stream audio with Range; cache under `FileSystem.documentDirectory/audio/<trackId>.<ext>`.
- Artwork cache under `.../artwork/<trackId>.img`; validate content type and size.
- Never store a bearer token in plain AsyncStorage; use SecureStore.
- On iOS, enable file sharing if you want users to import via Finder/Files; on Android, use the
  document picker / share intent. Do not promise arbitrary filesystem scanning on iOS.
- A phone-imported file gets a stable local id and `source: 'phone'`; it is not uploaded automatically.

### 4.9 Playback and sync conflicts

- Playback never depends on the network when a local file exists.
- If the phone is streaming from desktop and the connection drops, pause with a clear error; do not
  silently switch to a different track.
- Queue is local to the phone. Desktop playback state is separate in v1; do not pretend it is shared.
- “Continue on phone” / cross-device handoff is a later feature, not v1.
- Playlists and metadata can sync while playback is local; do not block the UI on sync.

### 4.10 Store and legal risk — do not hide it

Downloading YouTube content can conflict with YouTube’s terms and with App Store/Play Store review
policies. This is a product risk, not an engineering detail.

- v1 deliberately does **not** bundle an extractor or download directly on the phone; it asks the
  paired desktop to download. Say that plainly in the product and privacy copy.
- Do not claim YouTube affiliation, endorsement, or “official” access.
- Get a legal/store review before submitting. Keep a fallback plan: if a store rejects the download
  feature, ship the same app as a local player + desktop sync client, with download requests handled
  by the already-installed desktop app.
- Store listings must not show YouTube branding as if it were a partner integration.
- Document the outcome in `docs/mobile/KNOWN_LIMITATIONS.md` and the release checklist.

---

## 5. Design brief — “Liquid Glass / After Dark”

### 5.1 Direction

A dark, immersive music space where **album art is the only loud color** and glass surfaces feel
physical but quiet. Spotify-like in structure and density, not in branding. The interface should feel
like a premium audio device: deep black, soft ambient light, tactile translucency, precise typography.

Keywords: **immersive, tactile, quiet, premium, album-art-first, editorial, nocturnal**.

Do not:

- use Spotify’s logo, wordmark, proprietary fonts, exact green `#1ED760`, or copied screenshots;
- make every surface a blurred glass card (blur fatigue + performance);
- use pure black `#000000` as the only background;
- use generic purple SaaS gradients;
- add drop shadows on text or neon glow everywhere;
- use more than two blur layers on one screen.

### 5.2 Design tokens (starting point; refine, don’t ignore)

```json
{
  "color": {
    "bg": "#050607",
    "bgElevated": "#0B0E11",
    "surface": "rgba(20, 24, 29, 0.72)",
    "surfaceStrong": "rgba(10, 13, 16, 0.88)",
    "glassTint": "rgba(255, 255, 255, 0.06)",
    "glassTintStrong": "rgba(255, 255, 255, 0.10)",
    "glassStroke": "rgba(255, 255, 255, 0.14)",
    "glassStrokeSoft": "rgba(255, 255, 255, 0.08)",
    "text": "#F5F7F8",
    "muted": "#9AA5AD",
    "mutedStrong": "#C2C9CE",
    "accent": "#B8FF3C",
    "accentInk": "#0A0D07",
    "danger": "#FF6B6B",
    "warning": "#FFC857"
  },
  "radius": { "sm": 12, "md": 18, "lg": 24, "xl": 32, "pill": 999 },
  "space": { "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40 },
  "blur": { "thin": 24, "regular": 48, "thick": 72 }
}
```

Accent: **Audit Lime `#B8FF3C`**, used sparingly for primary action, active states and small
indicators. Album artwork provides a secondary ambient tint; derive it per track and clamp saturation.
If the design needs a more Spotify-familiar accent, use the lime, not Spotify green.

### 5.3 Glass recipe

A reusable `GlassSurface` component with `thin | regular | thick` variants:

1. `BlurView` with dark tint, intensity 24/48/72.
2. A translucent gradient base: top `rgba(255,255,255,0.10)`, mid transparent, bottom `rgba(0,0,0,0.25)`.
3. 1px border: top/left `rgba(255,255,255,0.18)`, bottom/right `rgba(0,0,0,0.45)`.
4. An inner top highlight 1px, 40% white, only on hero cards.
5. A 2–3% opacity monochrome noise tile to prevent banding; bundle a small tile, not a generated shader.
6. Soft shadow: `0 18 40 rgba(0,0,0,0.35)`.

Use glass for: mini player, bottom tab bar, now-playing controls, sheets, pairing card, hero stats.
Use solid translucent surfaces for: long list rows, settings rows, search bar, secondary cards.
On low-end Android, use a static translucent gradient fallback for large surfaces; keep the native
blur for small chrome only. Measure before enabling blur everywhere.

### 5.4 Typography

- UI: **Manrope** (SIL OFL) — 400/500/600/700. Geometric, compact, close to the streaming-app
  language without copying a proprietary font.
- Numbers/timestamps: **Geist Mono** (SIL OFL) or tabular Manrope. Never use a proportional font for
  a running clock.
- Scale: display 34/38, title 28/32, section 20/24, track 16/20, body 14/20, caption 12/16,
  micro 10/14. Letter-spacing: -0.02em for display, 0.02em for uppercase labels.
- Bundle fonts locally; no runtime font network fetch.

### 5.5 Layout and navigation

- Phone-first; safe areas respected; 20px horizontal gutters; 8px base grid.
- Bottom tab bar, four destinations: **Home**, **Search**, **Library**, **Downloads**.
- Persistent mini player docked directly above the tab bar, 64px + progress hairline.
- Tabs use a glass bar with an active pill/indicator; no huge floating action button.
- Full Now Playing is a full-screen modal; swipe down to mini; swipe up or tap queue to open the
  queue sheet. Shared-element morph from mini artwork to full artwork via Reanimated.
- Settings via a gear/avatar in the Home header or Library header, not a fifth tab.
- Tablet: two-column library/now-playing layout, but phone is the priority. Do not ship a stretched
  phone UI.

### 5.6 Motion

- 180–260ms; spring damping 20–24, stiffness 180–240.
- Now Playing morph: artwork scale/position, background tint crossfade, controls stagger 40ms.
- Mini player progress is a thin accent line, not a full-width bright bar.
- Press states: scale 0.98 + haptic light; play/pause medium haptic; no haptic on scroll.
- Respect Reduce Motion; disable parallax/morph but keep opacity transitions.
- No autoplaying video, no gratuitous shimmer; skeletons only for real loading states.

### 5.7 Accessibility

- Contrast 4.5:1 for body text, 3:1 for large text and UI.
- 44×44pt minimum touch targets; 48dp Android.
- Dynamic Type up to 200% without clipping; allow two-line titles in lists.
- VoiceOver/TalkBack labels for artwork, progress, queue reorder, sync state.
- Color is never the only status indicator.
- Reduce Motion and Reduce Transparency honored (glass fallback to opaque surface).
- Screen reader order follows visual order; modals trap focus.

---

## 6. Screen specifications

### 6.1 Onboarding / pairing

- Page 1: “Your music. Your machine. Every screen.” + product promise, no fake metrics.
- Page 2: local-first privacy; what syncs and what does not.
- Page 3: “Pair with Audit on your PC” with QR scan / manual code / “Not now”.
- QR scanner requests camera permission only when opened; manual fallback always visible.
- Pairing success: device name, library count, “Sync library” CTA; ability to rename/revoke later.
- Empty/unpaired home must still allow local import and playback.

### 6.2 Home

Sections, in order:

1. Header: greeting (time-aware), sync status chip (`PC online`, `PC offline`, `Not paired`), settings.
2. “Jump back in” — horizontal recently played cards (large artwork, title, artist).
3. “On this phone” — downloaded/offline tracks or import CTA.
4. “From your PC” — recently downloaded tracks, horizontal cards; only when paired.
5. “Your playlists” — 2-column grid or horizontal cards.
6. “Made for your library” — genre/most played shortcuts, computed locally (no recommender service).
7. Empty state: import files or pair; no dead end.

### 6.3 Search

- Large glass search field, autofocus optional, 250ms debounce.
- Tabs/filters: Songs, Artists, Albums, Playlists, Videos.
- Recent searches persisted locally; clear all.
- Results use FTS; highlight matches without layout jump.
- Empty query: “Browse your library” genre/artist tiles, not a blank page.
- No results: suggest checking spelling or syncing the PC; no fake content.

### 6.4 Library

- Segmented control: Songs / Artists / Albums / Genres / Playlists / Videos.
- Songs: FlashList rows with artwork, title, artist, duration, source badge (`phone`/`PC`/`offline`),
  overflow menu (play next, add to queue, add to playlist, edit tags, download offline, remove local).
- Artists/Albums/Genres: grouped grid/list; drill-down with “Play all”, “Shuffle”.
- Sort: title, artist, album, duration, recently added, recently downloaded.
- Multi-select mode for queue/playlist/offline actions.
- Pull-to-refresh triggers sync when paired; otherwise rescans local imports.
- Long lists paginate from SQLite; no full-library JSON in memory.

### 6.5 Downloads

- Input: paste YouTube URL or search query; validate with the same host allowlist as desktop.
- Options sheet: format (MP3/M4A/FLAC/WAV/Opus/best), quality/bitrate, playlist toggle.
- “Send to PC” primary action; if unpaired, show a clear explanation and pairing CTA.
- Queue sections: Active, Waiting for PC, Completed, Failed.
- Progress: percentage, speed, ETA, current item/total for playlists; cancel/retry.
- Completed: “Available on PC” + “Save to phone” + “Play from PC” actions.
- PC offline: request stays queued locally with a timestamp; no fake progress.
- Background notifications only if permission granted and the user opted in.

### 6.6 Now Playing

- Full-bleed blurred artwork backdrop, darkened 70–80%; large artwork with subtle parallax.
- Title, artist, album; tappable artist/album to library views.
- Seek bar with elapsed/remaining; scrubbing haptic; waveform optional.
- Controls: shuffle, previous, play/pause (large glass circle with lime accent), next, repeat.
- Secondary row: queue, EQ, output/device, “available offline” state.
- Swipe down to mini; swipe up for queue; no accidental dismissal while scrubbing.
- If streaming from PC and it goes offline: paused state + reconnect CTA; local file fallback only if
  the exact track is cached.

### 6.7 Queue

- Bottom sheet; current track pinned; drag handles; remove; clear; “Save as playlist”.
- Show total duration; warn on clear.
- Reordering is local and immediate; no server dependency.

### 6.8 Playlists

- Grid/list with mosaic covers (1–4 artworks) and track counts.
- Detail: hero with gradient from cover, play/shuffle, overflow (rename/delete/export).
- Add tracks via search/multi-select; reorder; remove; empty state with “Add songs”.
- Sync with desktop: show a subtle “Synced”/“Pending” indicator, never a blocking spinner.

### 6.9 Settings

Sections:

- **Device & sync**: paired PC, last sync, sync now, revoke, “Pair a new PC”.
- **Playback**: audio quality for streaming, crossfade? (only if implemented), resume on headset.
- **Equalizer**: enable, presets, 10 bands, preamp, reset.
- **Appearance**: Liquid Glass preview, accent tint (limited), reduce transparency, theme engine
  (advanced, local JSON import later). No network themes.
- **Storage**: offline audio size, artwork cache, clear cache, manage downloads.
- **Notifications**: download complete, sync errors; OS settings link.
- **Updates**: current version, check, release notes, install/restart when ready.
- **About**: licenses, privacy, GitHub, “Audit is local-first”.

### 6.10 Theme engine

- Consume `AuditTheme` JSON (`schemaVersion: 1`) and map tokens to React Native styles:
  background, surface, surfaceStrong, text, muted, accent, border, fontFamily, radius, glass,
  waves, decor.
- Ship one preset: **Liquid Glass**. The engine must be able to load the existing desktop theme
  files (Default, Pixel, Retro 98, Vista Aero) without crashing, even if some decorators are mapped
  to approximations on mobile.
- No remote theme fetch. Import/export UI can be deferred; the token engine and validation must exist.
- Do not bake CSS class names into components; use a typed theme object/context.

### 6.11 Tag editor

- Edit title, artist, album, genre.
- Update local SQLite immediately; optimistic UI.
- If paired, enqueue a desktop tag-write request; desktop uses mutagen and returns the updated track.
- If unpaired, mark the edit as local-only and show “Will sync to PC when connected”.
- Do not claim embedded tags were rewritten on the phone unless a verified native writer exists.

### 6.12 Updates

- App Store/Play Store updates are controlled by the OS; in-app can show release notes.
- EAS Update (JS bundle) may check on launch; respect the user-controlled principle: show availability,
  ask before downloading/restarting, never force.
- Never use GitHub/Squirrel logic on mobile.
- Keep `version`, `runtimeVersion`, and update channel policy documented.

---

## 7. Desktop sync UI

Add a minimal, non-intrusive desktop surface:

- A “Mobile” card in settings/personalization or a dedicated modal.
- Toggle “Enable mobile sync”, port, device list, revoke.
- QR code + 6-digit code + host/port; countdown for expiry.
- Status: server running/stopped, last device connection, protocol version.
- Copyable manual connection details for networks where QR/camera is inconvenient.
- Clear warning: LAN only in v1; do not expose the port to the internet.

Do not redesign the desktop app. Match existing glass/theme classes and Lucide icons.
Do not break the mini player’s `localStorage` theme snapshot.

---

## 8. Implementation plan

Work in stacked PRs; one v1 release at the end.

### Phase 0 — Discovery and spikes (1–3 days)

- Confirm Expo SDK/EAS versions and New Architecture compatibility.
- Audio engine spike (see 4.3) on a real Android device and an iOS device/TestFlight build.
- Blur performance test on a mid-range Android device; decide blur budget.
- Validate LAN pairing/HTTP/WebSocket from Expo on both platforms.
- Write `docs/mobile/PLAN.md` with risks, decisions, device matrix.

**Done when:** engine decision + a minimal playback/background/EQ proof exists, or a blocker is
documented with a concrete alternative.

### Phase 1 — Design system and shell

- Tokens, fonts, GlassSurface, buttons, pills, rows, artwork, empty states, sync badge.
- Expo Router tabs + mini player + Now Playing modal skeleton with real navigation.
- Light/dark: dark only, but tokens structured.
- Screenshots for Home, Library, Now Playing, Downloads, Pairing.

**Done when:** all primary screens render with real sample data and no placeholder copy.

### Phase 2 — Local database and import

- Drizzle schema/migrations, FTS, import via document picker/share sheet, artwork extraction.
- Library lists, search, sort, grouping, stats.
- Playlists CRUD and ordering.
- Unit tests for queries and merge logic.

**Done when:** 1,000 imported tracks scroll at 60fps and search responds under 150ms.

### Phase 3 — Playback

- Engine integration, queue, shuffle/repeat, seek, volume, background, lock screen, interruptions.
- Mini player + full Now Playing + queue sheet.
- Persistence/restore of queue and position.
- Device tests: Bluetooth, headset, calls, screen lock, 30-minute background.

**Done when:** playback survives all device tests with no double audio and no stuck state.

### Phase 4 — Desktop pairing and sync

- Desktop sync server + DB migration + QR modal.
- Mobile pairing, token storage, reconnect, revoke.
- Incremental track/playlist sync, artwork cache, range streaming, offline copies.
- Download request queue and progress events.
- Contract tests and a scripted two-device demo.

**Done when:** a phone pairs in under 60 seconds and syncs 1,000 tracks without blocking the UI.

### Phase 5 — Downloads, EQ, themes, tags, video

- Download UI/options/progress/queue/errors, PC-offline behavior.
- EQ (per engine decision), presets, persistence.
- Theme engine + Liquid Glass preset; theme preview.
- Tag editor + desktop tag-write sync.
- Video player; keep audio session rules explicit.

**Done when:** all release-gate features work on both platforms, including offline states.

### Phase 6 — Polish, accessibility, performance

- Reduce Motion/Transparency, Dynamic Type, VoiceOver/TalkBack pass.
- Blur budget, image cache, list virtualization, cold start, memory.
- Empty/loading/error states for every screen.
- Haptics, keyboard avoidance, safe areas, small-screen checks.

### Phase 7 — Release

- EAS build profiles, icons, splash, notification icon, store metadata.
- Privacy policy, support URL, age rating, content rights statement.
- TestFlight/internal testing, crash-free session check, store screenshots.
- Version 1.0.0; changelog; rollback plan.

---

## 9. QA and release gates

### Device matrix

- iPhone SE (small screen), iPhone 15/16 class, iPad (layout smoke).
- Pixel 6a/8 class, a mid-range Android (blur/performance), Android tablet smoke.
- iOS and Android minimums supported by the chosen Expo SDK; document exact versions.

### Functional tests

- Pair via QR and manual code; wrong/expired code; revoke; reconnect after restart.
- Sync from empty, 1 track, 1,000 tracks, deleted files, renamed metadata, artwork changes.
- Download: valid URL, invalid host, playlist, cancel, retry, PC offline, PC reconnect.
- Offline playback, stream playback, connection drop, resume.
- Queue reorder/clear/save; playlist create/rename/delete/reorder.
- EQ presets/custom/persist; theme switch; tag edit + sync.
- Background audio, lock screen, Bluetooth, headset, call interruption, audio focus.
- Update available/ready/later/restart (where applicable).
- App killed/reopened: state restored, no duplicate queue entries.

### Non-functional gates

- Cold start < 2.5s on a mid-range Android; no blank screen.
- Scrolling 1,000 tracks at 60fps; no JS frame drops over 16ms in normal scroll.
- No more than two blurred layers per screen; measure on low-end Android.
- Memory stable during 30-minute playback and library scroll.
- No unhandled promise rejections; no silent catch that hides sync corruption.
- All network calls have timeout, retry/backoff and user-visible error states.
- Tokens only in SecureStore; no tokens/paths in logs; no path traversal.
- App works with airplane mode and no paired desktop.

### Release gate

A release candidate is not shippable unless:

1. Every “Yes” row in the scope matrix is verified on both platforms.
2. `npm run verify` is green in the desktop project.
3. Mobile typecheck, lint, unit tests and the Maestro/Detox smoke suite are green.
4. The pairing + sync + download + offline playback demo works from a clean install.
5. Privacy policy, store assets, screenshots and support links are ready.
6. The app has no “coming soon” dead ends in primary navigation.

---

## 10. Guardrails for the agent

- **Do not** add a cloud backend, login, analytics SDK, ads, or a recommender.
- **Do not** use yt-dlp/FFmpeg on the phone or bundle those binaries.
- **Do not** scrape YouTube directly from the mobile app.
- **Do not** ship Spotify fonts, logo, green, screenshots, or copied layouts.
- **Do not** vendor Poweramp/AutoEq/`.milk` assets; use open-licensed data only.
- **Do not** expose absolute paths or arbitrary file reads from the desktop server.
- **Do not** change desktop theme behavior or the mini-player snapshot contract.
- **Do not** change the desktop SQLite schema without a versioned migration, a pre-migration backup
  (follow `backupBeforeMigration` in `db.ts`), and tests for upgrade from v2.
- **Do not** break `npm run verify`; run it after desktop changes.
- **Do not** commit secrets, pairing tokens, certificates, or test audio with copyright issues.
- **Do not** mark a feature done because the UI exists; verify the native behavior.
- **Do not** hide unresolved platform limitations; document them in `docs/mobile/KNOWN_LIMITATIONS.md`.

When blocked, choose the default below and record the decision; only ask the user if the choice
changes the product contract or store eligibility.

### Defaults for open decisions

| Decision | Default |
|---|---|
| Expo app location | `mobile/` in this repo, separate lockfile |
| Navigation | Expo Router, four tabs + mini player + full-player modal |
| Local DB | expo-sqlite + Drizzle, FTS5 |
| Audio | Spike; prefer TrackPlayer + native EQ if it passes, otherwise Audio API + native bridge |
| Sync transport | LAN HTTP + bearer token + WebSocket, QR pairing; TLS/remote later |
| Sync merge | Last-write-wins by `updatedAt`, device id tiebreak; tombstones |
| Offline files | Explicit “Available offline”; no automatic full-library download |
| Theme | Liquid Glass only shipped; token engine compatible with `AuditTheme` |
| Accent | Audit Lime `#B8FF3C`; artwork tint secondary |
| Language | English + Italian, no hardcoded strings |
| Light mode | Not in v1 |
| Video | Local/synced playback; do not mix with audio session |
| Update | Store + EAS Update, user-visible and consent-based |
| Tag writing | Local DB now, desktop mutagen later; no false claims |
| Telemetry | None by default |

---

## 11. Deliverables

Code:

- `mobile/` Expo app, running on iOS and Android, with the full v1 scope.
- Desktop `src/main/mobile-sync/` server + settings UI + migration, feature-flagged.
- Shared protocol/types package or duplicated typed contract with a single source of truth.

Documentation:

- `docs/mobile/PLAN.md` — scope, phases, decisions, risks.
- `docs/mobile/AUDIO_ENGINE.md` — spike evidence and final engine.
- `docs/mobile/SYNC_PROTOCOL.md` — authoritative API/event contract.
- `docs/mobile/DESIGN.md` — tokens, glass recipe, component specs, screenshots.
- `docs/mobile/KNOWN_LIMITATIONS.md` — honest platform limits.
- `docs/mobile/RELEASE.md` — EAS/store checklist, versioning, rollback.
- `mobile/README.md` — setup, run, test, build, pair.

Evidence:

- Screenshots of all primary screens on iPhone and Android.
- A two-device demo script: pair → sync → download → offline → play → EQ → theme.
- Test output and a short performance report.

---

## 12. Appendix — acceptance demo script

The agent must be able to run this end to end:

1. Fresh install on a phone; skip pairing; import 3 local audio files; play one; background the app;
   verify lock-screen controls; return; queue a second track.
2. Pair with desktop using QR; grant only necessary permissions; see library count.
3. Sync 1,000 tracks; open Library; search an artist; play a streamed track; seek; queue another.
4. Mark a track “Available offline”; wait for transfer; enable airplane mode; play it; verify artwork.
5. Paste a YouTube URL; choose MP3/320; send to PC; observe progress; cancel one job; retry; complete.
6. Disconnect the PC; verify “PC offline” and local playback; reconnect and sync incrementally.
7. Create a playlist on the phone; add tracks; reorder; sync; verify on desktop; rename on desktop;
   sync back; no duplicates.
8. Switch to Liquid Glass; inspect mini player and Now Playing; toggle Reduce Transparency; verify
   fallback and contrast.
9. Open EQ; select a preset; customize a band; kill the app; reopen; verify persistence and audio.
10. Edit metadata on the phone; sync; verify desktop tag write; verify artwork and list update.

If any step needs a workaround, document it in `KNOWN_LIMITATIONS.md` and fix it before calling v1 done.
