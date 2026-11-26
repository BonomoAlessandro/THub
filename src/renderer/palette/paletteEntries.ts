// Einträge der Befehlspalette: Tabs und Befehle, dazu die Unterlisten „Neues Terminal in …“ und „Zuletzt geschlossen“.
// Ohne DOM, damit sich prüfen lässt, dass jeder Befehl dasselbe bewirkt wie über Maus oder Tastenkürzel.

import type {
  ClosedTabInfo,
  GroupSnapshot,
  KeepAwakeMode,
  RecentDir,
  TabKind,
  TabSnapshot,
  TabStatus,
} from '../../shared/types';
import {
  closeOtherTabs,
  closeTab,
  copyVersion,
  createGroup,
  dissolveGroup,
  keepAwake,
  newTab,
  pickDefaultFolder,
  pickFolderForNewTab,
  removeFromGroup,
  setKeepAwake,
  showTab,
} from '../commands';
import { shortcutHint } from '../shortcuts';
import { groupedName, tabLabel } from '../tabs/tabLabel';
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
  | 'keyboard'
  | 'coffee'
  | 'monitor'
  | 'copy'
  | 'folderOutput'
  | 'ungroup';

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
  /** Die Gruppen (Ticket 36): Tabs darin heissen „Gruppenname › Tabname“. */
  groups: GroupSnapshot[];
  activeTabId: string | null;
  /** Den Namen dieses Tabs bearbeiten (wie `F2`). */
  startRename(tabId: string): void;
  /** Den Namen dieser Gruppe bearbeiten (wie ein Doppelklick auf den Gruppen-Tab). */
  startRenameGroup(groupId: string): void;
  openSettings(): void;
  openShortcuts(): void;
  /** Rechner wach halten an/aus und die gewählte Stufe (Ticket 28). */
  keepAwake: { on: boolean; mode: KeepAwakeMode };
}

/**
 * Tabs und Befehle, wie im Prototyp. Was einen aktiven Tab bzw. einen zweiten Tab braucht, fehlt ohne ihn. Tabs in einer
 * Gruppe heissen „Gruppenname › Tabname“, so trifft die Suche auch den Namen der Gruppe; die Befehle zu Gruppen
 * (Ticket 36) erscheinen nur, wo sie zum aktiven Tab passen.
 */
export function rootGroups(ctx: PaletteContext): PaletteGroup[] {
  const active = ctx.activeTabId;
  const activeTab = ctx.tabs.find((t) => t.id === active);
  const activeGroup = activeTab?.groupId === undefined ? undefined : ctx.groups.find((g) => g.id === activeTab.groupId);
  // In einer Gruppe schliesst „Andere Tabs schliessen“ nur die anderen Tabs dieser Gruppe.
  const others = activeGroup ? activeGroup.tabIds.length - 1 : ctx.tabs.length - 1;
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
      others > 0 && {
        id: 'closeOthers',
        icon: 'closeOthers',
        label: 'Andere Tabs schliessen',
        run: () => closeOtherTabs(active),
      },
    // Wie im Rechtsklick-Menü am Tab bzw. am Gruppen-Tab.
    activeTab !== undefined &&
      activeGroup === undefined && {
        id: 'createGroup',
        icon: 'folderPlus',
        label: 'Neue Gruppe',
        run: () => createGroup(activeTab.id),
      },
    activeTab !== undefined &&
      activeGroup !== undefined && {
        id: 'removeFromGroup',
        icon: 'folderOutput',
        label: 'Aus Gruppe nehmen',
        run: () => removeFromGroup(activeTab.id),
      },
    activeGroup !== undefined && {
      id: 'renameGroup',
      icon: 'pencil',
      label: 'Gruppe umbenennen',
      run: () => ctx.startRenameGroup(activeGroup.id),
    },
    activeGroup !== undefined && {
      id: 'dissolveGroup',
      icon: 'ungroup',
      label: 'Gruppe auflösen',
      run: () => dissolveGroup(activeGroup.id),
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
    // Wie ein Klick auf die Versionszeile in den Einstellungen (Ticket 30).
    { id: 'copyVersion', icon: 'copy', label: 'Version kopieren', run: () => void copyVersion() },
    // Wie das Pfeil-Menü am Schalter: Stufe setzen und einschalten. Kein Tastenkürzel.
    { id: 'keepAwake', icon: 'coffee', label: 'Rechner wach halten', run: () => keepAwake('system') },
    {
      id: 'keepAwakeDisplay',
      icon: 'monitor',
      label: 'Rechner und Bildschirm wach halten',
      run: () => keepAwake('display'),
    },
    ctx.keepAwake.on && {
      id: 'keepAwakeOff',
      icon: ctx.keepAwake.mode === 'display' ? 'monitor' : 'coffee',
      label: 'Wachhalten beenden',
      run: () => setKeepAwake(false),
    },
  ];
  return [
    {
      title: 'Tabs',
      items: ctx.tabs.map((tab) => ({
        id: `tab:${tab.id}`,
        label: tabLabel(tab, ctx.groups),
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

/**
 * „Zuletzt geschlossen“: die geschlossenen Tabs, neueste zuerst; die Wahl öffnet genau diesen Tab wieder. Ein Tab, der
 * in eine Gruppe zurückkehrt, heisst „Gruppenname › Tabname“.
 */
export function closedGroups(closed: ClosedTabInfo[]): PaletteGroup[] {
  return [
    {
      title: 'Zuletzt geschlossen',
      items: closed.map(
        (entry): PaletteItem => ({
          id: `closed:${entry.id}`,
          label: groupedName(entry.groupName, entry.name),
          detail: entry.cwd,
          tab: { kind: entry.kind, status: 'idle' },
          run: () => api.send({ type: 'reopenClosedTab', tabId: entry.id }),
        }),
      ),
    },
  ];
}
