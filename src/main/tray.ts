import { Tray, Menu, nativeImage } from 'electron';
import { getMainWindow } from './window';
import { toggleMiniPlayer } from './mini-player';
import { logToFile } from './logger';

let tray: Tray | null = null;

export function setupTray(iconPath: string, onQuit: () => void): void {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(iconPath);
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip('Audit — downloader & player');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open Audit',
          click: () => {
            const main = getMainWindow();
            if (main && !main.isDestroyed()) {
              main.show();
              main.focus();
            }
          },
        },
        {
          label: 'Mini player (mostra/nascondi)',
          click: () => toggleMiniPlayer(),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => onQuit(),
        },
      ])
    );
    tray.on('click', () => {
      const main = getMainWindow();
      if (main && !main.isDestroyed()) {
        if (main.isVisible()) main.hide();
        else {
          main.show();
          main.focus();
        }
      }
    });
    logToFile('[TRAY] ready');
  } catch (err) {
    logToFile(`[TRAY] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** One-shot hint so users discover the tray menu (right-click). */
export function showMiniHint(): void {
  try {
    tray?.displayBalloon({
      title: 'Audit è nel tray',
      content: 'Click destro sull’icona per Apri / Mini player / Esci.',
    });
  } catch {
    // balloons unsupported: menu still works
  }
}
