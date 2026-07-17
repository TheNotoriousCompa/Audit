# Audit - YouTube to MP3 Converter

## Project Overview

Audit is an Electron-based desktop application that allows users to download and convert YouTube videos to high-quality MP3/Media files. It features a modern, transparent UI built with Next.js and a powerful backend powered by Python and `yt-dlp`.

## Technology Stack

- **Frontend:** Next.js 15.5, React 19, Tailwind CSS, Lucide Icons.
- **Desktop Framework:** Electron 28.
- **Backend:** Python 3.13 (Bundled Runtime).
- **Core Engine:** `yt-dlp` (with automatic updates).
- **Media Processing:** FFmpeg (Bundled).
- **Distributable Maker:** Electron Forge with Squirrel.Windows.

## Recent Architectural Fixes (v1.2.12)

- **IPC Stability:** Fixed a critical hang in the Python backend where it waited for `stdin` input in production instead of reading CLI arguments.
- **Resource Pathing:** Implemented robust path resolution using `app.getAppPath()` to ensure icons and renderer files are found inside the `.asar` package.
- **Binary Bundling:** Standardized the inclusion of `python-runtime` and `ffmpeg` in the `resources` directory of the packaged app.
- **Auto-Update (Engine):** Implemented a preemptive `yt-dlp` update check at the start of every download to bypass YouTube's 403 Forbidden errors.

## Update System (Squirrel)

- **Status:** Integrated into the build system.
- **Mechanics:** Generates `.nupkg` delta packages via Squirrel.Windows.
- **Configuration:** Currently the `autoUpdater` code in `main.ts` is disabled because it requires a valid Squirrel-compatible feed URL (pointing to a place where `RELEASES` file is hosted).
- **Next Steps:** To enable fully automatic delta updates, a release server (like Nut o Hazel) or a raw GitHub Releases feed must be configured.

## Directory Structure

- `/src/main`: Electron main process logic.
- `/src/app`: Next.js frontend (App Router).
- `/python`: Python backend scripts.
- `/python-runtime`: Bundled Python environment.
- `/ffmpeg`: Bundled FFmpeg binaries.
- `/out/make`: Build artifacts and installers.
