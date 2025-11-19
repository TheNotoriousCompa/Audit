# Audit

A modern, standalone YouTube to MP3 converter built with Electron and Next.js.

## Features

- **High-Quality Audio Conversion**: Download YouTube videos as MP3 files at up to 320kbps
- **Playlist Support**: Download entire playlists with a single click
- **Automatic Metadata**: Adds cover art and ID3 tags to downloaded files
- **Fully Standalone**: No external dependencies required - Python and FFmpeg are bundled
- **Auto-Updates**: Automatic updates via Squirrel installer
- **Modern UI**: Clean, responsive interface built with Next.js and Tailwind CSS

## Installation

Download the latest `Audit-Setup.exe` from the [Releases](https://github.com/TheNotoriousCompa/Audit/releases) page and run it. The application will install automatically with no additional configuration required.

## Development

### Prerequisites

- Node.js 18+ and npm
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/TheNotoriousCompa/Audit.git
cd Audit

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build

```bash
# Build the application
npm run build

# Package for distribution
npm run package

# Create installer
npm run make
```

The installer will be generated in `out/make/squirrel.windows/x64/`.

## Architecture

### Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Electron 28, Node.js
- **Python Runtime**: Python 3.13 (bundled)
- **Audio Processing**: FFmpeg 7.1 (bundled)
- **Downloader**: yt-dlp

### Project Structure

```
audit/
├── src/
│   ├── app/              # Next.js app directory
│   ├── components/       # React components
│   └── main/            # Electron main process
├── python/              # Python backend scripts
│   ├── downloader/      # Download and conversion logic
│   └── interface/       # IPC communication
├── setup-python.js      # Python runtime setup script
├── setup-ffmpeg.js      # FFmpeg setup script
└── forge.config.js      # Electron Forge configuration
```

## Bundled Dependencies

The application includes:

- **Python 3.13.0**: Embeddable runtime with yt-dlp, mutagen, Pillow, and requests
- **FFmpeg 7.1**: Audio conversion and processing

These are automatically downloaded and configured during the build process via `prebuild` hooks.

## Auto-Updates

The application uses Squirrel.Windows for automatic updates. When a new version is released on GitHub, users will be notified and the update will be downloaded in the background. The update is applied on the next application restart.

### Publishing Updates

1. Update the `version` field in `package.json`
2. Run `npm run make`
3. Create a new release on GitHub with the version tag (e.g., `v0.2.0`)
4. Upload these files from `out/make/squirrel.windows/x64/`:
   - `Audit-Setup.exe`
   - `RELEASES`
   - `Audit-{version}-full.nupkg`

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
