import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type TermHubApi } from '../shared/types';

const api: TermHubApi = {
  loadState: () => ipcRenderer.invoke(IPC.stateLoad),

  createSession: () => ipcRenderer.invoke(IPC.sessionCreate),
  renameSession: (id, name) => ipcRenderer.invoke(IPC.sessionRename, id, name),
  closeSession: (id) => ipcRenderer.invoke(IPC.sessionClose, id),
  setActiveSession: (id) => ipcRenderer.invoke(IPC.sessionSetActive, id),

  startPty: (id, cols, rows) => ipcRenderer.invoke(IPC.ptyStart, id, cols, rows),
  writePty: (id, data) => ipcRenderer.send(IPC.ptyWrite, id, data),
  resizePty: (id, cols, rows) => ipcRenderer.send(IPC.ptyResize, id, cols, rows),
  onPtyData: (listener) => {
    const handler = (_e: IpcRendererEvent, id: string, data: string) => listener(id, data);
    ipcRenderer.on(IPC.ptyData, handler);
    return () => ipcRenderer.off(IPC.ptyData, handler);
  },
  onPtyExit: (listener) => {
    const handler = (_e: IpcRendererEvent, id: string, exitCode: number) => listener(id, exitCode);
    ipcRenderer.on(IPC.ptyExit, handler);
    return () => ipcRenderer.off(IPC.ptyExit, handler);
  },

  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  pickDirectory: (initial) => ipcRenderer.invoke(IPC.dialogPickDirectory, initial),

  readClipboard: () => ipcRenderer.invoke(IPC.clipboardRead),
  writeClipboard: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
};

contextBridge.exposeInMainWorld('termhub', api);
