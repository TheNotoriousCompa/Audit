import { spawn } from 'child_process';
import { JsonLineDecoder } from './json-lines';
import { detachedOnUnix, killProcessTree } from './process-tree';

export const SCAN_TIMEOUT_MS = 120_000;
export const ART_TIMEOUT_MS = 30_000;
export const TAG_TIMEOUT_MS = 30_000;

export interface SidecarResult {
  code: number | null;
  lines: string[];
  stderr: string;
  timedOut: boolean;
  error: string | null;
}

export function runSidecar(
  executable: string,
  args: string[],
  timeoutMs: number
): Promise<SidecarResult> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(executable, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: detachedOnUnix(),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      });
    } catch (err) {
      resolve({
        code: null,
        lines: [],
        stderr: '',
        timedOut: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const decoder = new JsonLineDecoder();
    const lines: string[] = [];
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const finish = (code: number | null, error: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, lines, stderr, timedOut, error });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(proc);
      finish(null, `Sidecar timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const line of decoder.push(chunk)) lines.push(line);
      } catch (err) {
        killProcessTree(proc);
        finish(null, err instanceof Error ? err.message : String(err));
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });

    proc.on('error', (err) => {
      finish(null, `Failed to start sidecar: ${err.message}`);
    });

    proc.on('close', (code) => {
      try {
        for (const line of decoder.flush()) lines.push(line);
      } catch (err) {
        finish(code, err instanceof Error ? err.message : String(err));
        return;
      }
      finish(code, null);
    });
  });
}
