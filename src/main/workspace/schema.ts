// Gespeicherter Zustand (Schema Version 2) und die Übernahme aus Version 1.
// Gelesen wird tolerant: Unbrauchbare Felder fallen auf Standardwerte zurück, statt den Start zu verhindern.

import * as path from 'node:path';
import type { Settings, Theme } from '../../shared/types';
import type { Rect } from './ports';

/** Claude-Zuordnung eines Tabs, soweit sie gespeichert wird (Ticket 10). */
export interface PersistedClaudeLink {
  /** Session-Kennung; fehlt, solange Claude sie noch nicht gemeldet hat. */
  sessionId?: string;
  /** Ordner der Session. */
  cwd: string;
  /** Per Hook bestätigt, im Gegensatz zu nur vom Starter erwartet. */
  confirmed: boolean;
  hadPrompt: boolean;
}

export interface PersistedTab {
  id: string;
  name: string;
  /** Name von Hand vergeben; wird nie automatisch überschrieben. */
  nameIsManual: boolean;
  shellId: string;
  /** Ordner, in dem der Tab angelegt wurde. */
  startCwd: string;
  /** Zuletzt aktiver Ordner, von der Shell-Integration gemeldet (Ticket 07). */
  lastCwd?: string;
  /** Nur bei Claude-Tabs. */
  claude?: PersistedClaudeLink;
}

/** Ein geschlossener Tab, der sich wieder öffnen lässt (Ticket 15). */
export interface ClosedTab {
  tab: PersistedTab;
  /** Position in der Tab-Leiste beim Schliessen. */
  index: number;
  closedAt: number;
}

export interface WindowState {
  /** Grösse und Position im normalen, nicht maximierten Zustand. */
  bounds: Rect;
  maximized: boolean;
}

export interface PersistedState {
  version: 2;
  settings: Settings;
  /** Geordnet wie in der Oberfläche. */
  tabs: PersistedTab[];
  activeTabId: string | null;
  /** Zuletzt benutzte Ordner, neueste zuerst, ohne Doppelte (Ticket 05). */
  recentDirs: string[];
  /** Zuletzt geschlossene Tabs, neueste zuerst (Ticket 15). */
  closedTabs: ClosedTab[];
  /** Fensterangaben (Ticket 09). */
  window?: WindowState;
}

export const MAX_RECENT_DIRS = 8;
export const MAX_CLOSED_TABS = 10;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;
const DEFAULT_FONT_SIZE = 14;
const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

/** Was das Lesen des Zustands von der Umgebung braucht. */
export interface SchemaContext {
  homeDir: string;
  /** Kennung der Standard-Shell, für übernommene Tabs ohne abbildbare Shell. */
  defaultShellId: string;
}

export interface LoadedState {
  state: PersistedState;
  /** Der Zustand wurde aus Version 1 übernommen und sollte als Version 2 gespeichert werden. */
  migrated: boolean;
}

export function emptyState(): PersistedState {
  return {
    version: 2,
    settings: normalizeSettings(undefined),
    tabs: [],
    activeTabId: null,
    recentDirs: [],
    closedTabs: [],
  };
}

/** Macht aus dem rohen Inhalt der Zustandsdatei einen gültigen Zustand der Version 2. */
export function readPersistedState(raw: unknown, ctx: SchemaContext): LoadedState {
  if (!isRecord(raw)) return { state: emptyState(), migrated: false };
  if (raw.version === 1 || (raw.version === undefined && Array.isArray(raw.sessions))) {
    return { state: migrateFromV1(raw, ctx), migrated: true };
  }
  return { state: normalizeV2(raw, ctx), migrated: false };
}

/** Prüft Einstellungen feldweise; Unbrauchbares wird durch den Standardwert ersetzt. */
export function normalizeSettings(raw: unknown): Settings {
  const s = isRecord(raw) ? raw : {};
  const settings: Settings = {
    defaultCwd: typeof s.defaultCwd === 'string' ? s.defaultCwd.trim() : '',
    theme: THEMES.includes(s.theme as Theme) ? (s.theme as Theme) : 'system',
    fontSize: isFiniteNumber(s.fontSize)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(s.fontSize)))
      : DEFAULT_FONT_SIZE,
    notifications: typeof s.notifications === 'boolean' ? s.notifications : true,
  };
  if (isNonEmptyString(s.defaultShellId)) settings.defaultShellId = s.defaultShellId;
  return settings;
}

// ---------- Übernahme aus Version 1 ----------

/** Shell-Abbildung aus Version 1: `settings.shell` → Shell-Kennung. */
const V1_SHELLS: Record<string, string> = {
  'pwsh.exe': 'pwsh',
  'powershell.exe': 'powershell',
  'cmd.exe': 'cmd',
};

function migrateFromV1(raw: Record<string, unknown>, ctx: SchemaContext): PersistedState {
  const v1Settings = isRecord(raw.settings) ? raw.settings : {};
  const v1Shell = typeof v1Settings.shell === 'string' ? v1Settings.shell.trim() : '';
  // Volle Pfade wie "C:\…\pwsh.exe" zählen wie der Programmname.
  const mappedShell = V1_SHELLS[path.win32.basename(v1Shell).toLowerCase()];
  const defaultCwd = typeof v1Settings.defaultCwd === 'string' ? v1Settings.defaultCwd.trim() : '';

  const settings = normalizeSettings({
    // Ein Standardordner gleich dem Benutzerordner wird zu „leer“ (= Benutzerordner).
    defaultCwd: defaultCwd && samePath(defaultCwd, ctx.homeDir) ? '' : defaultCwd,
    // Nicht abbildbare Shells: keine eigene Einstellung, es gilt die Standard-Shell.
    defaultShellId: mappedShell,
  });

  const tabs: PersistedTab[] = [];
  const seen = new Set<string>();
  for (const session of Array.isArray(raw.sessions) ? raw.sessions : []) {
    if (!isRecord(session) || !isNonEmptyString(session.id) || seen.has(session.id)) continue;
    seen.add(session.id);
    tabs.push({
      id: session.id,
      name: isNonEmptyString(session.name) ? session.name : `Terminal ${tabs.length + 1}`,
      // Namen aus Version 1 bleiben unverändert, auch wenn sich die Namensregeln ändern.
      nameIsManual: true,
      shellId: mappedShell ?? ctx.defaultShellId,
      startCwd: typeof session.cwd === 'string' ? session.cwd : '',
    });
  }

  return {
    ...emptyState(),
    settings,
    tabs,
    activeTabId: validActiveTabId(raw.activeSessionId, tabs),
  };
}

// ---------- Version 2 ----------

function normalizeV2(raw: Record<string, unknown>, ctx: SchemaContext): PersistedState {
  const tabs: PersistedTab[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.tabs) ? raw.tabs : []) {
    const tab = normalizeTab(item, ctx);
    if (!tab || seen.has(tab.id)) continue;
    seen.add(tab.id);
    tabs.push(tab);
  }

  const state: PersistedState = {
    version: 2,
    settings: normalizeSettings(raw.settings),
    tabs,
    activeTabId: validActiveTabId(raw.activeTabId, tabs),
    recentDirs: (Array.isArray(raw.recentDirs) ? raw.recentDirs : [])
      .filter(isNonEmptyString)
      .slice(0, MAX_RECENT_DIRS),
    closedTabs: (Array.isArray(raw.closedTabs) ? raw.closedTabs : [])
      .map((item) => normalizeClosedTab(item, ctx))
      .filter((item): item is ClosedTab => item !== null)
      .slice(0, MAX_CLOSED_TABS),
  };
  const window = normalizeWindow(raw.window);
  if (window) state.window = window;
  return state;
}

function normalizeTab(raw: unknown, ctx: SchemaContext): PersistedTab | null {
  if (!isRecord(raw) || !isNonEmptyString(raw.id)) return null;
  const tab: PersistedTab = {
    id: raw.id,
    name: isNonEmptyString(raw.name) ? raw.name : 'Terminal',
    nameIsManual: raw.nameIsManual === true,
    shellId: isNonEmptyString(raw.shellId) ? raw.shellId : ctx.defaultShellId,
    startCwd: typeof raw.startCwd === 'string' ? raw.startCwd : '',
  };
  if (isNonEmptyString(raw.lastCwd)) tab.lastCwd = raw.lastCwd;
  const claude = normalizeClaudeLink(raw.claude);
  if (claude) tab.claude = claude;
  return tab;
}

function normalizeClaudeLink(raw: unknown): PersistedClaudeLink | null {
  if (!isRecord(raw)) return null;
  const link: PersistedClaudeLink = {
    cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
    confirmed: raw.confirmed === true,
    hadPrompt: raw.hadPrompt === true,
  };
  if (isNonEmptyString(raw.sessionId)) link.sessionId = raw.sessionId;
  return link;
}

function normalizeClosedTab(raw: unknown, ctx: SchemaContext): ClosedTab | null {
  if (!isRecord(raw)) return null;
  const tab = normalizeTab(raw.tab, ctx);
  if (!tab) return null;
  return {
    tab,
    index: isFiniteNumber(raw.index) ? Math.max(0, Math.round(raw.index)) : 0,
    closedAt: isFiniteNumber(raw.closedAt) ? raw.closedAt : 0,
  };
}

function normalizeWindow(raw: unknown): WindowState | null {
  if (!isRecord(raw) || !isRecord(raw.bounds)) return null;
  const { x, y, width, height } = raw.bounds;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  return {
    bounds: { x: x as number, y: y as number, width: width as number, height: height as number },
    maximized: raw.maximized === true,
  };
}

// ---------- Hilfen ----------

function validActiveTabId(raw: unknown, tabs: PersistedTab[]): string | null {
  if (typeof raw === 'string' && tabs.some((t) => t.id === raw)) return raw;
  return tabs[0]?.id ?? null;
}

/** Vergleicht Windows-Pfade ohne Rücksicht auf Gross-/Kleinschreibung und abschliessende Trenner. */
function samePath(a: string, b: string): boolean {
  const key = (p: string) => path.win32.normalize(p).replace(/[\\/]+$/, '').toLowerCase();
  return key(a) === key(b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
