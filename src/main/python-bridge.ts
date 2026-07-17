import * as fs from 'fs';
import path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import isDev from 'electron-is-dev';
import { logToFile } from './logger';
import { getMainWindow } from './window';
import type { DownloadOptions, DownloadResult, DownloadProgress, DownloadStatus } from '../types/electron';

let currentPythonProcess: ChildProcessWithoutNullStreams | null = null;

const VALID_STATUSES = new Set<string>([
  'ready', 'starting', 'downloading', 'converting', 'finished', 'error', 'cancelled', 'info',
]);

function safeProgressData(progressData: Record<string, unknown>): DownloadProgress {
  const rawStatus = String(progressData.status || 'downloading');
  const status: DownloadStatus = VALID_STATUSES.has(rawStatus)
    ? (rawStatus as DownloadStatus)
    : 'downloading';

  const isPlaylist = Boolean(
    progressData.isPlaylist ||
    (progressData.playlist_count && Number(progressData.playlist_count) > 0)
  );

  const mainPercentage = isPlaylist
    ? Number(progressData.playlist_percent || 0)
    : Number(progressData.percentage || progressData.file_percent || 0);

  const rawFilename = progressData.filename
    ? String(progressData.filename).split(/[/\\]/).pop()
    : (progressData.currentFile ? String(progressData.currentFile) : '');
  const filename = rawFilename || '';

  const rawSpeed = Number(progressData.speed || progressData.speed_raw || 0);

  return {
    status,
    percentage: mainPercentage,
    downloaded: Number(progressData.downloaded_bytes || 0),
    total: Number(progressData.total_bytes || 0),
    speed: Number.isFinite(rawSpeed) ? rawSpeed : 0,
    speed_str: String(progressData._speed_str || '0 B/s'),
    eta: Number(progressData.eta || 0),
    message: String(progressData.message || ''),
    _percent_str: String(progressData._percent_str || '0%'),
    _speed_str: String(progressData._speed_str || '0 B/s'),
    _eta_str: String(progressData._eta_str || '--:--'),
    isPlaylist,
    currentItem: Number(progressData.playlist_index || 0),
    totalItems: Number(progressData.playlist_count || 0),
    currentFile: filename,
    filename,
    playlistName: String(progressData.playlist_name || ''),
    file_percent: Number(
      progressData.file_percent ||
      (progressData.status === 'finished' ? 100 : 0)
    ),
    playlist_percent: Number(
      progressData.playlist_percent ||
      (isPlaylist && progressData.status === 'finished' ? 100 : 0)
    ),
  };
}

function sendProgressToRenderer(progress: DownloadProgress): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('download-progress', progress);
  }
}

function parseAndForwardProgressLine(line: string, label: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) return false;

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed.type === 'progress' && parsed.data) {
      const progress = safeProgressData(parsed.data);
      console.log(`[${label}]`, {
        status: progress.status,
        percentage: progress.percentage,
        message: progress.message,
      });
      sendProgressToRenderer(progress);
      return true;
    }
  } catch {
    // non-JSON line, ignore in this handler
  }
  return false;
}

export function stopDownload(): void {
  if (currentPythonProcess) {
    currentPythonProcess.kill('SIGTERM');
    currentPythonProcess = null;
    sendProgressToRenderer({
      status: 'cancelled',
      message: "Download fermato dall'utente",
      percentage: 0,
      downloaded: 0, total: 0, filename: '', currentFile: '',
      speed: 0, speed_str: '', eta: 0, _percent_str: '', _speed_str: '', _eta_str: '',
      isPlaylist: false, currentItem: 0, totalItems: 0, playlistName: '',
      file_percent: 0, playlist_percent: 0,
    });
  }
}

export function runDownload(url: string, options: DownloadOptions): Promise<DownloadResult> {
  return new Promise((resolve) => {
    let resolved = false;
    const resolveOnce = (result: DownloadResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    let scriptPath: string;
    let pythonExecutable: string;

    if (isDev) {
      scriptPath = path.join(__dirname, '..', '..', 'python', 'main.py');
      pythonExecutable = 'python';
    } else {
      const extraResourcePath = path.join(process.resourcesPath, 'python', 'main.py');
      const asarUnpackedPath = path.join(
        process.resourcesPath, 'app.asar.unpacked', 'python', 'main.py'
      );
      scriptPath = fs.existsSync(extraResourcePath) ? extraResourcePath : asarUnpackedPath;
      pythonExecutable = path.join(process.resourcesPath, 'python-runtime', 'python.exe');
    }

    console.log('Running Python script:', scriptPath);
    console.log('Using Python:', pythonExecutable);

    let outputDir: string;
    if (options.outputDir) {
      outputDir = path.resolve(options.outputDir);
    } else {
      outputDir = process.cwd();
    }

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      const testFile = path.join(outputDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return resolveOnce({ success: false, error: `Cannot write to output: ${outputDir}. ${msg}` });
    }

    const args = [
      scriptPath,
      url,
      outputDir,
    ];

    if (options.format) args.push('--format', options.format);
    if (options.quality) args.push('--quality', options.quality);
    if (options.processPlaylist) args.push('--process-playlist');
    if (options.timeout) args.push('--timeout', String(options.timeout));
    if (options.fps) args.push('--fps', String(options.fps));

    console.log('Running command:', pythonExecutable, args.join(' '));

    const proc = spawn(pythonExecutable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    }) as ChildProcessWithoutNullStreams;

    currentPythonProcess = proc;

    proc.on('error', (err) => {
      logToFile(`[PYTHON SPAWN ERROR] ${err.stack || err.message}`);
      resolveOnce({ success: false, error: `Failed to start python process: ${err.message}` });
    });

    let stdoutBuffer = '';

    proc.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      if (!output) return;
      stdoutBuffer += output;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (!trimmed.startsWith('{')) {
          console.log('[PYTHON STDOUT RAW]', trimmed);
          continue;
        }

        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'progress' && parsed.data) {
            sendProgressToRenderer(safeProgressData(parsed.data));
          } else if (parsed.type === 'result' && parsed.data) {
            resolveOnce({
              success: Boolean(parsed.data.success),
              message: String(parsed.data.message || ''),
              outputPath: String(parsed.data.output_path || ''),
              error: String(parsed.data.error || ''),
            });
            return;
          }
        } catch {
          console.log('[Raw line]', trimmed);
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (!output) return;
      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('{')) {
          console.error('[PYTHON STDERR RAW]', trimmed);
          logToFile(`[PYTHON STDERR RAW] ${trimmed}`);
          continue;
        }
        parseAndForwardProgressLine(trimmed, 'PROGRESS UPDATE FROM STDERR');
      }
    });

    proc.on('close', (code) => {
      currentPythonProcess = null;
      logToFile(`[PYTHON PROCESS CLOSED] exit code: ${code}`);
      if (resolved) return;
      resolveOnce({
        success: false,
        error: `Python script exited with code ${code}`,
      });
    });
  });
}
