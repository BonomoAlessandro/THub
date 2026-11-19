import '@xterm/xterm/css/xterm.css';
import './styles.css';
import type { SessionInfo, Settings } from '../shared/types';
import { TerminalView } from './terminalView';

const api = window.termhub;

const els = {
  sessionList: document.getElementById('session-list') as HTMLUListElement,
  terminals: document.getElementById('terminals') as HTMLElement,
  emptyState: document.getElementById('empty-state') as HTMLDivElement,
  btnNew: document.getElementById('btn-new') as HTMLButtonElement,
  btnNewEmpty: document.getElementById('btn-new-empty') as HTMLButtonElement,
  btnDefaultCwd: document.getElementById('btn-default-cwd') as HTMLButtonElement,
};

let sessions: SessionInfo[] = [];
let settings: Settings;
let activeId: string | null = null;
/** Session, deren Name gerade inline bearbeitet wird (dann wird die Liste nicht neu gezeichnet). */
let renamingId: string | null = null;
const views = new Map<string, TerminalView>();

// ---------- Sessions ----------

async function openView(session: SessionInfo): Promise<void> {
  const view = new TerminalView(session.id, els.terminals, renderSidebar);
  views.set(session.id, view);
  await view.start();
}

async function newSession(): Promise<void> {
  const session = await api.createSession();
  sessions.push(session);
  await openView(session);
  activate(session.id);
}

async function closeSession(id: string): Promise<void> {
  await api.closeSession(id);
  views.get(id)?.dispose();
  views.delete(id);
  const index = sessions.findIndex((s) => s.id === id);
  sessions = sessions.filter((s) => s.id !== id);
  if (activeId === id) {
    const neighbour = sessions[Math.min(index, sessions.length - 1)];
    activate(neighbour?.id ?? null);
  } else {
    renderSidebar();
  }
}

function activate(id: string | null): void {
  activeId = id;
  for (const [viewId, view] of views) view.setActive(viewId === id);
  els.emptyState.hidden = sessions.length > 0;
  void api.setActiveSession(id);
  renderSidebar();
}

function activateRelative(offset: number): void {
  if (sessions.length === 0) return;
  const index = sessions.findIndex((s) => s.id === activeId);
  const next = (index + offset + sessions.length) % sessions.length;
  activate(sessions[next].id);
}

async function renameSession(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  const session = sessions.find((s) => s.id === id);
  if (!session || !trimmed || trimmed === session.name) return;
  session.name = trimmed;
  await api.renameSession(id, trimmed);
}

// ---------- Sidebar ----------

function renderSidebar(): void {
  if (renamingId) return;
  els.sessionList.replaceChildren(...sessions.map(renderSessionItem));
}

function renderSessionItem(session: SessionInfo): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'session-item';
  li.classList.toggle('active', session.id === activeId);
  li.classList.toggle('exited', views.get(session.id)?.exited ?? false);
  li.title = session.cwd;

  const status = document.createElement('span');
  status.className = 'status';

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = session.name;

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.title = 'Session schliessen (Ctrl+Shift+W)';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    void closeSession(session.id);
  });

  li.append(status, name, close);
  li.addEventListener('click', () => activate(session.id));
  li.addEventListener('dblclick', () => startRename(session.id));
  return li;
}

function startRename(id: string): void {
  const session = sessions.find((s) => s.id === id);
  const index = sessions.findIndex((s) => s.id === id);
  const nameEl = els.sessionList.children[index]?.querySelector('.name');
  if (!session || !nameEl) return;

  renamingId = id;
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = session.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (commit: boolean) => {
    if (done) return;
    done = true;
    if (commit) await renameSession(id, input.value);
    renamingId = null;
    renderSidebar();
    views.get(activeId ?? '')?.focus();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void finish(true);
    if (e.key === 'Escape') void finish(false);
  });
  input.addEventListener('blur', () => void finish(true));
}

function renderSettings(): void {
  els.btnDefaultCwd.textContent = settings.defaultCwd;
  els.btnDefaultCwd.title = `${settings.defaultCwd}\nKlicken zum Ändern`;
}

async function changeDefaultCwd(): Promise<void> {
  const dir = await api.pickDirectory(settings.defaultCwd);
  if (!dir) return;
  settings = await api.updateSettings({ defaultCwd: dir });
  renderSettings();
}

// ---------- Tastenkürzel ----------

/**
 * Prüft, ob die Taste ein App-Kürzel ist, und führt es aus.
 * Läuft in der Capture-Phase, also bevor xterm.js die Taste sieht.
 */
function handleShortcut(e: KeyboardEvent): boolean {
  if (e.altKey || e.metaKey) return false;
  const active = activeId ? views.get(activeId) : undefined;
  const combo = `${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.code}`;

  switch (combo) {
    case 'Ctrl+Shift+KeyT':
      void newSession();
      return true;
    case 'Ctrl+Shift+KeyW':
      if (activeId) void closeSession(activeId);
      return true;
    case 'Ctrl+Shift+KeyC':
      void active?.copySelection();
      return true;
    case 'Ctrl+Shift+KeyV':
      void active?.paste();
      return true;
    case 'Ctrl+Tab':
    case 'Ctrl+PageDown':
      activateRelative(1);
      return true;
    case 'Ctrl+Shift+Tab':
    case 'Ctrl+PageUp':
      activateRelative(-1);
      return true;
    case 'F2':
      if (activeId) startRename(activeId);
      return true;
  }

  // Ctrl+1 … Ctrl+9: direkt zur n-ten Session springen.
  const digit = /^Ctrl\+Digit([1-9])$/.exec(combo);
  if (digit) {
    const target = sessions[Number(digit[1]) - 1];
    if (target) activate(target.id);
    return true;
  }
  return false;
}

window.addEventListener(
  'keydown',
  (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (handleShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true,
);

// ---------- Start ----------

async function init(): Promise<void> {
  const state = await api.loadState();
  settings = state.settings;
  sessions = state.sessions;
  renderSettings();

  api.onPtyData((id, data) => views.get(id)?.write(data));
  api.onPtyExit((id, exitCode) => views.get(id)?.markExited(exitCode));

  els.btnNew.addEventListener('click', () => void newSession());
  els.btnNewEmpty.addEventListener('click', () => void newSession());
  els.btnDefaultCwd.addEventListener('click', () => void changeDefaultCwd());
  new ResizeObserver(() => views.get(activeId ?? '')?.fit()).observe(els.terminals);

  // Gespeicherte Sessions wiederherstellen: alle Shells starten, letzte aktive Session anzeigen.
  await Promise.all(sessions.map(openView));
  if (sessions.length === 0) {
    await newSession();
  } else {
    const restored = sessions.some((s) => s.id === state.activeSessionId);
    activate(restored ? state.activeSessionId : sessions[0].id);
  }
}

void init();
