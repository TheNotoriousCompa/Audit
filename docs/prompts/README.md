# Audit — Parallel Agent Briefs

These are self-contained briefs for agents working in parallel on the next product phase.

| Brief | Use it for | Workspace |
|---|---|---|
| [`AUDIT_ANDROID_RN_AGENT.md`](./AUDIT_ANDROID_RN_AGENT.md) | **Chosen build.** Expo/React Native UI + local Kotlin Expo module for yt-dlp downloads, SAF scanning, tags/covers, playback/EQ; real liquid glass | New `feat/android-rn` branch/worktree from `dev`, app in `mobile/` |
| [`AUDIT_ANDROID_V2_AGENT.md`](./AUDIT_ANDROID_V2_AGENT.md) | Native Compose alternative only. Do **not** combine it with the RN brief | New `feat/android-v2` branch/worktree |
| [`AUDIT_SHOWCASE_WEB_AGENT.md`](./AUDIT_SHOWCASE_WEB_AGENT.md) | Public Next.js showcase/marketing site for desktop + Android | **Separate repository**, e.g. `audit-site` |

> The old Expo + desktop-sync brief was removed intentionally.
> The product is **standalone**: no pairing, no LAN server, no cloud, no desktop dependency.

## Copy-paste starter — chosen RN build

```text
Read docs/prompts/AUDIT_ANDROID_RN_AGENT.md end to end, then read the repository files it lists.
Work autonomously in a new feat/android-rn worktree. Do not reuse the old Expo/sync attempt or the
pure-Compose brief. Build an Expo/React Native app with a local Kotlin Expo module (modules/audit-core)
for yt-dlp + FFmpeg downloads, SAF scanning, tag/covers and playback/EQ. Use @uginy/react-native-liquid-glass.
Start with Phase 0 and prove the four spikes on a real Android device before building the full UI.
Implement the entire v1 scope, run the release-gate demo, and report evidence. Do not stop at scaffolding.
```

## Copy-paste starter — website

```text
Read docs/prompts/AUDIT_SHOWCASE_WEB_AGENT.md end to end. Build the separate Next.js showcase site
in its own repository. Collect real screenshots and release data first; keep Android in “coming soon”
state until APK/F-Droid links exist. Do not build a web player or downloader. Ship a production build
and run the acceptance checklist.
```

## Recommended order

1. Run the RN/Android brief first. It defines the real constraints and the release risks.
2. Run the website brief in parallel, but keep Android in “coming soon” state until the APK/F-Droid
   build exists.
3. Do not publish an Android build, store listing, or public “available now” claim until the release
   gate in the RN brief is met.

## Before handing a brief to an agent

- Give it the repository URL and tell it to read the files listed in the brief.
- Tell it to work in a dedicated branch/worktree and not to touch unrelated desktop behavior.
- Require a short plan and a risk list before implementation.
- Require evidence: lint/tests, real-device screenshots, and the end-to-end demo script.
- For the RN brief, resolve the license strategy and the four Phase 0 spikes before the UI.

## Non-negotiable product rules

- Standalone Android app: no desktop pairing, no LAN server, no accounts, no cloud library.
- Downloads run on the phone through yt-dlp; no PC/desktop dependency.
- Real folder scanning via SAF; no “import one file at a time” UX.
- Real liquid glass with live backdrop blur/refraction; no translucent-card fake glass.
- Covers visible everywhere; context-menu “Find cover” is a first-class action.
- No Spotify/Poweramp/Seal assets, fonts, code, or branding. Architecture/behavior inspiration only.
- Resolve the GPL/license strategy before shipping the download engine.
- Desktop `npm run verify` stays green; do not modify desktop for this release.

## Current baseline

- Desktop release: **v1.5.1** (`7844247`)
- Desktop stack: Electron 28, Next.js 15.5, React 19, Tailwind 4, SQLite, bundled Python/FFmpeg.
- Desktop docs: `DESIGN.md`, `docs/PLAYER.md`, `docs/UPDATES.md`.
- Theme samples: `themes/*.audit-theme.json`.
- Android design target: **Liquid Glass, simple like Airbnb/Spotify**; genuine backdrop blur/refraction.
