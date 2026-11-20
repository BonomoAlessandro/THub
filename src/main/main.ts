import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import * as path from 'node:path';
import { IPC, type DirectoryPurpose, type WorkspaceCommand } from '../shared/types';
import { dataFolders, takeOverLegacyData, type DataFolders } from './dataFolder';
import { checkExecutionPolicy, type ExecutionPolicyCheck } from './executionPolicy';
import { HOOK_FILE_NAME, writeHookFile } from './hookFile';
import { LocalApiServer } from './localApi';
import { openTabFolder } from './openFolder';
import { openWebLink } from './openLink';
import { PtyManager } from './ptyManager';
import { shellIntegrationDir } from './shellLaunch';
import { detectShells } from './shells';
import { STATE_FILE_NAME, StateStore } from './store';
import { createProcessProbe } from './processProbe';
import { hostSystem, systemClock } from './system';
import { DEV_MENU } from './devMenu';
import type { LocalApiInfo } from './workspace/claude';
import type { ShellInfo } from './workspace/ports';
import { createThemeSource, followTheme, followThemeSetting, windowChrome, type ThemeSource } from './theme';
import { createWorkspace, type Workspace } from './workspace/workspace';

// Datenordner %APPDATA%\THub, unpaketiert (npm start) %APPDATA%\THub-dev, damit die Entwicklung die
// installierte App nie berührt. Muss vor dem ersten Zugriff auf userData und vor dem ready-Ereignis
// passieren, und vor der Einzelinstanz-Sperre: Die hängt am Datenordner, so hat die Entwicklung ihre eigene.
// Testmodus: THUB_TEST_DATA_DIR ersetzt %APPDATA% als Wurzel der Datenordner, damit automatische Prüfungen
// eigene Daten und eine eigene Einzelinstanz-Sperre haben. Electron selbst ignoriert ein umgeleitetes APPDATA.
const appDataRoot = process.env.THUB_TEST_DATA_DIR || app.getPath('appData');
const folders = dataFolders(appDataRoot, app.isPackaged);
app.setPath('userData', folders.current);

let mainWindow: BrowserWindow | null = null;

/**
 * Testmodus für automatische Prüfungen der echten App (Agenten, Tests): Mit `THUB_TEST_HIDDEN=1` öffnet
 * das Fenster ausserhalb des Bildschirms, ohne Aktivierung und ohne Taskleisten-Eintrag; Grösse und Lage
 * werden nicht gespeichert, und ein zweiter Start holt es nicht nach vorne. Gilt auch für die gebaute App.
 */
const TEST_HIDDEN = process.env.THUB_TEST_HIDDEN === '1';
let workspace: Workspace | null = null;
let localApi: LocalApiServer | null = null;
let shutdown: 'running' | 'stopping' | 'done' = 'running';

// Nur eine Instanz: Ein zweiter Start gibt hier sofort auf, bevor er Zustand lädt, Shells oder die lokale
// Schnittstelle startet oder Dateien (Zustand, Hook-Datei) schreibt. Die laufende Instanz bekommt dafür
// 'second-instance' und holt ihr Fenster nach vorne.
if (app.requestSingleInstanceLock()) {
  // Die Shell-Erkennung läuft sofort an, parallel zum Start von Electron und der lokalen Schnittstelle.
  const shells = detectShells();
  // Ob eine Gruppenrichtlinie den claude-Starter blockiert, prüft ein verstecktes powershell.exe, ebenfalls
  // parallel. Darauf wartet der Start nicht: Die Shells fragen das Ergebnis erst ab, wenn sie starten.
  const executionPolicy = checkExecutionPolicy();
  app.on('second-instance', bringWindowToFront);
  app.whenReady().then(() => start(shells, executionPolicy));
  app.on('before-quit', onBeforeQuit);
  app.on('window-all-closed', () => app.quit());
} else {
  app.quit();
}

/**
 * Start der einzigen Instanz: lokale Schnittstelle und Hook-Datei, Zustand laden, Fenster öffnen.
 * @param detectedShells die laufende Shell-Erkennung
 * @param executionPolicy die laufende Prüfung, ob die Shells den claude-Ersatz bekommen
 */
async function start(detectedShells: Promise<ShellInfo[]>, executionPolicy: ExecutionPolicyCheck): Promise<void> {
  // Im Dev-Modus ein Menü mit DevTools und Neu laden, aber ohne Zoom; die installierte App hat keines.
  Menu.setApplicationMenu(app.isPackaged ? null : Menu.buildFromTemplate(DEV_MENU));

  // Erst nach der Einzelinstanz-Sperre, damit nie zwei Starts zugleich übernehmen, und vor dem Laden.
  takeOverOldData(folders);
  const [api, shells] = await Promise.all([startLocalApi(), detectedShells]);
  localApi = api?.server ?? null;
  console.log(`Erkannte Shells: ${shells.map((s) => `${s.name} (${s.file})`).join(', ')}`);
  // Eine Sonde für Kern und Terminal-Backend: Der Kern liest daraus den Status und beendet geschlossene Tabs samt
  // ihren Nachfahren, das Backend räumt damit den Konsolen-Host einer beendeten Shell weg.
  const processes = createProcessProbe();
  workspace = createWorkspace(
    {
      // Die Integrationsdateien liegen im Paket ausserhalb des asar-Archivs (extraResources). Den claude-Ersatz
      // bekommen die Shells nur, wenn keine Gruppenrichtlinie den Starter blockiert.
      terminal: new PtyManager({
        shellDir: shellIntegrationDir(app.isPackaged, process.resourcesPath, app.getAppPath()),
        claudeStarter: () => executionPolicy.starterAllowed(),
        processes,
      }),
      storage: new StateStore(path.join(app.getPath('userData'), STATE_FILE_NAME)),
      clock: systemClock,
      processes,
      system: hostSystem,
    },
    { shells, localApi: api?.info },
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
  if (!mainWindow || mainWindow.isDestroyed() || TEST_HIDDEN) return;
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
      ws.createTab({
        cwd: typeof command.cwd === 'string' ? command.cwd : undefined,
        shellId: typeof command.shellId === 'string' ? command.shellId : undefined,
      });
      return;
    case 'duplicateTab':
      ws.duplicateTab(command.tabId);
      return;
    case 'renameTab':
      ws.renameTab(command.tabId, command.name);
      return;
    case 'moveTab':
      ws.moveTab(command.tabId, command.index);
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
    case 'requestClose':
      ws.requestClose(stringList(command.tabIds));
      return;
    case 'closeOtherTabs':
      ws.closeOtherTabs(command.tabId);
      return;
    case 'closeTabs':
      ws.closeTabs(stringList(command.tabIds));
      return;
    case 'reopenClosedTab':
      ws.reopenClosedTab(typeof command.tabId === 'string' ? command.tabId : undefined);
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
    case 'windowForeground':
      ws.windowForeground(command.foreground === true);
      return;
    case 'openToast':
      ws.openToast(command.toastId);
      return;
    case 'dismissToast':
      ws.dismissToast(command.toastId);
      return;
    case 'holdToast':
      ws.holdToast(command.toastId, command.hold === true);
      return;
    case 'updateSettings':
      ws.updateSettings(command.patch);
      return;
    case 'stepFontSize':
      ws.stepFontSize(command.step);
      return;
  }
}

/** Eine Liste von Kennungen aus dem Renderer; alles andere als Zeichenketten fällt weg. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function registerIpc(ws: Workspace): void {
  ipcMain.handle(IPC.workspaceSnapshot, () => ws.snapshot());
  ipcMain.on(IPC.workspaceCommand, (_e, command: WorkspaceCommand) => handleCommand(ws, command));
  ipcMain.handle(IPC.workspaceRecentDirs, () => ws.recentDirs());
  ipcMain.handle(IPC.workspaceClosedTabs, () => ws.closedTabs());

  // Ordner-Dialog von Windows. Er startet im Standardordner, ohne ihn im Benutzerordner.
  // Im Testmodus geht kein Dialog auf dem Desktop auf: Die Wahl ist `THUB_TEST_PICK_DIR`, sonst abgebrochen.
  ipcMain.handle(IPC.dialogPickDirectory, async (_e, purpose: DirectoryPurpose) => {
    if (TEST_HIDDEN) {
      const picked = process.env.THUB_TEST_PICK_DIR || null;
      console.log(`Testmodus: Ordner-Dialog (${purpose}) liefert ${picked ?? 'Abbruch'}.`);
      return picked;
    }
    if (!mainWindow) return null;
    const defaultCwd = ws.snapshot().settings.defaultCwd;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: purpose === 'defaultCwd' ? 'Standardordner wählen' : 'Ordner für das neue Terminal wählen',
      defaultPath: defaultCwd && hostSystem.directoryExists(defaultCwd) ? defaultCwd : hostSystem.homeDir(),
      properties: ['openDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // „Ordner im Explorer öffnen“: Den Ordner bestimmt der Kern, aus dem Renderer kommt nur die Tab-Kennung.
  // Im Testmodus geht kein Explorer-Fenster auf dem Desktop auf; der Ordner steht stattdessen in der Ausgabe.
  ipcMain.handle(IPC.tabOpenFolder, async (_e, tabId: unknown) => {
    await openTabFolder(ws, tabId, {
      directoryExists: (dir) => hostSystem.directoryExists(dir),
      openPath: (dir) => {
        if (!TEST_HIDDEN) return shell.openPath(dir);
        console.log(`Testmodus: Der Explorer würde ${dir} öffnen.`);
        return Promise.resolve('');
      },
    });
  });

  // Im Testmodus eine eigene Zwischenablage im Speicher: Prüfungen von „Pfad kopieren“ oder Kopieren im Terminal
  // dürfen die echte Zwischenablage des Nutzers weder lesen noch überschreiben.
  let testClipboard = '';
  ipcMain.handle(IPC.clipboardRead, () => (TEST_HIDDEN ? testClipboard : clipboard.readText()));
  ipcMain.handle(IPC.clipboardWrite, (_e, text: string) => {
    if (TEST_HIDDEN) testClipboard = String(text);
    else clipboard.writeText(text);
  });

  // Ctrl+Klick auf einen Link im Terminal. Die Adresse prüft der Hauptprozess selbst noch einmal (nur http und https),
  // bevor er sie im Standardbrowser öffnet. Im Testmodus geht kein Browser auf dem Desktop auf; die Adresse steht nur
  // in der Ausgabe.
  ipcMain.handle(IPC.linkOpen, async (_e, url: unknown) => {
    await openWebLink(url, {
      openExternal: (link) => {
        if (!TEST_HIDDEN) return shell.openExternal(link);
        console.log(`Testmodus: Der Browser würde ${link} öffnen.`);
        return Promise.resolve();
      },
    });
  });
}

/** Öffnet das Fenster so, wie der Kern es vorgibt, und meldet ihm jede Änderung von Grösse und Lage. */
function createWindow(ws: Workspace, theme: ThemeSource): void {
  const { bounds, maximized } = ws.windowState();
  const win = new BrowserWindow({
    ...bounds,
    // Testmodus: ausserhalb des Bildschirms, ohne Taskleisten-Eintrag (siehe TEST_HIDDEN).
    ...(TEST_HIDDEN ? { x: -32000, y: -32000, skipTaskbar: true } : {}),
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
    if (TEST_HIDDEN || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
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
  if (TEST_HIDDEN) {
    // Ohne Aktivierung zeigen: Das Fenster nimmt niemandem den Fokus weg.
    win.showInactive();
    return;
  }
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
