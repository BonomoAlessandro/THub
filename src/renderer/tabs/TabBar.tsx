import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { RecentDir, ShellOption, TabSnapshot } from '../../shared/types';
import { ChevronIcon, GearIcon, PlusIcon } from '../icons';
import { Menu, type MenuPoint } from '../popup/Menu';
import { focusTerminal } from '../terminal/terminalViews';
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

interface TabBarProps {
  tabs: TabSnapshot[];
  activeTabId: string | null;
  /** Die erkannten Shells für das Pfeil-Menü. */
  shells: ShellOption[];
  /** Die Standard-Shell; sie trägt im Pfeil-Menü das Etikett „Standard“. */
  defaultShellId: string;
  /** Tab, dessen Name gerade bearbeitet wird. */
  renamingId: string | null;
  onStartRename(tabId: string): void;
  /** Ende des Umbenennens: der eingegebene Name, oder `null` bei Abbruch. */
  onFinishRename(tabId: string, name: string | null): void;
  /** Das Zahnrad öffnet die Einstellungen. */
  onOpenSettings(): void;
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

type TooltipContent = { kind: 'tab'; tabId: string } | { kind: 'text'; text: string };
type TooltipState = TooltipContent & { anchor: DOMRect };

/**
 * Titelleiste mit der Tab-Leiste, gestaltet wie im Prototyp: Tabs, `+` mit Pfeil-Menü, freie Fläche zum
 * Verschieben des Fensters, Zahnrad; rechts daneben liegen die nativen Fensterknöpfe. Bei vielen Tabs
 * werden die Tabs schmaler und die Leiste scrollbar. Rechtsklick auf einen Tab öffnet sein Menü, Ziehen
 * sortiert die Tabs um. Die Leiste zeigt nur an und schickt Befehle; die Tab-Logik liegt im Kern.
 */
export function TabBar({
  tabs,
  activeTabId,
  shells,
  defaultShellId,
  renamingId,
  onStartRename,
  onFinishRename,
  onOpenSettings,
}: TabBarProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const [menu, setMenu] = useState<NewTabMenuState | null>(null);
  const [tabMenu, setTabMenu] = useState<TabMenuState | null>(null);
  const tooltip = useTooltip();
  const hideTooltip = tooltip.hide;
  // Die Reihenfolge ändert der Kern; die Leiste zeigt sie mit dem nächsten Ereignis.
  const drag = useTabDrag(stripRef, (tabId, index) => api.send({ type: 'moveTab', tabId, index }), hideTooltip);
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

  // Rechtsklick auf einen Tab: sein Menü an der Stelle des Klicks. Der Tab wird dabei nicht aktiv.
  const openTabMenu = (tabId: string, at: MenuPoint) => {
    if (draggingId) return;
    hideTooltip();
    setMenu(null);
    setTabMenu({ tabId, at });
  };

  const closeTabMenu = () => {
    setTabMenu(null);
    focusTerminal(activeTabId);
  };

  // Ein inzwischen geschlossener Tab hat kein Menü mehr.
  const menuTab = tabMenu ? tabs.find((t) => t.id === tabMenu.tabId) : undefined;
  useEffect(() => {
    if (tabMenu && !menuTab) setTabMenu(null);
  }, [tabMenu, menuTab]);

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

  // Der aktive Tab bleibt sichtbar, auch bei überlaufender Leiste (neuer Tab, Wechsel per Tastatur).
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const el = activeTabId ? strip?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`) : null;
    if (strip && el) {
      const left = el.offsetLeft - FADE_PX;
      const right = el.offsetLeft + el.offsetWidth + FADE_PX;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }
    updateFades();
  }, [activeTabId, tabs.length, updateFades]);

  // Beim Umbenennen stört der Tooltip.
  useEffect(() => {
    if (renamingId) hideTooltip();
  }, [renamingId, hideTooltip]);

  // Klicks in die Leiste lassen den Fokus im Terminal. Nur ein offenes Umbenennen verliert ihn
  // und übernimmt damit den Namen.
  const keepTerminalFocus = (e: MouseEvent) => {
    if (!(document.activeElement instanceof HTMLInputElement)) e.preventDefault();
  };

  const stripClass = ['tabstrip', fade.left && 'fade-l', fade.right && 'fade-r'].filter(Boolean).join(' ');
  const tip = tooltip.state;
  const tipTab = tip?.kind === 'tab' ? tabs.find((t) => t.id === tip.tabId) : undefined;

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
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            renaming={tab.id === renamingId}
            dragging={tab.id === draggingId}
            onActivate={() =>
              tab.id === activeTabId ? focusTerminal(tab.id) : api.send({ type: 'activateTab', tabId: tab.id })
            }
            onClose={() => api.send({ type: 'requestClose', tabIds: [tab.id] })}
            onStartRename={() => onStartRename(tab.id)}
            onFinishRename={(name) => onFinishRename(tab.id, name)}
            onHover={(el) =>
              el && !renamingId && !tabMenu && !draggingId
                ? tooltip.schedule(el, { kind: 'tab', tabId: tab.id })
                : hideTooltip()
            }
            onPointerDown={(e) => drag.startDrag(e, tab.id)}
            onContextMenu={(x, y) => openTabMenu(tab.id, { x, y })}
          />
        ))}
        {/* Einfügemarke beim Ziehen: Hier landet der Tab beim Loslassen. */}
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
      {tabMenu && menuTab && (
        <Menu
          label={`Tab „${menuTab.name}“`}
          entries={tabMenuEntries(menuTab, () => onStartRename(menuTab.id))}
          anchor={tabMenu.at}
          onClose={closeTabMenu}
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
