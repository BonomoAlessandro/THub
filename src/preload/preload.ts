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
  loadClosedTabs: () => ipcRenderer.invoke(IPC.workspaceClosedTabs),

  pickDirectory: (purpose) => ipcRenderer.invoke(IPC.dialogPickDirectory, purpose),
  openTabFolder: (tabId) => ipcRenderer.invoke(IPC.tabOpenFolder, tabId),

  readClipboard: () => ipcRenderer.invoke(IPC.clipboardRead),
  writeClipboard: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),

  openLink: (url) => ipcRenderer.invoke(IPC.linkOpen, url),

  loadTheme: () => ipcRenderer.invoke(IPC.themeCurrent),
  onThemeChange: (listener) => {
    const handler = (_e: IpcRendererEvent, theme: ResolvedTheme) => listener(theme);
    ipcRenderer.on(IPC.themeChanged, handler);
    return () => ipcRenderer.off(IPC.themeChanged, handler);
  },
};

contextBridge.exposeInMainWorld('thub', api);
