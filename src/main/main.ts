import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme } from 'electron';
import * as path from 'node:path';
import { IPC, type WorkspaceCommand } from '../shared/types';
import { HOOK_FILE_NAME, writeHookFile } from './hookFile';
import { LocalApiServer } from './localApi';
import { PtyManager } from './ptyManager';
import { FIXED_SHELLS } from './shells';
import { StateStore } from './store';
import { hostSystem, noProcessProbe, systemClock } from './system';
import type { LocalApiInfo } from './workspace/claude';
import { createThemeSource, followTheme, windowChrome, type ThemeSource } from './theme';
import { createWorkspace, type Workspace } from './workspace/workspace';

// Unpaketiert (npm start) eigener Datenordner, damit die Entwicklung die installierte App nie berührt.
// Muss vor dem ersten Zugriff auf userData und vor dem ready-Ereignis passieren, und vor der
// Einzelinstanz-Sperre: Die hängt am Datenordner, so hat die Entwicklung ihre eigene.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'TermHub-dev'));

let mainWindow: BrowserWindow | null = null;
let workspace: Workspace | null = null;
let localApi: LocalApiServer | null = null;
let shutdown: 'running' | 'stopping' | 'done' = 'running';

// Nur eine Instanz: Ein zweiter Start gibt hier sofort auf, bevor er Zustand lädt, Shells oder die lokale
// Schnittstelle startet oder Dateien (Zustand, Hook-Datei) schreibt. Die laufende Instanz bekommt dafür
// 'second-instance' und holt ihr Fenster nach vorne.
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', bringWindowToFront);
  app.whenReady().then(start);
  app.on('before-quit', onBeforeQuit);
  app.on('window-all-closed', () => app.quit());
} else {
  app.quit();
}

/** Start der einzigen Instanz: lokale Schnittstelle und Hook-Datei, Zustand laden, Fenster öffnen. */
async function start(): Promise<void> {
  // Im Dev-Modus Menü behalten (DevTools, Reload); in der installierten App ausblenden.
  if (app.isPackaged) Menu.setApplicationMenu(null);

  const api = await startLocalApi();
  localApi = api?.server ?? null;
  workspace = createWorkspace(
    {
      terminal: new PtyManager(),
      storage: new StateStore(path.join(app.getPath('userData'), 'state.json')),
      clock: systemClock,
      processes: noProcessProbe,
      system: hostSystem,
    },
    { shells: FIXED_SHELLS, localApi: api?.info },
  );
  localApi?.connect(workspace);
  workspace.subscribe((event) => sendToRenderer(IPC.workspaceEvent, event));

  // Design hell/dunkel: folgt Windows (nativeTheme) und zieht bei jedem Wechsel sofort mit.
  const theme = createThemeSource(nativeTheme);
  ipcMain.handle(IPC.themeCurrent, () => theme.current());

  registerIpc(workspace);
  createWindow(workspace, theme);
}

/**
 * Startet die lokale Schnittstelle und schreibt die Hook-Datei für diesen Start neu (Adresse und Port ändern
 * sich bei jedem Start). Scheitert das, läuft TermHub ohne Claude-Erkennung: Der Starter erreicht TermHub
 * nicht und startet claude unverändert.
 */
async function startLocalApi(): Promise<{ server: LocalApiServer; info: LocalApiInfo } | null> {
  const hookFile = path.join(app.getPath('userData'), HOOK_FILE_NAME);
  let server: LocalApiServer | null = null;
  try {
    server = await LocalApiServer.start();
    writeHookFile(hookFile, server.url);
    return { server, info: { url: server.url, token: server.token, hookFile } };
  } catch (err) {
    console.error('Lokale Schnittstelle konnte nicht gestartet werden, Claude wird nicht erkannt:', err);
    await server?.close();
    return null;
  }
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
    .then(() => localApi?.close())
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
    case 'activateRelativeTab':
      ws.activateRelativeTab(command.offset);
      return;
    case 'activateTabAt':
      ws.activateTabAt(command.index);
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
function createWindow(ws: Workspace, theme: ThemeSource): void {
  const { bounds, maximized } = ws.windowState();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 600,
    minHeight: 360,
    show: false,
    // Ohne Windows-Rahmen: Die Oberfläche zeichnet die Titelleiste mit den Tabs selbst. Die nativen
    // Fensterknöpfe bleiben als Overlay darüber, mit ihnen die Andock-Layouts von Windows 11.
    titleBarStyle: 'hidden',
    // Deckende Fensterfarbe des Designs (--win-solid), damit beim Öffnen nichts aufblitzt, und die
    // Farben der Fensterknöpfe. Kein Mica, keine Transparenz.
    ...windowChrome(theme.current()),
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
  // Windows-Abmeldung oder -Neustart: sofort einfrieren und synchron sichern. Die Shells (und Claude darin)
  // können danach jederzeit enden, ebenso TermHub selbst; ihr Ende darf die Claude-Zuordnungen nicht löschen.
  const freeze = (): void => {
    try {
      ws.freeze();
    } catch (err) {
      console.error('Zustand konnte bei der Windows-Abmeldung nicht gesichert werden:', err);
    }
  };
  win.on('query-session-end', freeze);
  win.on('session-end', freeze);
  win.once('closed', followTheme(win, theme));

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Maximiert öffnen: Darunter bleibt die gespeicherte normale Grösse, „Wiederherstellen“ führt dorthin.
  if (maximized) win.maximize();
  win.show();
}
