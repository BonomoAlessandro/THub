// Gespeicherter Zustand (Schema Version 2) und die Übernahme aus Version 1.
// Gelesen wird tolerant: Unbrauchbare Felder fallen auf Standardwerte zurück, statt den Start zu verhindern.

import * as path from 'node:path';
import { barEntries } from '../../shared/barEntries';
import { FONT_SIZE, type AccountLimits, type KeepAwakeMode, type Settings, type Theme } from '../../shared/types';
import { rememberDir, samePath } from './folders';
import { gatherGroups } from './groups';
import { MAX_OPEN_POINTS } from './openPoints';
import type { Rect } from './ports';
import { normalizeAccountLimits } from './usage';

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
  /**
   * Offene Punkte aus Claudes Antwort, deren Hinweis noch steht (Ticket 22). Fehlt, sobald er mit × geschlossen ist; mit
   * einem geschlossenen Tab verschwindet er ebenfalls.
   */
  openPoints?: string[];
  /**
   * Die Gruppe, in der der Tab steht (Ticket 36); fehlt bei einem einzelnen Tab. Die Tabs einer Gruppe stehen in der
   * Liste zusammen, die Stelle der Gruppe ist die ihres ersten Tabs. Eine ältere THub kennt das Feld nicht und zeigt
   * alle Tabs einzeln.
   */
  groupId?: string;
}

/** Eine Gruppe von Tabs (Ticket 36), ohne neue Schema-Version; fehlt die Liste, gibt es keine Gruppen. */
export interface PersistedGroup {
  id: string;
  name: string;
  /** Der gewählte Tab: der zuletzt angezeigte Tab der Gruppe. */
  selectedTabId: string;
}

/** Wohin ein geschlossener Tab beim Wiederöffnen zurückkehrt (Ticket 36). */
export interface ClosedTabGroup {
  /** Kennung der Gruppe; gibt es sie noch, kommt der Tab in sie zurück. */
  id: string;
  /** Name der Gruppe; gibt es sie nicht mehr, entsteht sie mit diesem Namen neu. */
  name: string;
  /** Stelle des Tabs in der Gruppe beim Schliessen, ab 0. */
  position: number;
}

/** Ein geschlossener Tab, der sich wieder öffnen lässt (Ticket 15). */
export interface ClosedTab {
  tab: PersistedTab;
  /** Position in der Liste der Tabs beim Schliessen. */
  index: number;
  closedAt: number;
  /** Die Gruppe, in der der Tab stand (Ticket 36); fehlt, wenn er einzeln stand. */
  group?: ClosedTabGroup;
}

export interface WindowState {
  /** Grösse und Position im normalen, nicht maximierten Zustand. */
  bounds: Rect;
  maximized: boolean;
}

export interface PersistedState {
  version: 2;
  settings: Settings;
  /** Geordnet wie in der Oberfläche; die Tabs einer Gruppe stehen zusammen. */
  tabs: PersistedTab[];
  /** Die Gruppen (Ticket 36), jede mit mindestens einem Tab; ihre Stelle ergibt sich aus `tabs`. */
  groups: PersistedGroup[];
  activeTabId: string | null;
  /** Zuletzt benutzte Ordner, neueste zuerst, ohne Doppelte (Ticket 05). */
  recentDirs: string[];
  /** Zuletzt geschlossene Tabs, neueste zuerst (Ticket 15). */
  closedTabs: ClosedTab[];
  /** Fensterangaben (Ticket 09). */
  window?: WindowState;
  /**
   * Der letzte Stand der Limits des Claude-Kontos für den Verbrauchsbalken (Ticket 38), ohne neue Schema-Version; fehlt,
   * solange es keinen gibt. Eine ältere THub kennt das Feld nicht und lässt es weg. Modell und Kosten pro Tab werden
   * nicht gespeichert.
   */
  usageLimits?: AccountLimits;
}

export const MAX_CLOSED_TABS = 10;
const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const KEEP_AWAKE_MODES: readonly KeepAwakeMode[] = ['system', 'display'];

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
    groups: [],
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
      ? Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(s.fontSize)))
      : FONT_SIZE.default,
    notifications: typeof s.notifications === 'boolean' ? s.notifications : true,
    openPoints: typeof s.openPoints === 'boolean' ? s.openPoints : true,
    // Fehlen die Angaben (Zustand von vor Ticket 28), gilt aus und „nur Rechner“, ohne neue Schema-Version.
    keepAwake: typeof s.keepAwake === 'boolean' ? s.keepAwake : false,
    keepAwakeMode: KEEP_AWAKE_MODES.includes(s.keepAwakeMode as KeepAwakeMode)
      ? (s.keepAwakeMode as KeepAwakeMode)
      : 'system',
    // Fehlt die Angabe (Zustand von vor Ticket 38), ist der Verbrauchsbalken an, ohne neue Schema-Version.
    usageBar: typeof s.usageBar === 'boolean' ? s.usageBar : true,
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
  const activeTabId = validActiveTabId(raw.activeTabId, tabs);
  const grouped = normalizeGroups(raw.groups, tabs, activeTabId);

  const state: PersistedState = {
    version: 2,
    settings: normalizeSettings(raw.settings),
    tabs: grouped.tabs,
    groups: grouped.groups,
    activeTabId,
    // Von hinten eingereiht, damit die Reihenfolge bleibt; Doppelte und alles über acht fallen weg.
    recentDirs: (Array.isArray(raw.recentDirs) ? raw.recentDirs : [])
      .filter(isNonEmptyString)
      .reduceRight<string[]>(rememberDir, []),
    closedTabs: normalizeClosedTabs(raw.closedTabs, seen, ctx),
  };
  const window = normalizeWindow(raw.window);
  if (window) state.window = window;
  const usageLimits = normalizeAccountLimits(raw.usageLimits);
  if (usageLimits) state.usageLimits = usageLimits;
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
  const openPoints = normalizeOpenPoints(raw.openPoints);
  if (openPoints) tab.openPoints = openPoints;
  if (isNonEmptyString(raw.groupId)) tab.groupId = raw.groupId;
  return tab;
}

/**
 * Die Gruppen (Ticket 36), tolerant gelesen; fehlt die Liste (Zustand einer älteren THub), gibt es keine. Ein Tab mit
 * unbekannter Gruppe wird ein einzelner Tab. Verstreute Tabs einer Gruppe rücken an die Stelle des ersten. Eine Gruppe
 * ohne Tabs entfällt. Ein ungültiger gewählter Tab wird der erste der Gruppe; steht der aktive Tab in einer Gruppe, ist
 * er ihr gewählter Tab. Die Gruppen stehen danach in der Reihenfolge der Leiste.
 */
function normalizeGroups(
  raw: unknown,
  tabs: PersistedTab[],
  activeTabId: string | null,
): { tabs: PersistedTab[]; groups: PersistedGroup[] } {
  const known = new Map<string, PersistedGroup>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item) || !isNonEmptyString(item.id) || known.has(item.id)) continue;
    known.set(item.id, {
      id: item.id,
      name: isNonEmptyString(item.name) ? item.name : 'Gruppe',
      selectedTabId: typeof item.selectedTabId === 'string' ? item.selectedTabId : '',
    });
  }
  for (const tab of tabs) {
    if (tab.groupId !== undefined && !known.has(tab.groupId)) delete tab.groupId;
  }
  const ordered = gatherGroups(tabs);
  const groups: PersistedGroup[] = [];
  for (const entry of barEntries(ordered)) {
    if (entry.kind !== 'group') continue;
    const group = known.get(entry.groupId);
    if (!group) continue;
    const ids = entry.tabs.map((t) => t.id);
    if (activeTabId !== null && ids.includes(activeTabId)) group.selectedTabId = activeTabId;
    else if (!ids.includes(group.selectedTabId)) group.selectedTabId = ids[0];
    groups.push(group);
  }
  return { tabs: ordered, groups };
}

/** Offene Punkte eines Tabs: nur Texte, höchstens so viele, wie die Erkennung liefert; ohne Punkte keine. */
function normalizeOpenPoints(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const points = raw.filter(isNonEmptyString).slice(0, MAX_OPEN_POINTS);
  return points.length > 0 ? points : null;
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

/**
 * Die zuletzt geschlossenen Tabs, höchstens zehn. Ein Tab ist entweder offen oder geschlossen, und das nur einmal:
 * Einträge mit der Kennung eines offenen Tabs (`openIds`) oder eines früheren Eintrags fallen weg.
 */
function normalizeClosedTabs(raw: unknown, openIds: Set<string>, ctx: SchemaContext): ClosedTab[] {
  const seen = new Set(openIds);
  const result: ClosedTab[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const entry = normalizeClosedTab(item, ctx);
    if (!entry || seen.has(entry.tab.id)) continue;
    seen.add(entry.tab.id);
    result.push(entry);
  }
  return result.slice(0, MAX_CLOSED_TABS);
}

function normalizeClosedTab(raw: unknown, ctx: SchemaContext): ClosedTab | null {
  if (!isRecord(raw)) return null;
  const tab = normalizeTab(raw.tab, ctx);
  if (!tab) return null;
  // Seine Gruppe merkt sich ein geschlossener Tab in `group`, nicht am Tab.
  delete tab.groupId;
  const entry: ClosedTab = {
    tab,
    index: isFiniteNumber(raw.index) ? Math.max(0, Math.round(raw.index)) : 0,
    closedAt: isFiniteNumber(raw.closedAt) ? raw.closedAt : 0,
  };
  const group = normalizeClosedTabGroup(raw.group);
  if (group) entry.group = group;
  return entry;
}

/** Die Gruppe eines geschlossenen Tabs (Ticket 36); ohne brauchbare Kennung und Namen keine: Er kommt einzeln zurück. */
function normalizeClosedTabGroup(raw: unknown): ClosedTabGroup | null {
  if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) return null;
  return {
    id: raw.id,
    name: raw.name,
    position: isFiniteNumber(raw.position) ? Math.max(0, Math.round(raw.position)) : 0,
  };
}

/** Prüft Fensterangaben; ohne brauchbare Grösse und Position gibt es keine (`null`). */
export function normalizeWindow(raw: unknown): WindowState | null {
  if (!isRecord(raw) || !isRecord(raw.bounds)) return null;
  const { x, y, width, height } = raw.bounds;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  const bounds = {
    x: Math.round(x as number),
    y: Math.round(y as number),
    width: Math.round(width as number),
    height: Math.round(height as number),
  };
  if (bounds.width < 1 || bounds.height < 1) return null;
  return { bounds, maximized: raw.maximized === true };
}

// ---------- Hilfen ----------

function validActiveTabId(raw: unknown, tabs: PersistedTab[]): string | null {
  if (typeof raw === 'string' && tabs.some((t) => t.id === raw)) return raw;
  return tabs[0]?.id ?? null;
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
