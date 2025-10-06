# YouTube to MP3 Converter

A lightweight desktop application that lets you download high-quality MP3 audio from YouTube videos. Built with Electron, React, and TypeScript, with yt-dlp for reliable YouTube downloads.

## Features

- Download YouTube videos as high-quality MP3 files
- Simple and intuitive user interface
- Fast downloads with progress tracking
- Cross-platform support (Windows, macOS, Linux)
- No file size limits

## Prerequisites

- Node.js 16.x or later
- npm or yarn
- Python 3.7+ (for yt-dlp)
- FFmpeg (for audio conversion)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/TheNotoriousCompa/ytmp3-next.git
   cd ytmp3-next
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Start the application:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

2. Copy and paste a YouTube URL into the input field
3. Click "Download" and choose a save location
4. Wait for the conversion to complete

## Building for Production

To create a standalone application:

```bash
# Build the application
npm run build
# or
yarn build

# Package for your platform
npm run package
# or
yarn package
```

## Project Structure

```
ytmp3-next/
├── src/                    # Source files
│   ├── main/               # Electron main process
│   ├── renderer/           # React frontend
│   └── types/              # TypeScript definitions
├── python/                 # yt-dlp wrapper and FFmpeg
└── scripts/                # Build utilities
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This application is for personal use only. Please respect YouTube's terms of service and only download content you have the rights to.
