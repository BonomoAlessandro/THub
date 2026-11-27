import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { barEntries } from '../../shared/barEntries';
import type { GroupSnapshot, KeepAwakeMode, RecentDir, ShellOption, TabSnapshot } from '../../shared/types';
import { setKeepAwake } from '../commands';
import { ChevronIcon, GearIcon, PlusIcon } from '../icons';
import { Menu, type MenuPoint } from '../popup/Menu';
import { focusTerminal } from '../terminal/terminalViews';
import { groupTipRows } from './groupLabels';
import { groupListEntries, groupMenuEntries } from './groupMenu';
import { GroupTab, type GroupRenaming } from './GroupTab';
import { keepAwakeMenuEntries, KeepAwakeModeIcon, keepAwakeTooltip } from './keepAwakeMenu';
import { newTabMenuEntries } from './newTabMenu';
import { Tab } from './Tab';
import { STATUS_TEXT } from './TabIcon';
import { tabMenuEntries } from './tabMenu';
import { Tooltip } from './Tooltip';
import { useTabDrag } from './useTabDrag';

const api = window.thub;

/** So lange liegt die Maus auf einem Element, bis sein Tooltip erscheint. */
const TOOLTIP_DELAY_MS = 550;
/** Breite der weichen Kanten der Leiste bei Überlauf; ein angesteuerter Tab rückt ganz heraus. */
const FADE_PX = 28;

/** Was gerade umbenannt wird: ein Tab (auch einer in einer Gruppe) oder eine Gruppe (Ticket 36). */
export type RenameTarget = { kind: 'tab'; id: string } | { kind: 'group'; id: string };

interface TabBarProps {
  /** Alle Tabs in der Reihenfolge der Leiste; die Tabs einer Gruppe stehen zusammen. */
  tabs: TabSnapshot[];
  /** Die Gruppen (Ticket 36); eine Gruppe ist ein einziger Eintrag der Leiste. */
  groups: GroupSnapshot[];
  activeTabId: string | null;
  /** Die erkannten Shells für das Pfeil-Menü. */
  shells: ShellOption[];
  /** Die Standard-Shell; sie trägt im Pfeil-Menü das Etikett „Standard“. */
  defaultShellId: string;
  /** Was gerade umbenannt wird. */
  renaming: RenameTarget | null;
  onStartRename(target: RenameTarget): void;
  /** Ende des Umbenennens: der eingegebene Name, oder `null` bei Abbruch. */
  onFinishRename(target: RenameTarget, name: string | null): void;
  /** Das Zahnrad öffnet die Einstellungen. */
  onOpenSettings(): void;
  /** Rechner wach halten an/aus und die gewählte Stufe (Ticket 28), für den Schalter neben dem Zahnrad. */
  keepAwake: boolean;
  keepAwakeMode: KeepAwakeMode;
}

/** Das offene Pfeil-Menü: die beim Öffnen abgefragten Ordner, und ob es per Tastatur geöffnet wurde. */
interface NewTabMenuState {
  recentDirs: RecentDir[];
  viaKeyboard: boolean;
}

/** Das offene Rechtsklick-Menü: für welchen Tab und wo im Fenster. */
interface TabMenuState {
  tabId: string;
  at: MenuPoint;
}

/** Die offene Liste einer Gruppe (Ticket 36): unter ihrem Gruppen-Tab, und ob per Tastatur geöffnet. */
interface GroupListState {
  groupId: string;
  anchor: HTMLElement;
  viaKeyboard: boolean;
}

/** Das offene Rechtsklick-Menü am Gruppen-Tab: für welche Gruppe und wo im Fenster. */
interface GroupMenuState {
  groupId: string;
  at: MenuPoint;
}

type TooltipContent =
  | { kind: 'tab'; tabId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'text'; text: string };
type TooltipState = TooltipContent & { anchor: DOMRect };

/**
 * Titelleiste mit der Tab-Leiste, gestaltet wie im Prototyp: Tabs, `+` mit Pfeil-Menü, freie Fläche zum
 * Verschieben des Fensters, Schalter „Rechner wach halten“ mit Pfeil-Menü, Zahnrad; rechts daneben liegen die nativen
 * Fensterknöpfe. Bei vielen Tabs
 * werden die Tabs schmaler und die Leiste scrollbar. Rechtsklick auf einen Tab öffnet sein Menü, Ziehen
 * sortiert die Tabs um. Eine Gruppe ist ein einziger Gruppen-Tab mit einer Liste ihrer Tabs (Ticket 36). Die Leiste
 * zeigt nur an und schickt Befehle; die Tab-Logik liegt im Kern.
 */
export function TabBar({
  tabs,
  groups,
  activeTabId,
  shells,
  defaultShellId,
  renaming,
  onStartRename,
  onFinishRename,
  onOpenSettings,
  keepAwake,
  keepAwakeMode,
}: TabBarProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const keepAwakeChevronRef = useRef<HTMLButtonElement>(null);
  /** Das offene Pfeil-Menü am Schalter „Rechner wach halten“, und ob es per Tastatur geöffnet wurde. */
  const [keepAwakeMenu, setKeepAwakeMenu] = useState<{ viaKeyboard: boolean } | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const [menu, setMenu] = useState<NewTabMenuState | null>(null);
  const [tabMenu, setTabMenu] = useState<TabMenuState | null>(null);
  const [groupList, setGroupList] = useState<GroupListState | null>(null);
  const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
  const tooltip = useTooltip();
  const hideTooltip = tooltip.hide;
  // Die Reihenfolge ändert der Kern; die Leiste zeigt sie mit dem nächsten Ereignis.
  const drag = useTabDrag(stripRef, {
    onMove: (entry, index) =>
      entry.kind === 'tab'
        ? api.send({ type: 'moveTab', tabId: entry.id, index })
        : api.send({ type: 'moveGroup', groupId: entry.id, index }),
    onDropIntoGroup: (tabId, groupId) => api.send({ type: 'moveTabToGroup', tabId, groupId }),
    onStart: hideTooltip,
  });
  const draggingId = drag.state.draggingId;

  // Die Ordner werden bei jedem Öffnen frisch abgefragt: Der Kern bietet nur an, was es noch gibt.
  // Ein zweiter Klick auf den Pfeil schliesst das Menü wieder.
  const toggleMenu = (viaKeyboard: boolean) => {
    hideTooltip();
    if (menu) {
      closeMenu();
      return;
    }
    void api.loadRecentDirs().then((recentDirs) => setMenu({ recentDirs, viaKeyboard }));
  };

  // Nach dem Menü gehört der Fokus wieder dem Terminal; ein neuer Tab holt ihn sich beim Anzeigen selbst.
  const closeMenu = () => {
    setMenu(null);
    focusTerminal(activeTabId);
  };

  // Rechtsklick auf einen Tab (auch in der Liste einer Gruppe): sein Menü an der Stelle des Klicks. Der Tab wird dabei
  // nicht aktiv.
  const openTabMenu = (tabId: string, at: MenuPoint) => {
    if (draggingId) return;
    hideTooltip();
    setMenu(null);
    setGroupList(null);
    setGroupMenu(null);
    setTabMenu({ tabId, at });
  };

  const closeTabMenu = () => {
    setTabMenu(null);
    focusTerminal(activeTabId);
  };

  // Die Liste einer Gruppe unter ihrem Gruppen-Tab; ein zweiter Klick schliesst sie wieder.
  const toggleGroupList = (groupId: string, anchor: HTMLElement, viaKeyboard: boolean) => {
    hideTooltip();
    if (groupList?.groupId === groupId) {
      closeGroupList();
      return;
    }
    setMenu(null);
    setTabMenu(null);
    setGroupMenu(null);
    setGroupList({ groupId, anchor, viaKeyboard });
  };

  const closeGroupList = () => {
    setGroupList(null);
    focusTerminal(activeTabId);
  };

  // Rechtsklick auf einen Gruppen-Tab: das Menü der Gruppe an der Stelle des Klicks.
  const openGroupMenu = (groupId: string, at: MenuPoint) => {
    if (draggingId) return;
    hideTooltip();
    setMenu(null);
    setTabMenu(null);
    setGroupList(null);
    setGroupMenu({ groupId, at });
  };

  const closeGroupMenu = () => {
    setGroupMenu(null);
    focusTerminal(activeTabId);
  };

  const startRenameGroup = (groupId: string) => {
    setGroupList(null);
    onStartRename({ kind: 'group', id: groupId });
  };

  // Ein zweiter Klick auf den Pfeil schliesst das Menü wieder.
  const toggleKeepAwakeMenu = (viaKeyboard: boolean) => {
    hideTooltip();
    if (keepAwakeMenu) closeKeepAwakeMenu();
    else setKeepAwakeMenu({ viaKeyboard });
  };

  const closeKeepAwakeMenu = () => {
    setKeepAwakeMenu(null);
    focusTerminal(activeTabId);
  };

  // Ein inzwischen geschlossener Tab hat kein Menü mehr, eine verschwundene Gruppe weder Liste noch Menü.
  const menuTab = tabMenu ? tabs.find((t) => t.id === tabMenu.tabId) : undefined;
  useEffect(() => {
    if (tabMenu && !menuTab) setTabMenu(null);
  }, [tabMenu, menuTab]);
  const listGroup = groupList ? groups.find((g) => g.id === groupList.groupId) : undefined;
  useEffect(() => {
    if (groupList && (!listGroup || !groupList.anchor.isConnected)) setGroupList(null);
  }, [groupList, listGroup]);
  const menuGroup = groupMenu ? groups.find((g) => g.id === groupMenu.groupId) : undefined;
  useEffect(() => {
    if (groupMenu && !menuGroup) setGroupMenu(null);
  }, [groupMenu, menuGroup]);

  const updateFades = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const left = strip.scrollLeft > 2;
    const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Mausrad scrollt die Leiste waagrecht; bei Grössenänderungen die weichen Kanten nachführen.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      strip.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    const observer = new ResizeObserver(updateFades);
    observer.observe(strip);
    return () => {
      strip.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  }, [updateFades]);

  // Der aktive Tab bleibt sichtbar, auch bei überlaufender Leiste (neuer Tab, Wechsel per Tastatur); in einer Gruppe
  // ihr Gruppen-Tab.
  const activeEntryId = tabs.find((t) => t.id === activeTabId)?.groupId ?? activeTabId;
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const el = activeEntryId
      ? strip?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(activeEntryId)}"]`)
      : null;
    if (strip && el) {
      const left = el.offsetLeft - FADE_PX;
      const right = el.offsetLeft + el.offsetWidth + FADE_PX;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }
    updateFades();
  }, [activeEntryId, tabs.length, groups.length, updateFades]);

  // Beim Umbenennen stört der Tooltip.
  useEffect(() => {
    if (renaming) hideTooltip();
  }, [renaming, hideTooltip]);

  // Klicks in die Leiste lassen den Fokus im Terminal. Nur ein offenes Umbenennen verliert ihn
  // und übernimmt damit den Namen.
  const keepTerminalFocus = (e: MouseEvent) => {
    if (!(document.activeElement instanceof HTMLInputElement)) e.preventDefault();
  };

  const stripClass = ['tabstrip', fade.left && 'fade-l', fade.right && 'fade-r'].filter(Boolean).join(' ');
  const tip = tooltip.state;
  const tipTab = tip?.kind === 'tab' ? tabs.find((t) => t.id === tip.tabId) : undefined;
  const tipGroup = tip?.kind === 'group' ? groups.find((g) => g.id === tip.groupId) : undefined;
  const tipSelected = tipGroup && tabs.find((t) => t.id === tipGroup.selectedTabId);
  // Solange ein Menü an einem Tab offen ist, erscheint kein Tooltip.
  const anyTabMenu = tabMenu !== null || groupList !== null || groupMenu !== null;

  const renderTab = (tab: TabSnapshot) => (
    <Tab
      key={tab.id}
      tab={tab}
      active={tab.id === activeTabId}
      renaming={renaming?.kind === 'tab' && renaming.id === tab.id}
      dragging={tab.id === draggingId}
      onActivate={() =>
        tab.id === activeTabId ? focusTerminal(tab.id) : api.send({ type: 'activateTab', tabId: tab.id })
      }
      onClose={() => api.send({ type: 'requestClose', tabIds: [tab.id] })}
      onStartRename={() => onStartRename({ kind: 'tab', id: tab.id })}
      onFinishRename={(name) => onFinishRename({ kind: 'tab', id: tab.id }, name)}
      onHover={(el) =>
        el && !renaming && !anyTabMenu && !draggingId
          ? tooltip.schedule(el, { kind: 'tab', tabId: tab.id })
          : hideTooltip()
      }
      onPointerDown={(e) => drag.startDrag(e, { kind: 'tab', id: tab.id })}
      onContextMenu={(x, y) => openTabMenu(tab.id, { x, y })}
    />
  );

  const renderGroup = (group: GroupSnapshot, members: TabSnapshot[]) => {
    const selected = members.find((t) => t.id === group.selectedTabId) ?? members[0];
    // Wird ein Tab der Gruppe umbenannt (F2, Menü des Tabs), zeigt der Gruppen-Tab dessen Namen als Eingabefeld.
    const renamingTab = renaming?.kind === 'tab' ? members.find((t) => t.id === renaming.id) : undefined;
    let groupRenaming: GroupRenaming | null = null;
    if (renaming?.kind === 'group' && renaming.id === group.id) groupRenaming = { kind: 'group' };
    else if (renamingTab) groupRenaming = { kind: 'tab', tab: renamingTab };
    const target: RenameTarget = renamingTab ? { kind: 'tab', id: renamingTab.id } : { kind: 'group', id: group.id };
    const active = group.selectedTabId === activeTabId;
    return (
      <GroupTab
        key={group.id}
        group={group}
        selected={selected}
        members={members}
        active={active}
        renaming={groupRenaming}
        dragging={group.id === draggingId}
        dropTarget={group.id === drag.state.intoGroupId}
        listOpen={groupList?.groupId === group.id}
        // Ein Klick zeigt den gewählten Tab an; ist die Gruppe schon aktiv, öffnet er die Liste.
        onClick={(el) =>
          active ? toggleGroupList(group.id, el, false) : api.send({ type: 'activateTab', tabId: selected.id })
        }
        onToggleList={(el, viaKeyboard) => toggleGroupList(group.id, el, viaKeyboard)}
        onStartRename={() => startRenameGroup(group.id)}
        onFinishRename={(name) => onFinishRename(target, name)}
        onHover={(el) =>
          el && !renaming && !anyTabMenu && !draggingId
            ? tooltip.schedule(el, { kind: 'group', groupId: group.id })
            : hideTooltip()
        }
        onPointerDown={(e) => drag.startDrag(e, { kind: 'group', id: group.id })}
        onContextMenu={(x, y) => openGroupMenu(group.id, { x, y })}
      />
    );
  };

  return (
    <header className="titlebar" onMouseDown={keepTerminalFocus}>
      <div
        ref={stripRef}
        className={stripClass}
        role="tablist"
        aria-label="Terminals"
        onScroll={() => {
          updateFades();
          hideTooltip();
        }}
      >
        {barEntries(tabs).map((entry) => {
          if (entry.kind === 'tab') return renderTab(entry.tab);
          const group = groups.find((g) => g.id === entry.groupId);
          // Kommt eine Gruppe nicht mit (sollte nicht vorkommen), stehen ihre Tabs einzeln da.
          return group ? renderGroup(group, entry.tabs) : entry.tabs.map(renderTab);
        })}
        {/* Einfügemarke beim Ziehen: Hier landet der Eintrag beim Loslassen. */}
        {drag.state.markLeft !== null && <div className="drop-mark" style={{ left: drag.state.markLeft }} />}
      </div>
      <div className="newtab">
        <button
          className="icon-btn"
          aria-label="Neues Terminal"
          onClick={() => api.send({ type: 'createTab' })}
          onMouseEnter={(e) => tooltip.schedule(e.currentTarget, { kind: 'text', text: 'Neues Terminal (Ctrl+Shift+T)' })}
          onMouseLeave={hideTooltip}
          onMouseDown={hideTooltip}
        >
          <PlusIcon />
        </button>
        {/* Pfeil-Menü: eine Shell oder einen Ordner für das neue Terminal wählen. */}
        <button
          ref={chevronRef}
          className={menu ? 'icon-btn chevron open' : 'icon-btn chevron'}
          aria-label="Shell oder Ordner wählen"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          // Per Tastatur ausgelöst (Enter, Leertaste) ist `detail` 0: dann gleich den ersten Eintrag hervorheben.
          onClick={(e) => toggleMenu(e.detail === 0)}
          onMouseEnter={(e) =>
            !menu && tooltip.schedule(e.currentTarget, { kind: 'text', text: 'Shell oder Ordner wählen' })
          }
          onMouseLeave={hideTooltip}
          onMouseDown={hideTooltip}
        >
          <ChevronIcon />
        </button>
      </div>
      {/* Freie Fläche zum Verschieben des Fensters; Doppelklick maximiert. Sie bleibt mindestens
          56 px breit, auch wenn die Tab-Leiste überläuft. */}
      <div className="titlebar-space" />
      {/* Rechner wach halten (Ticket 28): Symbol und kleiner Schalter sind eine Schaltfläche; der Pfeil wählt die Stufe. */}
      <div className="keepawake">
        <button
          className={keepAwake ? 'icon-btn ka-switch on' : 'icon-btn ka-switch'}
          role="switch"
          aria-checked={keepAwake}
          aria-label="Rechner wach halten"
          onClick={() => {
            hideTooltip();
            setKeepAwake(!keepAwake);
          }}
          onMouseEnter={(e) =>
            tooltip.schedule(e.currentTarget, { kind: 'text', text: keepAwakeTooltip(keepAwake, keepAwakeMode) })
          }
          onMouseLeave={hideTooltip}
          onMouseDown={hideTooltip}
        >
          <KeepAwakeModeIcon mode={keepAwakeMode} />
          <span className="ka-track" aria-hidden="true" />
        </button>
        <button
          ref={keepAwakeChevronRef}
          className={keepAwakeMenu ? 'icon-btn chevron open' : 'icon-btn chevron'}
          aria-label="Stufe wählen"
          aria-haspopup="menu"
          aria-expanded={keepAwakeMenu !== null}
          // Per Tastatur ausgelöst (Enter, Leertaste) ist `detail` 0: dann gleich den ersten Eintrag hervorheben.
          onClick={(e) => toggleKeepAwakeMenu(e.detail === 0)}
          onMouseEnter={(e) => !keepAwakeMenu && tooltip.schedule(e.currentTarget, { kind: 'text', text: 'Stufe wählen' })}
          onMouseLeave={hideTooltip}
          onMouseDown={hideTooltip}
        >
          <ChevronIcon />
        </button>
      </div>
      <button
        className="icon-btn"
        aria-label="Einstellungen"
        aria-haspopup="dialog"
        onClick={() => {
          hideTooltip();
          onOpenSettings();
        }}
        onMouseEnter={(e) => tooltip.schedule(e.currentTarget, { kind: 'text', text: 'Einstellungen' })}
        onMouseLeave={hideTooltip}
        onMouseDown={hideTooltip}
      >
        <GearIcon />
      </button>

      {menu && chevronRef.current && (
        <Menu
          label="Shell oder Ordner wählen"
          entries={newTabMenuEntries(shells, defaultShellId, menu.recentDirs)}
          anchor={chevronRef.current}
          highlightFirst={menu.viaKeyboard}
          onClose={closeMenu}
        />
      )}
      {keepAwakeMenu && keepAwakeChevronRef.current && (
        <Menu
          label="Stufe wählen"
          entries={keepAwakeMenuEntries(keepAwakeMode)}
          anchor={keepAwakeChevronRef.current}
          highlightFirst={keepAwakeMenu.viaKeyboard}
          onClose={closeKeepAwakeMenu}
        />
      )}
      {tabMenu && menuTab && (
        <Menu
          label={`Tab „${menuTab.name}“`}
          entries={tabMenuEntries(menuTab, groups, () => onStartRename({ kind: 'tab', id: menuTab.id }))}
          anchor={tabMenu.at}
          onClose={closeTabMenu}
        />
      )}
      {groupList && listGroup && (
        <Menu
          label={`Tabs der Gruppe „${listGroup.name}“`}
          entries={groupListEntries(listGroup, tabs, activeTabId, openTabMenu)}
          anchor={groupList.anchor}
          highlightFirst={groupList.viaKeyboard}
          onClose={closeGroupList}
        />
      )}
      {groupMenu && menuGroup && (
        <Menu
          label={`Gruppe „${menuGroup.name}“`}
          entries={groupMenuEntries(menuGroup, () => startRenameGroup(menuGroup.id))}
          anchor={groupMenu.at}
          onClose={closeGroupMenu}
        />
      )}

      {tip?.kind === 'text' && <Tooltip anchor={tip.anchor}>{tip.text}</Tooltip>}
      {tip && tipTab && (
        <Tooltip anchor={tip.anchor}>
          <b>{tipTab.name}</b>
          <dl>
            <dt>Ordner</dt>
            <dd className="mono">{tipTab.cwd}</dd>
            <dt>Shell</dt>
            <dd>{tipTab.shellName}</dd>
            <dt>Status</dt>
            <dd>{STATUS_TEXT[tipTab.status]}</dd>
          </dl>
        </Tooltip>
      )}
      {tip && tipGroup && tipSelected && (
        <Tooltip anchor={tip.anchor}>
          <b>{tipGroup.name}</b>
          <dl>
            {groupTipRows(tipGroup, tipSelected, tabs).map((row, i) => (
              <Fragment key={i}>
                <dt>{row.label}</dt>
                <dd className={row.mono ? 'mono' : undefined}>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </Tooltip>
      )}
    </header>
  );
}

/** Ein Tooltip zur Zeit, mit Verzögerung; die Lage des Elements wird beim Erscheinen gemessen. */
function useTooltip() {
  const [state, setState] = useState<TooltipState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setState(null);
  }, []);

  const schedule = useCallback((el: HTMLElement, content: TooltipContent) => {
    window.clearTimeout(timer.current);
    setState(null);
    timer.current = window.setTimeout(() => {
      if (el.isConnected) setState({ ...content, anchor: el.getBoundingClientRect() });
    }, TOOLTIP_DELAY_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { state, schedule, hide };
}
