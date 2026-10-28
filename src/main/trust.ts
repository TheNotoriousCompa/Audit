import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

export type IpcSurface = 'main' | 'mini';

const trusted = new Map<number, IpcSurface>();

export function registerTrustedWindow(win: BrowserWindow, surface: IpcSurface): void {
  const id = win.webContents.id;
  trusted.set(id, surface);
  win.once('closed', () => {
    trusted.delete(id);
  });
}

export function isTrustedSender(senderId: number, allowMini = false): boolean {
  const surface = trusted.get(senderId);
  return surface === 'main' || (allowMini && surface === 'mini');
}

export function assertTrustedSender(
  event: IpcMainInvokeEvent | IpcMainEvent,
  allowMini = false
): void {
  if (!isTrustedSender(event.sender.id, allowMini)) {
    throw new Error('Untrusted IPC sender');
  }
}
