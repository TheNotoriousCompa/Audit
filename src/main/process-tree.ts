import { spawn, type ChildProcess } from 'child_process';

/** Kill a sidecar and its descendants without invoking a shell. */
export function killProcessTree(proc: ChildProcess | null | undefined): void {
  if (!proc || proc.killed || !proc.pid) return;

  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      }).unref();
    } catch {
      proc.kill();
    }
    return;
  }

  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    try {
      proc.kill('SIGKILL');
    } catch {
      // Process already exited.
    }
  }
}

export function detachedOnUnix(): boolean {
  return process.platform !== 'win32';
}
