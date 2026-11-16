# Audit — Parallel Agent Briefs

These are self-contained briefs for agents working in parallel on the next product phase.

| Brief | Use it for | Workspace |
|---|---|---|
| [`AUDIT_MOBILE_V1_AGENT.md`](./AUDIT_MOBILE_V1_AGENT.md) | Expo/React Native app for iOS + Android, local-first playback, EQ, themes, desktop pairing/sync, download delegation | New `feat/mobile-v1` branch/worktree from `dev`, app in `mobile/` |
| [`AUDIT_SHOWCASE_WEB_AGENT.md`](./AUDIT_SHOWCASE_WEB_AGENT.md) | Public Next.js showcase/marketing site for desktop + mobile | **Separate repository**, e.g. `audit-site` |

## Copy-paste starter

For the mobile agent:

```text
Read docs/prompts/AUDIT_MOBILE_V1_AGENT.md end to end, then read the repository files it lists.
Work autonomously in a dedicated feat/mobile-v1 worktree. Start with Phase 0 and write
docs/mobile/PLAN.md and docs/mobile/AUDIO_ENGINE.md before building the full player. Implement the
entire v1 scope, run the release-gate demo, and report evidence. Do not stop at scaffolding.
```

For the website agent:

```text
Read docs/prompts/AUDIT_SHOWCASE_WEB_AGENT.md end to end. Build the separate Next.js showcase site
in its own repository. Collect real screenshots and release data first; keep mobile in “coming soon”
state until store links exist. Do not build a web player or downloader. Ship a production build and
run the acceptance checklist.
```

## Recommended order

1. Run the mobile brief first. It defines the sync contract and the real mobile constraints.
2. Run the website brief in parallel, but keep the mobile page in “coming soon” state until store
   links and final screenshots exist.
3. Do not publish a mobile build, store listing, or public “available now” claim until the release
   gate in the mobile brief is met.

## Before handing a brief to an agent

- Give it the repository URL and tell it to read the files listed in the brief.
- Tell it to work in a dedicated branch/worktree and not to touch unrelated desktop behavior.
- Require a short plan and a risk list before implementation.
- Require evidence: typecheck/lint/tests, device screenshots, and the end-to-end demo script.
- For the mobile brief, resolve the audio-engine spike before building the full player UI.

## Non-negotiable product rules

- Local-first: no accounts, no cloud library, no upload of user music.
- Downloads are desktop-owned in v1; the phone never bundles yt-dlp/FFmpeg.
- User consent for downloads and updates; no silent install.
- Themes remain offline; no remote theme fetching.
- No Spotify/Poweramp assets, fonts, code, or branding. Inspiration only.
- Desktop `npm run verify` stays green.

## Current baseline

- Desktop release: **v1.5.1** (`7844247`)
- Desktop stack: Electron 28, Next.js 15.5, React 19, Tailwind 4, SQLite, bundled Python/FFmpeg.
- Desktop docs: `DESIGN.md`, `docs/PLAYER.md`, `docs/UPDATES.md`.
- Theme samples: `themes/*.audit-theme.json`.
- Mobile design target: **Liquid Glass / After Dark**, Spotify-like structure, original Audit identity.
