import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { TabSnapshot } from '../../shared/types';
import { CloseIcon } from '../icons';
import { TabIcon } from './TabIcon';

interface TabProps {
  tab: TabSnapshot;
  active: boolean;
  renaming: boolean;
  onActivate(): void;
  onClose(): void;
  onStartRename(): void;
  /** Ende des Umbenennens: der eingegebene Name, oder `null` bei Abbruch. */
  onFinishRename(name: string | null): void;
  /** Maus über dem Tab (Element) bzw. nicht mehr (`null`), für den Tooltip. */
  onHover(el: HTMLElement | null): void;
}

/** Ein Tab der Tab-Leiste, wie im Prototyp: Symbol-Platz, Name, Schliessen-Knopf. */
export function Tab({ tab, active, renaming, onActivate, onClose, onStartRename, onFinishRename, onHover }: TabProps) {
  const className = ['tab', active && 'active', renaming && 'renaming'].filter(Boolean).join(' ');

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
      onMouseDown={onMouseDown}
      onClick={renaming ? undefined : onActivate}
      onDoubleClick={onDoubleClick}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={() => onHover(null)}
    >
      <TabIcon kind="terminal" status="idle" />
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
}

/** Der Tab selbst wird zum Eingabefeld: Enter übernimmt, Escape bricht ab, Verlassen übernimmt. */
function RenameInput({ initial, onFinish }: RenameInputProps) {
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
      aria-label="Name des Tabs"
      onKeyDown={onKeyDown}
      onBlur={(e) => finish(e.currentTarget.value)}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
