import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from 'electron';
import * as path from 'node:path';
import { IPC, type WorkspaceCommand } from '../shared/types';
import { PtyManager } from './ptyManager';
import { FIXED_SHELLS } from './shells';
import { StateStore } from './store';
import { hostSystem, noProcessProbe, systemClock } from './system';
import { createWorkspace, type Workspace } from './workspace/workspace';

// Unpaketiert (npm start) eigener Datenordner, damit die Entwicklung die installierte App nie berührt.
// Muss vor dem ersten Zugriff auf userData und vor dem ready-Ereignis passieren.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'TermHub-dev'));

let mainWindow: BrowserWindow | null = null;
let workspace: Workspace | null = null;

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

/** Leitet einen Befehl aus dem Renderer an den Workspace-Kern weiter. */
function handleCommand(ws: Workspace, command: WorkspaceCommand): void {
  switch (command.type) {
    case 'createTab':
      ws.createTab();
      return;
    case 'renameTab':
      ws.renameTab(command.tabId, command.name);
      return;
    case 'activateTab':
      ws.activateTab(command.tabId);
      return;
    case 'closeTab':
      ws.closeTab(command.tabId);
      return;
    case 'viewReady':
      ws.viewReady(command.tabId, command.cols, command.rows);
      return;
    case 'resizeTab':
      ws.resizeTab(command.tabId, command.cols, command.rows);
      return;
    case 'writeToTab':
      ws.writeToTab(command.tabId, command.data);
      return;
    case 'restartTab':
      ws.restartTab(command.tabId);
      return;
    case 'updateSettings':
      ws.updateSettings(command.patch);
      return;
  }
}

function registerIpc(ws: Workspace): void {
  ipcMain.handle(IPC.workspaceSnapshot, () => ws.snapshot());
  ipcMain.on(IPC.workspaceCommand, (_e, command: WorkspaceCommand) => handleCommand(ws, command));

  ipcMain.handle(IPC.dialogPickDirectory, async (_e, initial?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Standardverzeichnis wählen',
      defaultPath: initial && hostSystem.directoryExists(initial) ? initial : hostSystem.homeDir(),
      properties: ['openDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.clipboardRead, () => clipboard.readText());
  ipcMain.handle(IPC.clipboardWrite, (_e, text: string) => clipboard.writeText(text));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 600,
    minHeight: 360,
    backgroundColor: '#1e1e1e',
    title: 'TermHub',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Im Dev-Modus Menü behalten (DevTools, Reload); in der installierten App ausblenden.
  if (app.isPackaged) Menu.setApplicationMenu(null);

  workspace = createWorkspace(
    {
      terminal: new PtyManager(),
      storage: new StateStore(path.join(app.getPath('userData'), 'state.json')),
      clock: systemClock,
      processes: noProcessProbe,
      system: hostSystem,
    },
    { shells: FIXED_SHELLS },
  );
  workspace.subscribe((event) => sendToRenderer(IPC.workspaceEvent, event));

  registerIpc(workspace);
  createWindow();
});

let shutdown: 'running' | 'stopping' | 'done' = 'running';

// Erst Zustand sichern und alle Shells sauber beenden, dann wirklich beenden.
app.on('before-quit', (event) => {
  if (shutdown === 'done' || !workspace) return;
  event.preventDefault();
  if (shutdown === 'stopping') return;
  shutdown = 'stopping';
  workspace
    .shutdown()
    .catch((err: unknown) => console.error('Zustand konnte beim Beenden nicht gesichert werden:', err))
    .finally(() => {
      shutdown = 'done';
      app.quit();
    });
});

app.on('window-all-closed', () => {
  app.quit();
});
