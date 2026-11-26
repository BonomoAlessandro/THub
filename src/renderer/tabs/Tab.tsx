import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { TabSnapshot } from '../../shared/types';
import { CloseIcon } from '../icons';
import { TabIcon } from './TabIcon';

interface TabProps {
  tab: TabSnapshot;
  active: boolean;
  renaming: boolean;
  /** Der Tab wird gerade gezogen; er steht blass an seinem Platz. */
  dragging: boolean;
  onActivate(): void;
  onClose(): void;
  onStartRename(): void;
  /** Ende des Umbenennens: der eingegebene Name, oder `null` bei Abbruch. */
  onFinishRename(name: string | null): void;
  /** Maus über dem Tab (Element) bzw. nicht mehr (`null`), für den Tooltip. */
  onHover(el: HTMLElement | null): void;
  /** Taste gedrückt: Daraus kann ein Ziehen werden. */
  onPointerDown(e: PointerEvent<HTMLDivElement>): void;
  /** Rechtsklick: das Menü des Tabs an dieser Stelle im Fenster. */
  onContextMenu(x: number, y: number): void;
}

/** Ein Tab der Tab-Leiste, wie im Prototyp: Symbol-Platz, Name, Schliessen-Knopf. */
export function Tab({
  tab,
  active,
  renaming,
  dragging,
  onActivate,
  onClose,
  onStartRename,
  onFinishRename,
  onHover,
  onPointerDown,
  onContextMenu,
}: TabProps) {
  const className = ['tab', active && 'active', renaming && 'renaming', dragging && 'dragging']
    .filter(Boolean)
    .join(' ');

  const onMouseDown = (e: MouseEvent) => {
    onHover(null);
    // Mittlere Maustaste schliesst den Tab, wie im Prototyp.
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  };

  const onDoubleClick = (e: MouseEvent) => {
    if (!renaming && !(e.target as Element).closest('.tab-close')) onStartRename();
  };

  return (
    <div
      className={className}
      role="tab"
      aria-selected={active}
      data-tab-id={tab.id}
      data-entry-id={tab.id}
      onPointerDown={renaming ? undefined : onPointerDown}
      onMouseDown={onMouseDown}
      onClick={renaming ? undefined : onActivate}
      onDoubleClick={onDoubleClick}
      // Rechtsklick: das Menü des Tabs. Nie das Fenstermenü von Windows; die Tabs liegen ausserhalb der Zieh-Fläche.
      onContextMenu={(e) => {
        e.preventDefault();
        if (!renaming) onContextMenu(e.clientX, e.clientY);
      }}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={() => onHover(null)}
    >
      <TabIcon kind={tab.kind} status={tab.status} />
      {renaming ? (
        <RenameInput initial={tab.name} onFinish={onFinishRename} />
      ) : (
        <>
          <span className="tab-name">{tab.name}</span>
          <button
            className="tab-close"
            aria-label="Tab schliessen"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <CloseIcon />
          </button>
        </>
      )}
    </div>
  );
}

interface RenameInputProps {
  initial: string;
  onFinish(name: string | null): void;
  /** Name des Felds für Screenreader. */
  label?: string;
}

/**
 * Der Tab selbst wird zum Eingabefeld: Enter übernimmt, Escape bricht ab, Verlassen übernimmt. Ebenso am Gruppen-Tab
 * für den Namen der Gruppe oder eines ihrer Tabs (Ticket 36).
 */
export function RenameInput({ initial, onFinish, label = 'Name des Tabs' }: RenameInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onFinish(name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(null);
    }
  };

  return (
    <input
      ref={ref}
      className="tab-rename"
      defaultValue={initial}
      spellCheck={false}
      aria-label={label}
      onKeyDown={onKeyDown}
      onBlur={(e) => finish(e.currentTarget.value)}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
