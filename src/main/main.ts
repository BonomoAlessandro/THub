import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme } from 'electron';
import * as path from 'node:path';
import { IPC, type DirectoryPurpose, type WorkspaceCommand } from '../shared/types';
import { dataFolders, takeOverLegacyData, type DataFolders } from './dataFolder';
import { HOOK_FILE_NAME, writeHookFile } from './hookFile';
import { LocalApiServer } from './localApi';
import { PtyManager } from './ptyManager';
import { shellIntegrationDir } from './shellLaunch';
import { provisionalShells } from './shells';
import { STATE_FILE_NAME, StateStore } from './store';
import { hostSystem, noProcessProbe, systemClock } from './system';
import { DEV_MENU } from './devMenu';
import type { LocalApiInfo } from './workspace/claude';
import { createThemeSource, followTheme, followThemeSetting, windowChrome, type ThemeSource } from './theme';
import { createWorkspace, type Workspace } from './workspace/workspace';

// Datenordner %APPDATA%\THub, unpaketiert (npm start) %APPDATA%\THub-dev, damit die Entwicklung die
// installierte App nie berührt. Muss vor dem ersten Zugriff auf userData und vor dem ready-Ereignis
// passieren, und vor der Einzelinstanz-Sperre: Die hängt am Datenordner, so hat die Entwicklung ihre eigene.
const folders = dataFolders(app.getPath('appData'), app.isPackaged);
app.setPath('userData', folders.current);

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
  // Im Dev-Modus ein Menü mit DevTools und Neu laden, aber ohne Zoom; die installierte App hat keines.
  Menu.setApplicationMenu(app.isPackaged ? null : Menu.buildFromTemplate(DEV_MENU));

  // Erst nach der Einzelinstanz-Sperre, damit nie zwei Starts zugleich übernehmen, und vor dem Laden.
  takeOverOldData(folders);
  const api = await startLocalApi();
  localApi = api?.server ?? null;
  workspace = createWorkspace(
    {
      // Die Integrationsdateien liegen im Paket ausserhalb des asar-Archivs (extraResources).
      terminal: new PtyManager({
        shellDir: shellIntegrationDir(app.isPackaged, process.resourcesPath, app.getAppPath()),
      }),
      storage: new StateStore(path.join(app.getPath('userData'), STATE_FILE_NAME)),
      clock: systemClock,
      processes: noProcessProbe,
      system: hostSystem,
    },
    { shells: provisionalShells(), localApi: api?.info },
  );
  localApi?.connect(workspace);
  workspace.subscribe((event) => sendToRenderer(IPC.workspaceEvent, event));

  // Design hell/dunkel nach der Wahl in den Einstellungen; bei „System“ folgt es Windows (nativeTheme)
  // und zieht bei jedem Wechsel sofort mit. Vor dem Fenster, damit es gleich richtig erscheint.
  const theme = createThemeSource(nativeTheme);
  followThemeSetting(theme, workspace);
  ipcMain.handle(IPC.themeCurrent, () => theme.current());

  registerIpc(workspace);
  createWindow(workspace, theme);
}

/**
 * Einmalige Übernahme von Zustand und Verlauf aus dem Datenordner, den die App unter ihrem alten Namen
 * „TermHub“ hatte. Scheitert sie, startet die App ohne die alten Daten, wie bei einem ersten Start.
 */
function takeOverOldData(f: DataFolders): void {
  try {
    if (takeOverLegacyData(f) === 'taken-over') console.log(`Zustand und Verlauf aus ${f.legacy} übernommen.`);
  } catch (err) {
    console.error(`Zustand und Verlauf aus ${f.legacy} konnten nicht übernommen werden:`, err);
  }
}

/**
 * Startet die lokale Schnittstelle und schreibt die Hook-Datei für diesen Start neu (Adresse und Port ändern
 * sich bei jedem Start). Scheitert das, läuft THub ohne Claude-Erkennung: Der Starter erreicht THub
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

// Erst Verlauf und Zustand sichern und alle Shells sauber beenden, dann wirklich beenden.
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
      ws.createTab(typeof command.cwd === 'string' ? { cwd: command.cwd } : {});
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
    case 'saveHistory':
      ws.saveHistory(command.tabId, command.content);
      return;
    case 'updateSettings':
      ws.updateSettings(command.patch);
      return;
    case 'stepFontSize':
      ws.stepFontSize(command.step);
      return;
  }
}

function registerIpc(ws: Workspace): void {
  ipcMain.handle(IPC.workspaceSnapshot, () => ws.snapshot());
  ipcMain.on(IPC.workspaceCommand, (_e, command: WorkspaceCommand) => handleCommand(ws, command));
  ipcMain.handle(IPC.workspaceRecentDirs, () => ws.recentDirs());

  // Ordner-Dialog von Windows. Er startet im Standardordner, ohne ihn im Benutzerordner.
  ipcMain.handle(IPC.dialogPickDirectory, async (_e, purpose: DirectoryPurpose) => {
    if (!mainWindow) return null;
    const defaultCwd = ws.snapshot().settings.defaultCwd;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: purpose === 'defaultCwd' ? 'Standardordner wählen' : 'Ordner für das neue Terminal wählen',
      defaultPath: defaultCwd && hostSystem.directoryExists(defaultCwd) ? defaultCwd : hostSystem.homeDir(),
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
    title: 'THub',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;

  // Das Fenster zeigt nur die eigene Oberfläche. Ein auf das Fenster gezogener Link oder eine Datei würde
  // sonst wegnavigieren, und eine fremde Seite bekäme Zugriff auf die Terminal-Schnittstelle aus dem Preload.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-redirect', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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
  win.once('closed', followTheme(win, theme));
  handleWindowEnd(win, ws);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Maximiert öffnen: Darunter bleibt die gespeicherte normale Grösse, „Wiederherstellen“ führt dorthin.
  if (maximized) win.maximize();
  win.show();
}

/**
 * Beenden über das Fenster (`×`, Alt+F4, Taskleiste): Das Schliessen wird abgefangen und läuft als
 * geordnetes Beenden (onBeforeQuit), solange der Renderer noch lebt und dem Kern den Verlauf liefern
 * kann. Erst danach schliesst sich das Fenster wirklich.
 * Bei einer Windows-Abmeldung oder einem Neustart schreibt der Kern sofort, ohne auf den Renderer zu warten.
 */
function handleWindowEnd(win: BrowserWindow, ws: Workspace): void {
  win.on('close', (event) => {
    if (shutdown === 'done') return;
    event.preventDefault();
    // Das Fenster verschwindet sofort wie bisher. Versteckt darf der Renderer nicht gebremst werden,
    // sonst käme seine Antwort mit dem Verlauf womöglich erst nach dem Zeitlimit.
    win.webContents.setBackgroundThrottling(false);
    win.hide();
    app.quit();
  });

  const onSessionEnd = (): void => {
    try {
      ws.sessionEnding();
    } catch (err) {
      console.error('Zustand konnte bei der Windows-Abmeldung nicht gesichert werden:', err);
    }
  };
  win.on('query-session-end', onSessionEnd);
  win.on('session-end', onSessionEnd);
}
