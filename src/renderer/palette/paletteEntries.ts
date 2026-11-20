// Einträge der Befehlspalette: Tabs und Befehle, dazu die Unterlisten „Neues Terminal in …“ und „Zuletzt geschlossen“.
// Ohne DOM, damit sich prüfen lässt, dass jeder Befehl dasselbe bewirkt wie über Maus oder Tastenkürzel.

import type { ClosedTabInfo, RecentDir, TabKind, TabSnapshot, TabStatus } from '../../shared/types';
import { closeOtherTabs, closeTab, newTab, pickDefaultFolder, pickFolderForNewTab, showTab } from '../commands';
import { shortcutHint } from '../shortcuts';
import { focusTerminal } from '../terminal/terminalViews';
import type { SearchGroup } from './search';

const api = window.thub;

/** Was die Palette zeigt: Tabs und Befehle oder eine der Unterlisten. */
export type PaletteMode = 'root' | 'folders' | 'closed';

/** Symbol eines Befehls (siehe `Palette.tsx`). */
export type PaletteIcon =
  | 'plus'
  | 'folder'
  | 'folderPlus'
  | 'folderOpen'
  | 'pencil'
  | 'close'
  | 'closeOthers'
  | 'history'
  | 'sliders'
  | 'keyboard';

export interface PaletteItem {
  /** Eindeutig in der Palette. */
  id: string;
  label: string;
  /** Kleiner daneben, z.B. der Ordner eines Tabs; die Suche findet ihn auch. */
  detail?: string;
  /** Ein Tab: Art und Status für das Symbol wie in der Tab-Leiste. */
  tab?: { kind: TabKind; status: TabStatus };
  /** Symbol eines Befehls. */
  icon?: PaletteIcon;
  /** Tastenkürzel desselben Befehls, als Hinweis rechts; aus der Tabelle der Tastenkürzel. */
  hint?: string;
  /** Öffnet diese Unterliste, statt etwas auszuführen. */
  opens?: Exclude<PaletteMode, 'root'>;
  /** Führt den Eintrag aus; die Palette ist dann schon geschlossen und der Fokus im Terminal. */
  run?(): void;
}

export type PaletteGroup = SearchGroup<PaletteItem>;

/** Was die Befehle der Palette brauchen. */
export interface PaletteContext {
  tabs: TabSnapshot[];
  activeTabId: string | null;
  /** Den Namen dieses Tabs bearbeiten (wie `F2`). */
  startRename(tabId: string): void;
  openSettings(): void;
  openShortcuts(): void;
}

/** Tabs und Befehle, wie im Prototyp. Was einen aktiven Tab bzw. einen zweiten Tab braucht, fehlt ohne ihn. */
export function rootGroups(ctx: PaletteContext): PaletteGroup[] {
  const active = ctx.activeTabId;
  const commands: (PaletteItem | false)[] = [
    { id: 'newTab', icon: 'plus', label: 'Neues Terminal', hint: shortcutHint('newTab'), run: newTab },
    { id: 'newTabIn', icon: 'folder', label: 'Neues Terminal in …', opens: 'folders' },
    active !== null && {
      id: 'rename',
      icon: 'pencil',
      label: 'Tab umbenennen',
      hint: shortcutHint('renameTab'),
      run: () => ctx.startRename(active),
    },
    active !== null && {
      id: 'close',
      icon: 'close',
      label: 'Tab schliessen',
      hint: shortcutHint('closeTab'),
      run: () => closeTab(active),
    },
    active !== null &&
      ctx.tabs.length > 1 && {
        id: 'closeOthers',
        icon: 'closeOthers',
        label: 'Andere Tabs schliessen',
        run: () => closeOtherTabs(active),
      },
    {
      id: 'closed',
      icon: 'history',
      label: 'Zuletzt geschlossen …',
      hint: shortcutHint('reopenTab'),
      opens: 'closed',
    },
    { id: 'settings', icon: 'sliders', label: 'Einstellungen', run: ctx.openSettings },
    {
      id: 'defaultFolder',
      icon: 'folderOpen',
      label: 'Standardordner ändern',
      // Wie „Ändern …“ in den Einstellungen; danach zurück ins Terminal.
      run: () => void pickDefaultFolder().then(() => focusTerminal(active)),
    },
    { id: 'shortcuts', icon: 'keyboard', label: 'Tastenkürzel anzeigen', run: ctx.openShortcuts },
  ];
  return [
    {
      title: 'Tabs',
      items: ctx.tabs.map((tab) => ({
        id: `tab:${tab.id}`,
        label: tab.name,
        detail: tab.cwd,
        tab: { kind: tab.kind, status: tab.status },
        run: () => showTab(tab.id, active),
      })),
    },
    { title: 'Befehle', items: commands.filter((c): c is PaletteItem => c !== false) },
  ];
}

/** „Neues Terminal in …“: die zuletzt benutzten Ordner und „Ordner wählen …“, wie im Pfeil-Menü. */
export function folderGroups(recentDirs: RecentDir[]): PaletteGroup[] {
  return [
    {
      title: 'Neues Terminal in …',
      items: [
        ...recentDirs.map(
          (dir): PaletteItem => ({
            id: `dir:${dir.path}`,
            icon: 'folder',
            label: dir.name,
            detail: dir.path,
            run: () => api.send({ type: 'createTab', cwd: dir.path }),
          }),
        ),
        { id: 'pickFolder', icon: 'folderPlus', label: 'Ordner wählen …', run: () => void pickFolderForNewTab() },
      ],
    },
  ];
}

/** „Zuletzt geschlossen“: die geschlossenen Tabs, neueste zuerst; die Wahl öffnet genau diesen Tab wieder. */
export function closedGroups(closed: ClosedTabInfo[]): PaletteGroup[] {
  return [
    {
      title: 'Zuletzt geschlossen',
      items: closed.map(
        (entry): PaletteItem => ({
          id: `closed:${entry.id}`,
          label: entry.name,
          detail: entry.cwd,
          tab: { kind: entry.kind, status: 'idle' },
          run: () => api.send({ type: 'reopenClosedTab', tabId: entry.id }),
        }),
      ),
    },
  ];
}
