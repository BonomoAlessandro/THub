import '@xterm/xterm/css/xterm.css';
import './styles.css';
import type { Settings, TabSnapshot, WorkspaceEvent } from '../shared/types';
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

// Anzeige-Zustand, so wie ihn der Kern zuletzt gemeldet hat.
let tabs: TabSnapshot[] = [];
let activeId: string | null = null;
let settings: Settings;
let homeDir = '';
/** Erst nach dem Schnappschuss werden Ereignisse angewendet; frühere stecken schon darin. */
let loaded = false;
/** Tab, dessen Ansicht gerade sichtbar ist. */
let shownId: string | null = null;
/** Tab, dessen Name gerade inline bearbeitet wird (dann wird die Liste nicht neu gezeichnet). */
let renamingId: string | null = null;
const views = new Map<string, TerminalView>();

// ---------- Zustand vom Kern ----------

function handleEvent(event: WorkspaceEvent): void {
  if (!loaded) return;
  switch (event.type) {
    case 'tabs':
      applyTabs(event.tabs, event.activeTabId);
      return;
    case 'settings':
      settings = event.settings;
      renderSettings();
      return;
    case 'output':
      views.get(event.tabId)?.write(event.data);
      return;
    case 'exit':
      views.get(event.tabId)?.markExited(event.exitCode);
      return;
    case 'notice':
      views.get(event.tabId)?.notice(event.level, event.text);
      return;
  }
}

/** Gleicht die Ansichten mit den Tabs des Kerns ab. */
function applyTabs(nextTabs: TabSnapshot[], nextActiveId: string | null): void {
  tabs = nextTabs;
  activeId = nextActiveId;

  const ids = new Set(tabs.map((t) => t.id));
  for (const [id, view] of views) {
    if (ids.has(id)) continue;
    view.dispose();
    views.delete(id);
    if (shownId === id) shownId = null;
  }

  const created: TerminalView[] = [];
  for (const tab of tabs) {
    let view = views.get(tab.id);
    if (!view) {
      view = new TerminalView(tab.id, els.terminals);
      views.set(tab.id, view);
      created.push(view);
    }
    view.setExited(tab.process === 'exited');
  }

  if (shownId !== activeId) {
    for (const [id, view] of views) view.setActive(id === activeId);
    shownId = activeId;
  }
  // Erst jetzt, mit sichtbarer aktiver Ansicht, melden neue Ansichten „bereit“; dann startet der Kern die Shell.
  for (const view of created) view.reportReady();

  els.emptyState.hidden = tabs.length > 0;
  renderSidebar();
}

// ---------- Befehle ----------

function newTab(): void {
  api.send({ type: 'createTab' });
}

function closeTab(id: string): void {
  api.send({ type: 'closeTab', tabId: id });
}

function activate(id: string): void {
  if (id === activeId) views.get(id)?.focus();
  else api.send({ type: 'activateTab', tabId: id });
}

function activateRelative(offset: number): void {
  if (tabs.length === 0) return;
  const index = tabs.findIndex((t) => t.id === activeId);
  const next = (index + offset + tabs.length) % tabs.length;
  activate(tabs[next].id);
}

function renameTab(id: string, name: string): void {
  const trimmed = name.trim();
  const tab = tabs.find((t) => t.id === id);
  if (!tab || !trimmed || trimmed === tab.name) return;
  // Sofort anzeigen; der Kern bestätigt mit dem nächsten Ereignis.
  tab.name = trimmed;
  api.send({ type: 'renameTab', tabId: id, name: trimmed });
}

// ---------- Sidebar ----------

function renderSidebar(): void {
  if (renamingId) return;
  els.sessionList.replaceChildren(...tabs.map(renderTabItem));
}

function renderTabItem(tab: TabSnapshot): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'session-item';
  li.classList.toggle('active', tab.id === activeId);
  li.classList.toggle('exited', tab.process === 'exited');
  li.title = tab.cwd;

  const status = document.createElement('span');
  status.className = 'status';

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = tab.name;

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.title = 'Session schliessen (Ctrl+Shift+W)';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tab.id);
  });

  li.append(status, name, close);
  li.addEventListener('click', () => activate(tab.id));
  li.addEventListener('dblclick', () => startRename(tab.id));
  return li;
}

function startRename(id: string): void {
  const tab = tabs.find((t) => t.id === id);
  const index = tabs.findIndex((t) => t.id === id);
  const nameEl = els.sessionList.children[index]?.querySelector('.name');
  if (!tab || !nameEl) return;

  renamingId = id;
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = tab.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    if (commit) renameTab(id, input.value);
    renamingId = null;
    renderSidebar();
    views.get(activeId ?? '')?.focus();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

/** Der Standardordner, wie er wirkt: leer heisst Benutzerordner. */
function effectiveDefaultCwd(): string {
  return settings.defaultCwd || homeDir;
}

function renderSettings(): void {
  const dir = effectiveDefaultCwd();
  els.btnDefaultCwd.textContent = dir;
  els.btnDefaultCwd.title = `${dir}\nKlicken zum Ändern`;
}

async function changeDefaultCwd(): Promise<void> {
  const dir = await api.pickDirectory(effectiveDefaultCwd());
  if (!dir) return;
  api.send({ type: 'updateSettings', patch: { defaultCwd: dir } });
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
      newTab();
      return true;
    case 'Ctrl+Shift+KeyW':
      if (activeId) closeTab(activeId);
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

  // Ctrl+1 … Ctrl+9: direkt zum n-ten Tab springen.
  const digit = /^Ctrl\+Digit([1-9])$/.exec(combo);
  if (digit) {
    const target = tabs[Number(digit[1]) - 1];
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
  // Zuerst abonnieren, dann den Schnappschuss holen: So geht kein Ereignis verloren.
  api.onEvent(handleEvent);
  const snapshot = await api.loadSnapshot();
  settings = snapshot.settings;
  homeDir = snapshot.homeDir;
  renderSettings();

  els.btnNew.addEventListener('click', newTab);
  els.btnNewEmpty.addEventListener('click', newTab);
  els.btnDefaultCwd.addEventListener('click', () => void changeDefaultCwd());
  new ResizeObserver(() => views.get(activeId ?? '')?.fit()).observe(els.terminals);

  // Die gespeicherten Tabs zeigen; ihre Shells startet der Kern, sobald die Ansichten bereit sind.
  loaded = true;
  applyTabs(snapshot.tabs, snapshot.activeTabId);
}

void init();
