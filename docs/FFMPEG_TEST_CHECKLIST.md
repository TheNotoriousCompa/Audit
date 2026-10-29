# FFmpeg verification checklist

Scope: Windows only. macOS is temporarily suspended.
No virtual machines required: a clean Windows install or a second Windows account is enough.

## Setup

1. Build or install Audit.
2. Confirm the app starts and the normal UI is fully styled (frosted glass visible).
3. Open a terminal and run:

```powershell
ffmpeg -version
```

Record the path and version. If `ffmpeg` is not available, that is a valid test case.

## Test A - bundled FFmpeg

1. Start Audit with the bundle intact.
2. Expect no FFmpeg warning in the app.
3. In DevTools, run:

```js
await window.electronAPI.ffmpegStatus(true)
```

Expected: `found: true`, a path under Audit, and a non-empty version.
4. Download one short MP3 and one short MP4.
5. Expect both to complete and play in the library.

## Test B - missing FFmpeg

Only on a disposable test machine or a copy of the installed app.

1. Close Audit.
2. Rename the bundled binary:

```powershell
Rename-Item "$env:LOCALAPPDATA\Programs\Audit\resources\ffmpeg\bin\ffmpeg.exe" ffmpeg.exe.bak
```

3. If FFmpeg is also installed system-wide, temporarily remove its directory from `PATH` for this test.
4. Start Audit.
5. Expected before any download: the amber banner `FFmpeg was not found`.
6. Press `Recheck`: the banner must remain and the request must not hang.
7. Press `How to fix`: the FFmpeg download page must open.
8. Start a download: the error card and the final status must contain the full FFmpeg message, not only `Failed to download`.
9. Restore the binary:

```powershell
Rename-Item "$env:LOCALAPPDATA\Programs\Audit\resources\ffmpeg\bin\ffmpeg.exe.bak" ffmpeg.exe
```

10. Press `Recheck`: the banner must disappear.
11. Download the same tracks again and confirm conversion works.

## Test C - FFmpeg from PATH

1. Install FFmpeg in a normal location and add its `bin` directory to the user `PATH`.
2. Remove or rename the bundled binary.
3. Restart Audit.
4. Expect `ffmpegStatus` to report the PATH binary and no banner.
5. Download one MP3 and one MP4.

## Test D - path edge cases

1. Use an output folder with spaces and accented characters.
2. Use `AUDIT_FFMPEG_PATH` pointing to the FFmpeg directory.
3. Verify `ffmpegStatus` reports that path.
4. Verify conversion still works.

## What to report

Send:

- Windows version;
- FFmpeg path and version;
- screenshot of the banner or error;
- the last 30 lines of `%APPDATA%\Audit\audit-main.log`;
- whether `ffmpegStatus` returned `found: true` or `false`.

## Pass criteria

- No false FFmpeg warning when the bundle or PATH binary is valid.
- Clear warning when FFmpeg is missing.
- Detailed message preserved in the final error.
- `Recheck` reflects the new state without restarting the app.
- MP3 and MP4 downloads work after the fix.
- Normal UI and frosted glass remain unchanged.
