# Audit

A standalone YouTube to MP3 converter.

## Features

- Converts videos to MP3 (up to 320kbps)
- Downloads entire playlists
- Embeds cover art and metadata automatically
- Standalone: No external dependency installation required
- Self-updating

## Installation

Download `Audit-Setup.exe` from the Releases page. Run data. No configuration needed.

## Architecture

- **Frontend**: Next.js, React, Tailwind CSS
- **Backend**: Electron, Node.js
- **Core**: Python (bundled), FFmpeg (bundled), yt-dlp

## Development

### Prerequisites

- Node.js 18+
- Git

### Setup

```bash
git clone https://github.com/TheNotoriousCompa/Audit.git
cd Audit
npm install
npm run dev
```

### Build

```bash
npm run build      # Build logic
npm run package    # Package app
npm run make       # Create installer
```

## Release Process

1. Update version in `package.json`
2. Push a new tag (e.g., `v1.2.2`)
3. GitHub Actions builds and publishes releases for Windows, Mac, and Linux

## License

MIT
