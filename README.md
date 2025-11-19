# Audit

A lightweight desktop application that lets you download high-quality MP3 audio from YouTube videos. Built with Electron, React, and TypeScript, with yt-dlp for reliable YouTube downloads and with a lot of features and a fresh aesthetic made to practice with a lot of tools.

## Features

- Download YouTube videos as high-quality audio format files
- Simple and intuitive user interface
- Playlist support
- Customizable aesthetic
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

## Troubleshooting

### 403 Forbidden Error

If you encounter a `403 Forbidden` error when trying to download videos, try these solutions:

1. **Update yt-dlp**:
   ```bash
   pip install -U yt-dlp
   ```

2. **Use a VPN**: YouTube might be blocking your IP address. Try using a VPN to change your IP.

3. **Clear yt-dlp cache**:
   ```bash
   yt-dlp --rm-cache-dir
   ```

4. **Try a different network**: If you're on a restricted network (like school or work), try using a different internet connection.

5. **Update the application**: Make sure you're using the latest version of the application.

6. **Check YouTube's status**: Sometimes YouTube might be experiencing issues. Check [YouTube's status page](https://www.youtube.com/status).

7. **Temporarily disable security software**: Some antivirus or firewall settings might be interfering with the download process.

If the issue persists, please open an issue on GitHub with the following information:
- The URL you're trying to download
- The exact error message
- Your operating system version
- The version of the application

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

## Disclaimer

This application is for personal use only. Please respect YouTube's terms of service and only download content you have the rights to.
