import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { TabSnapshot } from '../../shared/types';
import { ChevronIcon, GearIcon, PlusIcon } from '../icons';
import { focusTerminal } from '../terminal/terminalViews';
import { Tab } from './Tab';
import { Tooltip } from './Tooltip';

const api = window.termhub;

/** So lange liegt die Maus auf einem Element, bis sein Tooltip erscheint. */
const TOOLTIP_DELAY_MS = 550;
/** Breite der weichen Kanten der Leiste bei Überlauf; ein angesteuerter Tab rückt ganz heraus. */
const FADE_PX = 28;

interface TabBarProps {
  tabs: TabSnapshot[];
  activeTabId: string | null;
  /** Tab, dessen Name gerade bearbeitet wird. */
  renamingId: string | null;
  onStartRename(tabId: string): void;
  /** Ende des Umbenennens: der eingegebene Name, oder `null` bei Abbruch. */
  onFinishRename(tabId: string, name: string | null): void;
}

type TooltipContent = { kind: 'tab'; tabId: string } | { kind: 'text'; text: string };
type TooltipState = TooltipContent & { anchor: DOMRect };

/**
 * Titelleiste mit der Tab-Leiste, gestaltet wie im Prototyp: Tabs, `+` mit Pfeil, freie Fläche zum
 * Verschieben des Fensters, Zahnrad; rechts daneben liegen die nativen Fensterknöpfe. Bei vielen Tabs
 * werden die Tabs schmaler und die Leiste scrollbar. Die Leiste zeigt nur an und schickt Befehle;
 * die Tab-Logik liegt im Kern.
 */
export function TabBar({ tabs, activeTabId, renamingId, onStartRename, onFinishRename }: TabBarProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const tooltip = useTooltip();
  const hideTooltip = tooltip.hide;

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
            onActivate={() =>
              tab.id === activeTabId ? focusTerminal(tab.id) : api.send({ type: 'activateTab', tabId: tab.id })
            }
            onClose={() => api.send({ type: 'closeTab', tabId: tab.id })}
            onStartRename={() => onStartRename(tab.id)}
            onFinishRename={(name) => onFinishRename(tab.id, name)}
            onHover={(el) => (el && !renamingId ? tooltip.schedule(el, { kind: 'tab', tabId: tab.id }) : hideTooltip())}
          />
        ))}
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
        {/* Pfeil-Menü mit Shells und Ordnern folgt mit Ticket 05; bis dahin ohne Funktion. */}
        <button className="icon-btn chevron" aria-label="Shell oder Ordner wählen" disabled>
          <ChevronIcon />
        </button>
      </div>
      {/* Freie Fläche zum Verschieben des Fensters; Doppelklick maximiert. Sie bleibt mindestens
          56 px breit, auch wenn die Tab-Leiste überläuft. */}
      <div className="titlebar-space" />
      {/* Einstellungsdialog folgt mit Ticket 05; bis dahin ohne Funktion. */}
      <button className="icon-btn" aria-label="Einstellungen" disabled>
        <GearIcon />
      </button>

      {tip?.kind === 'text' && <Tooltip anchor={tip.anchor}>{tip.text}</Tooltip>}
      {tip && tipTab && (
        <Tooltip anchor={tip.anchor}>
          <b>{tipTab.name}</b>
          <dl>
            <dt>Ordner</dt>
            <dd className="mono">{tipTab.cwd}</dd>
            <dt>Shell</dt>
            <dd>{tipTab.shellName}</dd>
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
