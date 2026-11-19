import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from 'electron';
import * as path from 'node:path';
import { IPC, type WorkspaceCommand } from '../shared/types';
import { PtyManager } from './ptyManager';
import { FIXED_SHELLS } from './shells';
import { StateStore } from './store';
import { hostSystem, noProcessProbe, systemClock } from './system';
import { createWorkspace, type Workspace } from './workspace/workspace';

// Unpaketiert (npm start) eigener Datenordner, damit die Entwicklung die installierte App nie berührt.
// Muss vor dem ersten Zugriff auf userData und vor dem ready-Ereignis passieren, und vor der
// Einzelinstanz-Sperre: Die hängt am Datenordner, so hat die Entwicklung ihre eigene.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'TermHub-dev'));

let mainWindow: BrowserWindow | null = null;
let workspace: Workspace | null = null;
let shutdown: 'running' | 'stopping' | 'done' = 'running';

// Nur eine Instanz: Ein zweiter Start gibt hier sofort auf, bevor er Zustand lädt, Shells startet oder
// Dateien schreibt. Die laufende Instanz bekommt dafür 'second-instance' und holt ihr Fenster nach vorne.
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', bringWindowToFront);
  app.whenReady().then(start);
  app.on('before-quit', onBeforeQuit);
  app.on('window-all-closed', () => app.quit());
} else {
  app.quit();
}

/** Start der einzigen Instanz: Zustand laden, Fenster öffnen. */
function start(): void {
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
  createWindow(workspace);
}

/** Ein zweiter Start: Das bestehende Fenster kommt nach vorne, auch aus minimiertem Zustand. */
function bringWindowToFront(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Erst Zustand sichern und alle Shells sauber beenden, dann wirklich beenden.
function onBeforeQuit(event: Electron.Event): void {
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
}

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

/** Öffnet das Fenster so, wie der Kern es vorgibt, und meldet ihm jede Änderung von Grösse und Lage. */
function createWindow(ws: Workspace): void {
  const { bounds, maximized } = ws.windowState();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 600,
    minHeight: 360,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'TermHub',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;

  // Gemeldet werden die normale Grösse und Lage (auch im maximierten Zustand) und ob maximiert.
  // Minimiert bleibt der zuletzt gemeldete Zustand stehen, sonst ginge „maximiert“ verloren.
  const reportWindow = (): void => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    ws.windowChanged({ bounds: win.getNormalBounds(), maximized: win.isMaximized() });
  };
  win.on('resize', reportWindow);
  win.on('move', reportWindow);
  win.on('maximize', reportWindow);
  win.on('unmaximize', reportWindow);
  win.on('close', reportWindow);
  win.on('closed', () => {
    mainWindow = null;
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Maximiert öffnen: Darunter bleibt die gespeicherte normale Grösse, „Wiederherstellen“ führt dorthin.
  if (maximized) win.maximize();
  win.show();
}
