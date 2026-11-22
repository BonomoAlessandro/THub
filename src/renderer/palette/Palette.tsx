import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ClosedTabInfo, RecentDir } from '../../shared/types';
import {
  CloseIcon,
  CloseOthersIcon,
  CoffeeIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HistoryIcon,
  KeyboardIcon,
  MonitorIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
} from '../icons';
import { usePopupOpen } from '../popup/popups';
import { TabIcon } from '../tabs/TabIcon';
import {
  closedGroups,
  folderGroups,
  rootGroups,
  type PaletteContext,
  type PaletteIcon,
  type PaletteItem,
  type PaletteMode,
} from './paletteEntries';
import { searchGroups } from './search';
import { shortPath } from './shortPath';

const api = window.thub;

const ICONS: Record<PaletteIcon, ReactNode> = {
  plus: <PlusIcon />,
  folder: <FolderIcon />,
  folderPlus: <FolderPlusIcon />,
  folderOpen: <FolderOpenIcon />,
  pencil: <PencilIcon />,
  close: <CloseIcon />,
  closeOthers: <CloseOthersIcon />,
  history: <HistoryIcon />,
  sliders: <SlidersIcon />,
  keyboard: <KeyboardIcon />,
  coffee: <CoffeeIcon />,
  monitor: <MonitorIcon />,
};

/** Überschrift über dem Suchfeld in einer Unterliste. */
const CRUMB: Record<Exclude<PaletteMode, 'root'>, string> = {
  folders: 'Neues Terminal in',
  closed: 'Zuletzt geschlossen',
};

interface PaletteProps {
  context: PaletteContext;
  /** Die Palette schliesst sich (Escape, Klick daneben, Eintrag gewählt); den Fokus gibt `onClose` ans Terminal. */
  onClose(): void;
}

/**
 * Befehlspalette wie im Prototyp: Suchfeld, darunter Tabs und Befehle in Gruppen, unten die Bedienung. Tippen filtert
 * unscharf, Pfeiltasten wählen, Enter führt aus, Escape schliesst bzw. führt aus einer Unterliste zurück. Solange sie
 * offen ist, hat das Suchfeld den Fokus, und keine Taste erreicht das Terminal.
 */
export function Palette({ context, onClose }: PaletteProps) {
  usePopupOpen();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [mode, setMode] = useState<PaletteMode>('root');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  // Die Unterlisten werden beim Öffnen frisch abgefragt: Der Kern bietet nur an, was es noch gibt.
  const [recentDirs, setRecentDirs] = useState<RecentDir[] | null>(null);
  const [closed, setClosed] = useState<ClosedTabInfo[] | null>(null);
  const reveal = useRef(true);

  useEffect(() => {
    let open = true;
    void api.loadRecentDirs().then((dirs) => open && setRecentDirs(dirs));
    void api.loadClosedTabs().then((tabs) => open && setClosed(tabs));
    return () => {
      open = false;
    };
  }, []);

  const groups = useMemo(() => {
    const source =
      mode === 'folders' ? folderGroups(recentDirs ?? []) : mode === 'closed' ? closedGroups(closed ?? []) : rootGroups(context);
    return searchGroups(query, source);
  }, [mode, query, context, recentDirs, closed]);
  const items = groups.flatMap((g) => g.items);
  const highlighted = Math.min(selected, items.length - 1);

  const switchTo = (next: PaletteMode) => {
    reveal.current = true;
    setMode(next);
    setQuery('');
    setSelected(0);
  };

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.opens) {
      switchTo(item.opens);
      return;
    }
    onClose();
    item.run?.();
  };

  /** Wählt per Tastatur; die gewählte Zeile rückt dann ins Bild (bei der Maus nicht, sonst liefe die Liste weg). */
  const selectByKey = (next: number) => {
    reveal.current = true;
    setSelected(next);
  };

  // Für den Handler am Fenster: immer der zuletzt angezeigte Stand.
  const current = useRef({ mode, query, items, highlighted, onClose, choose, switchTo, selectByKey });
  current.current = { mode, query, items, highlighted, onClose, choose, switchTo, selectByKey };

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Die gewählte Zeile bleibt sichtbar.
  useLayoutEffect(() => {
    if (reveal.current) listRef.current?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, groups]);

  // Tasten in der Capture-Phase, vor den Tastenkürzeln der App und vor xterm.js.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const c = current.current;
      const input = inputRef.current;
      // Eine Taste ausserhalb der Palette (etwa wenn der Fokus doch woanders liegt) geht nirgends hin.
      if (!(e.target instanceof Node && rootRef.current?.contains(e.target))) {
        e.preventDefault();
        e.stopPropagation();
        input?.focus();
        return;
      }
      if (e.isComposing) return;
      switch (e.key) {
        case 'ArrowDown':
          c.selectByKey(Math.min(c.highlighted + 1, c.items.length - 1));
          break;
        case 'ArrowUp':
          c.selectByKey(Math.max(c.highlighted - 1, 0));
          break;
        case 'Enter':
          c.choose(c.items[c.highlighted]);
          break;
        case 'Escape':
          if (c.mode === 'root') c.onClose();
          else c.switchTo('root');
          break;
        case 'Backspace':
          if (c.mode === 'root' || c.query !== '') return;
          c.switchTo('root');
          break;
        // Der Fokus bleibt im Suchfeld.
        case 'Tab':
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const itemId = (index: number) => `${id}-${index}`;
  const listId = `${id}-list`;
  let index = -1;

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={rootRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Befehlspalette"
        // Klicks in die Palette lassen den Fokus im Suchfeld.
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) e.preventDefault();
        }}
      >
        <div className="pal-input">
          <SearchIcon />
          {mode !== 'root' && <span className="pal-crumb">{CRUMB[mode]}</span>}
          <input
            ref={inputRef}
            value={query}
            placeholder={mode === 'root' ? 'Tab oder Befehl suchen …' : 'Filtern …'}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-label={mode === 'root' ? 'Tab oder Befehl suchen' : `${CRUMB[mode]}: filtern`}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlighted >= 0 ? itemId(highlighted) : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              selectByKey(0);
            }}
          />
        </div>
        <div ref={listRef} id={listId} className="pal-list" role="listbox" aria-label="Treffer">
          {groups.map((group) => (
            <div key={group.title} role="group" aria-label={group.title}>
              <div className="pal-group" role="presentation">
                {group.title}
              </div>
              {group.items.map((item) => {
                const own = ++index;
                return (
                  <div
                    key={item.id}
                    id={itemId(own)}
                    className={own === highlighted ? 'pal-item sel' : 'pal-item'}
                    role="option"
                    aria-selected={own === highlighted}
                    onMouseMove={() => {
                      if (own === highlighted) return;
                      reveal.current = false;
                      setSelected(own);
                    }}
                    onClick={() => choose(item)}
                  >
                    <span className="mi-ic">
                      {item.tab ? <TabIcon kind={item.tab.kind} status={item.tab.status} /> : item.icon && ICONS[item.icon]}
                    </span>
                    <span className="pal-main">
                      {item.label}
                      {item.detail && <small title={item.detail}>{shortPath(item.detail)}</small>}
                    </span>
                    {item.hint ? (
                      <span className="mi-kbd">{item.hint}</span>
                    ) : (
                      item.opens && (
                        <span className="mi-kbd" aria-hidden="true">
                          ›
                        </span>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {items.length === 0 && <div className="pal-empty">{emptyText(mode, query, closed)}</div>}
        </div>
        <div className="pal-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> auswählen
          </span>
          <span>
            <kbd>Enter</kbd> ausführen
          </span>
          <span>
            <kbd>Esc</kbd> {mode === 'root' ? 'schliessen' : 'zurück'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Text einer leeren Liste. */
function emptyText(mode: PaletteMode, query: string, closed: ClosedTabInfo[] | null): string {
  if (mode === 'closed' && !query.trim()) return closed === null ? '…' : 'Noch keine Tabs geschlossen';
  return 'Nichts gefunden';
}
