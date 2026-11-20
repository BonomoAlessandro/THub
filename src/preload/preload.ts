import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ResolvedTheme, type THubApi, type WorkspaceEvent } from '../shared/types';

const api: THubApi = {
  loadSnapshot: () => ipcRenderer.invoke(IPC.workspaceSnapshot),
  onEvent: (listener) => {
    const handler = (_e: IpcRendererEvent, event: WorkspaceEvent) => listener(event);
    ipcRenderer.on(IPC.workspaceEvent, handler);
    return () => ipcRenderer.off(IPC.workspaceEvent, handler);
  },
  send: (command) => ipcRenderer.send(IPC.workspaceCommand, command),
  loadRecentDirs: () => ipcRenderer.invoke(IPC.workspaceRecentDirs),

  pickDirectory: (purpose) => ipcRenderer.invoke(IPC.dialogPickDirectory, purpose),

  readClipboard: () => ipcRenderer.invoke(IPC.clipboardRead),
  writeClipboard: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),

  loadTheme: () => ipcRenderer.invoke(IPC.themeCurrent),
  onThemeChange: (listener) => {
    const handler = (_e: IpcRendererEvent, theme: ResolvedTheme) => listener(theme);
    ipcRenderer.on(IPC.themeChanged, handler);
    return () => ipcRenderer.off(IPC.themeChanged, handler);
  },
};

contextBridge.exposeInMainWorld('thub', api);
