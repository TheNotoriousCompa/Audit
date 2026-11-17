# Audit Showcase Website — Build Brief for a Parallel Agent

> **How to use this document:** give this entire file to the agent. This is a **separate project**
> from the desktop repository. It is a public showcase/marketing site for Audit, not a web player.
> Build it in its own repository, e.g. `TheNotoriousCompa/audit-site`, or in a separate `website/`
> repository if the user prefers. Do not add the website to the Electron build.

---

## 1. Mission

Build a launch-ready public website for **Audit**, the local-first YouTube-to-MP3 downloader and
music player for Windows, and its upcoming **standalone Android app**.

The site must:

- explain the product in under 30 seconds;
- make the download action obvious and trustworthy;
- showcase the desktop app and the Liquid Glass Android design with real screenshots;
- explain local-first privacy, the theme system, autonomous Android downloads and folder scanning;
- be fast, accessible, responsive and easy to update for releases;
- look like a premium audio product, not a generic SaaS template.

The website is **not** a web version of Audit. Do not build a player, upload flow, account system, or
YouTube downloader on the web.

---

## 2. Product context

### Audit Desktop

- Current release at the time of this brief: **v1.5.1**
- Windows installer: `AuditSetup.exe` via GitHub Releases; portable ZIP also available.
- Installer is unsigned today, so SmartScreen may warn. The site must state this honestly.
- Stack: Electron, Next.js renderer, React, Tailwind, bundled Python 3.13 + yt-dlp + FFmpeg.
- Core promise: **local-first**. Downloads and library stay on the user’s machine; no account,
  no cloud music locker, no upload of the library.

Features to present:

1. **Downloader** — YouTube URL or search, MP3/M4A/FLAC/WAV/Opus/best, up to 320 kbps,
   playlists, embedded cover art and metadata, progress/cancel.
2. **Library** — multiple folders, fast search, artists/albums/genres/recent/videos, artwork,
   SQLite-backed cache.
3. **Player** — queue, shuffle, repeat, seek, background mini player, visualizer, 10-band EQ,
   playlists, tag editor, video playback.
4. **Themes** — offline JSON themes: Default, Pixel, Retro 98, Vista Aero, custom wallpaper,
   import/export. No theme network fetch.
5. **User-controlled updates** — background availability check, visible notification, no download
   until the user chooses, no install until “Restart and install”.
6. **Android (coming)** — standalone Android app, real Liquid Glass UI, local playback, EQ,
   playlists, autonomous yt-dlp downloads and SAF folder scanning. No PC, no pairing, no account.

### Audit Android v1 (for launch messaging)

- Android only; no iOS promise for this release.
- Standalone: downloads run on the phone via yt-dlp; no desktop, no LAN server, no pairing.
- Scan a phone music folder with SAF; covers and metadata appear in the library automatically.
- Local playback, background audio, EQ, playlists, tag editor, cover lookup from the context menu.
- No cloud account, no hosted backend, no upload of the music library.
- Liquid Glass design, Spotify/Airbnb-like structure but original branding.
- Distribution may be GitHub/F-Droid first; Google Play is not guaranteed because of direct-download
  policy. Do not announce a release date or store link unless the user provides one. Use
  “Coming soon” / “In development” until an APK/F-Droid link exists.

### Brand facts

- Logo asset: `Public/AUDIT.png` in the desktop repo (white A + waveform on black rounded square).
- The wordmark is “Audit”.
- Desktop default look is dark and monochrome with a user-selectable accent; Android v1 uses
  **Audit Lime `#B8FF3C`** as its signature accent.
- Do not use Spotify’s logo, wordmark, proprietary fonts, exact green `#1ED760`, screenshots, or
  any implication of affiliation with Spotify or YouTube.

---

## 3. Repository and stack

Separate repository. Suggested name: `audit-site`.

- **Next.js** latest stable App Router, TypeScript strict.
- **Tailwind CSS 4** with a small design-token layer; no giant component library.
- **next/font** for local fonts (Manrope + Geist Mono, SIL OFL) — verify licenses and bundle them.
- **Framer Motion** for restrained scroll/reveal and hero motion; CSS for simple transitions.
- **lucide-react** icons.
- **MDX** for changelog/docs/FAQ if useful; otherwise typed content in `/content`.
- Deploy to **Vercel** (preferred) or static export if the user chooses GitHub Pages.
- No backend, no database, no auth. A build-time GitHub API fetch for latest release is allowed,
  with a static fallback committed to the repo.
- No analytics by default. If analytics is requested, use a privacy-friendly, cookie-free option and
  document it.
- Environment variables:
  - `NEXT_PUBLIC_SITE_URL`
  - `NEXT_PUBLIC_GITHUB_REPO=TheNotoriousCompa/Audit`
  - optional `GITHUB_TOKEN` only at build time, never exposed to the client.

---

## 4. Visual direction — “Liquid Glass, editorial”

The site should feel like the product: dark, immersive, tactile, album-art-first. It shares the
mobile design language but is **editorial**, not an app screen stretched to desktop.

Keywords: **nocturnal, premium, tactile, quiet, precise, local-first**.

### 4.1 Palette

```css
--bg: #050607;
--bg-elevated: #0b0e11;
--surface: rgba(20, 24, 29, 0.72);
--surface-strong: rgba(10, 13, 16, 0.88);
--text: #f5f7f8;
--muted: #9aa5ad;
--muted-strong: #c2c9ce;
--accent: #b8ff3c;
--accent-ink: #0a0d07;
--danger: #ff6b6b;
```

Use near-black, not pure black, for large fields. Album art and product screenshots provide color.
Accent is functional (CTA, active tab, small highlights), not decorative everywhere.

### 4.2 Glass recipe for the web

- `backdrop-filter: blur(24–48px) saturate(140%)` plus a translucent gradient;
- 1px top/left white highlight, 1px bottom/right dark border;
- very subtle noise overlay (2–3% opacity) to avoid banding;
- soft shadow `0 24px 80px rgba(0,0,0,0.45)`;
- fallback for browsers without backdrop-filter: opaque elevated surface, never unreadable text.

Do not stack glass on glass across the whole page. Use it for the hero device frame, feature cards,
nav, and selected panels. Editorial sections can be flat dark with strong typography.

### 4.3 Typography

- Display: Manrope 600/700, tight tracking (`-0.03em`), large sizes (clamp 48–112px).
- Body: Manrope 400/500, 16–19px, generous line height.
- Eyebrow labels: 11–12px uppercase, letter-spacing 0.14em, muted.
- Numerals/timestamps: Geist Mono or tabular Manrope.
- No Spotify font, no Inter-by-default look; Manrope gives a distinct geometric voice.
- Local fonts only; no Google Fonts runtime request.

### 4.4 Layout

- Max content width 1200–1280px; 24px mobile gutters, 40–64px desktop.
- Generous vertical rhythm; editorial sections alternate copy and product visuals.
- Hero: asymmetric two-column on desktop; stacked on mobile. Left: wordmark, headline, subcopy,
  CTAs, small trust line. Right: layered glass device mockup with real app screenshot(s).
- Sticky top nav: glass, thin, with logo, Features, Themes, Android, Download, GitHub.
- Persistent bottom CTA on mobile? Avoid intrusive bars; use a single sticky “Download” only on the
  download page if needed.
- Footer: product, resources, legal, GitHub, release version, “Made for local music”.
- No generic three-card row repeated for every section; vary composition.

### 4.5 Motion

- Hero: slow ambient gradient drift and album-art parallax; no autoplay video.
- Scroll reveals: opacity + 12–20px translate, 400–600ms, once.
- Device mockup: subtle tilt on pointer (desktop only), disabled on touch/reduced motion.
- Page transitions: fade only, fast.
- Respect `prefers-reduced-motion`; never hide content behind motion.
- No heavy WebGL/Three.js unless it materially improves the hero and passes performance budgets.

### 4.6 Imagery

- Use real screenshots of the desktop app and Android app. Do not fabricate UI in HTML that looks
  like a screenshot unless it is clearly a stylized illustration.
- Until final Android screenshots exist, use a labeled placeholder frame or a design mock clearly
  marked “Preview”; do not present it as shipped.
- Use the actual `AUDIT.png` logo. Do not recolor it into a Spotify-like mark.
- Theme gallery images: Default, Pixel, Retro 98, Vista Aero; use real captures.
- Optimize with `next/image`, AVIF/WebP, width/height set, lazy loading below the fold.
- Alt text describes the screen, not “image”.

---

## 5. Information architecture

### Routes

```text
/                     Home / product showcase
/features             Detailed feature breakdown (optional if home is enough)
/themes               Theme gallery + offline theme format
/android              Standalone Android preview, downloads, folder scanning, glass
/download             Windows installer, portable ZIP, requirements, SmartScreen note
/changelog            Releases, grouped by version
/docs                 Getting started, FAQ, troubleshooting (MDX)
/privacy              Privacy policy
/terms                Terms / acceptable use (if needed)
/404                  Custom not-found
```

Keep the nav to 5–6 items max. Do not create empty pages.

### 5.1 Home

Suggested copy (refine, don’t inflate):

- Eyebrow: `LOCAL-FIRST MUSIC`
- H1: **“Your music. Your machine. Every screen.”**
- Sub: “Audit downloads from YouTube, keeps your library on your PC, and plays it beautifully.
  No account. No cloud locker. No surprises.”
- Primary CTA: **Download for Windows**
- Secondary CTA: **See the Android app** (links to `/android`)
- Trust line: “Free · Local-first · v1.5.1 · Windows 10/11”

Sections:

1. **Hero** — product promise + glass device mockup (desktop app + phone).
2. **Downloader** — “Paste a link. Keep the music.” Show format/quality/playlist/progress UI;
   mention embedded art/metadata.
3. **Library that stays yours** — multi-folder scan, search, genres/artists/albums, no upload.
4. **A player, not a webpage** — queue, shuffle, repeat, mini player, 10-band EQ, tag editor.
5. **Themes that change the room** — horizontal gallery with 4 real screenshots; link to `/themes`.
6. **Android, without the cloud** — standalone phone app; autonomous yt-dlp downloads; SAF folder
   scanning; real liquid glass; “your files stay on your phone”.
7. **Privacy by architecture** — three concrete claims, not vague “we care” copy:
   local files, no account, no telemetry by default.
8. **User-controlled updates** — check, notify, download only on consent, install only on action.
9. **Final CTA** — download + Android preview + GitHub.

Avoid fake testimonials, fake user counts, fake “trusted by” logos, and invented awards.

### 5.2 `/themes`

- Hero: “A player that fits the room.”
- Gallery: Default, Pixel, Retro 98, Vista Aero, plus a custom wallpaper example.
- Each card: real screenshot, short description, tokens used (accent, radius, decor).
- Explain the offline JSON format at a high level: `schemaVersion`, `tokens`, `decor`, optional
  embedded wallpaper; no remote theme fetch.
- CTA: “Open the theme folder” instructions / “Import a theme” from the desktop app.
- Do not publish theme files that contain unlicensed wallpapers. The Vista Aero sample uses a
  supplied wallpaper; verify rights before redistributing it from the public site. If unclear,
  show the UI with a neutral background and mention the wallpaper is user-supplied.

### 5.3 `/android` (keep `/mobile` as a redirect or alias only if needed)

- Positioning: “Your music. On your phone. Still yours.”
- Hero mockup: Now Playing + Library + Folders screens, real liquid glass treatment.
- Feature grid: autonomous yt-dlp downloads, SAF folder scanning, covers/metadata, local playback,
  background audio, EQ, playlists, tag editor, context-menu cover lookup.
- **No sync diagram.** Explain v1 honestly:
  - the app is standalone; it does not connect to Audit Desktop;
  - downloads run on the phone; a PC is not required;
  - the user picks a music folder and the app scans it recursively, including covers;
  - no cloud account, no server, no upload of the library;
  - Android APK/F-Droid/GitHub links appear when available; Google Play is not guaranteed.
- “Coming soon” state: disabled download/store badges, optional “Notify me” link only if a real list
  exists. Do not use a fake email form with no backend.
- FAQ: Does it work without a PC? (yes); Does it upload my music? (no); Can it scan my whole music
  folder? (yes, via Android SAF); Does it download directly? (yes, via yt-dlp on the phone);
  Which formats? (same family as desktop, subject to Android/FFmpeg support).

### 5.4 `/download`

- Windows 10/11 x64, installer size, version, release date.
- Primary: `AuditSetup.exe` from the latest GitHub release.
- Secondary: portable ZIP, with “does not self-update” note.
- SmartScreen warning: honest, concise explanation; link to checksum/release page.
- System requirements: Windows 10/11, disk space, no separate Python/FFmpeg install.
- “What happens on first launch” short steps.
- Link to release notes and GitHub.
- macOS/Linux: only mention if actually supported and tested; do not imply parity.

### 5.5 `/changelog`

- Fetch the latest releases at build time from GitHub (optional), with a checked-in fallback.
- Group by version; show date, highlights, fixes, breaking changes, asset links.
- Never invent release notes. If the API fails, show the fallback and a GitHub link.
- Anchor links per version; RSS optional.

### 5.6 `/docs` and FAQ

- Install, first download, library folders, themes, updates, troubleshooting (SmartScreen, FFmpeg,
  no audio), Android folder scanning and downloads (when available), privacy.
- Keep answers short and task-oriented; link to the desktop docs.
- Search is optional; do not add a heavy docs framework for six pages.

### 5.7 `/privacy`

- Plain-language policy: what is processed locally, what network calls exist (YouTube via yt-dlp,
  GitHub update check, Android direct downloads/optional cover lookup), what is not collected.
- No account, no analytics by default, no sale of data.
- Contact method (GitHub issues or a real email).
- This is a product policy, not legal advice; mark placeholders for the user to review.

---

## 6. Content rules

- Every claim must be true for the current release. If mobile is not released, say “coming soon”.
- Do not say “open source” unless the license and repository are public and the claim is accurate.
- Do not say “no telemetry” if any analytics/crash reporting is added; update the copy.
- Do not imply YouTube endorsement or affiliation. Use “YouTube” only descriptively.
- Do not promise “unlimited” or “320 kbps for every video”; quality depends on the source.
- Do not show a macOS/Linux download if those builds are not published.
- Keep the SmartScreen warning visible near the Windows CTA; trust is a feature.
- All dates/versions must come from a single content source (`content/release.ts` or MDX frontmatter).

---

## 7. Performance, SEO and accessibility

### Performance budgets

- Lighthouse Performance ≥ 95 on desktop and mobile (lab).
- LCP < 2.0s on a mid-range mobile profile; CLS < 0.05; INP < 200ms.
- Initial JS reasonable for a marketing site; lazy-load below-the-fold interactive pieces.
- Images optimized, sized, and lazy; no giant PNG screenshots.
- Fonts subset and preloaded; no layout shift.
- No third-party scripts unless required; if added, load after interaction/consent.

### SEO

- Per-page title, description, canonical, Open Graph and Twitter cards.
- OG image generated from the hero design (static file is fine).
- `sitemap.xml`, `robots.txt`, JSON-LD `SoftwareApplication` for Audit Desktop.
- Semantic headings, one H1 per page, descriptive link text.
- Clean URLs and 301s if routes change.

### Accessibility

- WCAG 2.2 AA target: contrast, focus states, keyboard navigation, landmarks.
- Glass surfaces must keep text contrast; test over artwork and gradients.
- Reduced motion honored; no content only on hover.
- Alt text for screenshots; decorative images empty alt.
- Mobile nav keyboard/touch accessible; skip link.
- Real buttons/links, not divs with click handlers.

---

## 8. Implementation plan

### Phase 0 — Content and assets

- Confirm current version, release URL, installer size, supported OS.
- Collect real desktop screenshots (Default, Pixel, Retro 98, Vista Aero, player, library, downloader).
- Collect Android design frames; label as preview until shipped.
- Write the final copy in `content/` with a single source of truth for release data.
- Confirm wallpaper licensing for public theme screenshots.

### Phase 1 — Design system and shell

- Tokens, fonts, nav, footer, buttons, glass surfaces, section primitives.
- Responsive layout and reduced-motion behavior.
- Home hero + one feature section as a vertical slice.

### Phase 2 — Pages

- Home, Themes, Android, Download, Changelog, Docs/FAQ, Privacy, 404.
- Real links to GitHub releases; external link handling.
- Mobile “coming soon” states.

### Phase 3 — Polish and launch

- SEO/OG, sitemap/robots, JSON-LD.
- Lighthouse/axe/Playwright checks, responsive screenshots.
- Deploy preview, then production; custom domain if provided.
- Release checklist and rollback instructions.

---

## 9. Acceptance criteria

- A first-time visitor understands what Audit does and how to download it within one screen.
- The Windows download CTA points to the actual latest release asset; portable ZIP is clearly
  distinguished; SmartScreen is explained.
- Android is presented as upcoming unless store links exist; download buttons are not fake.
- All screenshots are real or clearly labeled previews; no invented UI.
- The site looks intentional at 360px, 768px, 1024px and 1440px; no horizontal scroll.
- Lighthouse ≥ 95 performance/accessibility/best-practices/SEO in a production build.
- No console errors, no broken links, no layout shift from fonts/images.
- Reduced motion works; keyboard navigation and focus states are visible.
- No Spotify/YouTube branding misuse; no copied assets.
- Privacy copy matches actual network behavior.

---

## 10. Guardrails

- Do not build a web downloader or player.
- Do not copy Spotify’s site, brand, green, fonts, or assets.
- Do not use fake metrics, testimonials, awards, or “featured in” logos.
- Do not ship a newsletter form without a real backend; use GitHub Discussions/issues if needed.
- Do not add analytics, chat widgets, or cookie banners unless actually required.
- Do not hotlink images from the app repo; copy optimized assets into the site.
- Do not publish unlicensed wallpapers or theme files.
- Do not claim macOS/Linux support unless builds exist.
- Keep release data in one typed module; no version strings scattered in JSX.

---

## 11. Deliverables

- A deployable Next.js site in its own repository.
- `content/release.ts` (or MDX) as the single source of truth for version/date/assets.
- Design tokens and reusable section components.
- Real screenshots in `public/` with optimized sizes and alt text.
- `README.md` with local dev, build, deploy, and content update instructions.
- `docs/LAUNCH_CHECKLIST.md` with links, SEO, accessibility, performance and legal checks.
- A short handoff note listing any placeholders that must be replaced before launch.

---

## 12. Suggested hero composition

Desktop (≥ 1024px):

```text
┌──────────────────────────────────────────────────────────────┐
│  [A] Audit        Features  Themes  Android  Download  GitHub  │
│                                                              │
│  LOCAL-FIRST MUSIC                    ┌───────────────────┐  │
│  Your music.                         │  glass desktop    │  │
│  Your machine.                       │  app screenshot   │  │
│  Every screen.                       │  + phone mockup   │  │
│                                      │  layered, tilted  │  │
│  Audit downloads from YouTube,       └───────────────────┘  │
│  keeps your library on your PC,                             │
│  and plays it beautifully.                                  │
│                                                              │
│  [ Download for Windows ]  [ Meet Audit Android → ]           │
│  Free · Local-first · v1.5.1 · Windows 10/11                 │
└──────────────────────────────────────────────────────────────┘
```

Mobile (< 768px): headline first, CTAs stacked full-width, one device mockup, then content sections.
No hamburger-only navigation that hides the download CTA on the home page; keep a visible link.
