import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from 'electron';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IPC, type SessionInfo, type Settings } from '../shared/types';
import { PtyManager } from './ptyManager';
import { StateStore } from './store';

let mainWindow: BrowserWindow | null = null;

const store = new StateStore(path.join(app.getPath('userData'), 'state.json'));

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

const ptys = new PtyManager({
  onData: (id, data) => sendToRenderer(IPC.ptyData, id, data),
  onExit: (id, exitCode) => sendToRenderer(IPC.ptyExit, id, exitCode),
});

function isDirectory(p: string | undefined): p is string {
  if (!p) return false;
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Startverzeichnis: Session-Verzeichnis → Default-Verzeichnis → Home, je nachdem was existiert. */
function resolveCwd(session: SessionInfo): string {
  const { defaultCwd } = store.get().settings;
  if (isDirectory(session.cwd)) return session.cwd;
  if (isDirectory(defaultCwd)) return defaultCwd;
  return os.homedir();
}

function nextSessionName(): string {
  const used = new Set(store.get().sessions.map((s) => s.name));
  for (let n = 1; ; n++) {
    const name = `Terminal ${n}`;
    if (!used.has(name)) return name;
  }
}

function findSession(id: string): SessionInfo {
  const session = store.get().sessions.find((s) => s.id === id);
  if (!session) throw new Error(`Unbekannte Session: ${id}`);
  return session;
}

function registerIpc(): void {
  ipcMain.handle(IPC.stateLoad, () => store.get());

  ipcMain.handle(IPC.sessionCreate, () => {
    const session: SessionInfo = {
      id: randomUUID(),
      name: nextSessionName(),
      cwd: store.get().settings.defaultCwd,
    };
    store.update((s) => {
      s.sessions.push(session);
      s.activeSessionId = session.id;
    });
    return session;
  });

  ipcMain.handle(IPC.sessionRename, (_e, id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    store.update(() => {
      findSession(id).name = trimmed;
    });
  });

  ipcMain.handle(IPC.sessionClose, (_e, id: string) => {
    ptys.kill(id);
    store.update((s) => {
      s.sessions = s.sessions.filter((x) => x.id !== id);
      if (s.activeSessionId === id) s.activeSessionId = s.sessions.at(-1)?.id ?? null;
    });
  });

  ipcMain.handle(IPC.sessionSetActive, (_e, id: string | null) => {
    store.update((s) => {
      s.activeSessionId = id;
    });
  });

  ipcMain.handle(IPC.ptyStart, (_e, id: string, cols: number, rows: number) => {
    const session = findSession(id);
    ptys.start(id, { shell: store.get().settings.shell, cwd: resolveCwd(session), cols, rows });
  });

  ipcMain.on(IPC.ptyWrite, (_e, id: string, data: string) => ptys.write(id, data));
  ipcMain.on(IPC.ptyResize, (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows));

  ipcMain.handle(IPC.settingsUpdate, (_e, patch: Partial<Settings>) => {
    store.update((s) => {
      s.settings = { ...s.settings, ...patch };
    });
    return store.get().settings;
  });

  ipcMain.handle(IPC.dialogPickDirectory, async (_e, initial?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Standardverzeichnis wählen',
      defaultPath: isDirectory(initial) ? initial : os.homedir(),
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
  registerIpc();
  createWindow();
});

let shutdown: 'running' | 'stopping' | 'done' = 'running';

// Erst Zustand sichern und alle Shells sauber beenden, dann wirklich beenden.
app.on('before-quit', (event) => {
  if (shutdown === 'done') return;
  event.preventDefault();
  if (shutdown === 'stopping') return;
  shutdown = 'stopping';
  store.flush();
  void ptys.killAll(3000).finally(() => {
    shutdown = 'done';
    app.quit();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
