import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type TermHubApi, type WorkspaceEvent } from '../shared/types';

const api: TermHubApi = {
  loadSnapshot: () => ipcRenderer.invoke(IPC.workspaceSnapshot),
  onEvent: (listener) => {
    const handler = (_e: IpcRendererEvent, event: WorkspaceEvent) => listener(event);
    ipcRenderer.on(IPC.workspaceEvent, handler);
    return () => ipcRenderer.off(IPC.workspaceEvent, handler);
  },
  send: (command) => ipcRenderer.send(IPC.workspaceCommand, command),

  pickDirectory: (initial) => ipcRenderer.invoke(IPC.dialogPickDirectory, initial),

  readClipboard: () => ipcRenderer.invoke(IPC.clipboardRead),
  writeClipboard: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
};

contextBridge.exposeInMainWorld('termhub', api);
