import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, MiniCommand, PlayerMiniState } from '../types/electron';

// The mini window gets a deliberately small API surface. In particular it
// cannot scan, download, write tags, or query the library.
const miniAPI: Pick<
  ElectronAPI,
  | 'isMiniWindow'
  | 'onPlayerState'
  | 'miniControl'
  | 'expandApp'
  | 'closeMini'
  | 'queryMini'
> = {
  isMiniWindow: true,
  onPlayerState: (cb: (state: PlayerMiniState) => void): void => {
    ipcRenderer.on('player:state', (_event, state: PlayerMiniState) => cb(state));
  },
  miniControl: (cmd: MiniCommand): void => {
    ipcRenderer.send('mini:control', cmd);
  },
  expandApp: (): void => {
    ipcRenderer.send('mini:expand');
  },
  closeMini: (): void => {
    ipcRenderer.send('mini:close');
  },
  queryMini: (): void => {
    ipcRenderer.send('mini:query');
  },
};

contextBridge.exposeInMainWorld('electronAPI', miniAPI);
