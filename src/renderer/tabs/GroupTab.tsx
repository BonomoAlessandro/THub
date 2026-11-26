import type { MouseEvent, PointerEvent } from 'react';
import type { GroupSnapshot, TabSnapshot } from '../../shared/types';
import { ChevronIcon } from '../icons';
import { RenameInput } from './Tab';
import { GroupIcon } from './TabIcon';

/** Was am Gruppen-Tab gerade umbenannt wird: die Gruppe selbst oder einer ihrer Tabs (`F2`, Menü des Tabs). */
export type GroupRenaming = { kind: 'group' } | { kind: 'tab'; tab: TabSnapshot };

interface GroupTabProps {
  group: GroupSnapshot;
  /** Der gewählte Tab der Gruppe; seinen Namen zeigt der Gruppen-Tab. */
  selected: TabSnapshot;
  /** Der gewählte Tab ist der aktive: Der Gruppen-Tab sieht aus wie ein aktiver Tab. */
  active: boolean;
  renaming: GroupRenaming | null;
  /** Die Gruppe wird gerade gezogen; sie steht blass an ihrem Platz. */
  dragging: boolean;
  /** Ein gezogener Tab käme beim Loslassen in diese Gruppe: Sie ist als Ziel hervorgehoben. */
  dropTarget: boolean;
  /** Die Liste der Gruppe ist offen. */
  listOpen: boolean;
  /** Klick auf den Gruppen-Tab (nicht auf den Pfeil); `el` ist der Gruppen-Tab, unter dem die Liste aufgeht. */
  onClick(el: HTMLElement): void;
  /** Klick auf den Pfeil: Liste öffnen bzw. schliessen; `viaKeyboard`, wenn per Enter oder Leertaste ausgelöst. */
  onToggleList(el: HTMLElement, viaKeyboard: boolean): void;
  /** Doppelklick: die Gruppe umbenennen. */
  onStartRename(): void;
  /** Ende des Umbenennens: der eingegebene Name, oder `null` bei Abbruch. */
  onFinishRename(name: string | null): void;
  /** Maus über dem Gruppen-Tab (Element) bzw. nicht mehr (`null`), für den Tooltip. */
  onHover(el: HTMLElement | null): void;
  /** Taste gedrückt: Daraus kann ein Ziehen werden. */
  onPointerDown(e: PointerEvent<HTMLDivElement>): void;
  /** Rechtsklick: das Menü der Gruppe an dieser Stelle im Fenster. */
  onContextMenu(x: number, y: number): void;
}

/**
 * Gruppen-Tab (Ticket 36): ein einziger Eintrag in der Leiste, mit den Massen eines Tabs. Er zeigt den Status der Gruppe
 * (sonst gedämpft ein Ordner), „Gruppenname · gewählter Tab“, gekürzt mit „…“, gedämpft die Zahl der Tabs und einen
 * Pfeil, der die Liste der Tabs öffnet. Beim Umbenennen der Gruppe wird der Name zum Eingabefeld; beim Umbenennen eines
 * ihrer Tabs der Teil hinter dem Gruppennamen.
 */
export function GroupTab({
  group,
  selected,
  active,
  renaming,
  dragging,
  dropTarget,
  listOpen,
  onClick,
  onToggleList,
  onStartRename,
  onFinishRename,
  onHover,
  onPointerDown,
  onContextMenu,
}: GroupTabProps) {
  const className = [
    'tab',
    'group',
    active && 'active',
    renaming && 'renaming',
    dragging && 'dragging',
    dropTarget && 'drop-into',
    listOpen && 'open',
  ]
    .filter(Boolean)
    .join(' ');

  const onDoubleClick = (e: MouseEvent) => {
    if (!renaming && !(e.target as Element).closest('.grp-list')) onStartRename();
  };

  return (
    <div
      className={className}
      role="tab"
      aria-selected={active}
      aria-label={`Gruppe „${group.name}“, ${group.tabIds.length} Tabs, gewählt: ${selected.name}`}
      data-group-id={group.id}
      data-entry-id={group.id}
      onPointerDown={renaming ? undefined : onPointerDown}
      onMouseDown={() => onHover(null)}
      onClick={renaming ? undefined : (e) => onClick(e.currentTarget)}
      onDoubleClick={onDoubleClick}
      // Rechtsklick: das Menü der Gruppe. Nie das Fenstermenü von Windows.
      onContextMenu={(e) => {
        e.preventDefault();
        if (!renaming) onContextMenu(e.clientX, e.clientY);
      }}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={() => onHover(null)}
    >
      <GroupIcon status={group.status} />
      {renaming?.kind === 'group' && (
        <RenameInput initial={group.name} label="Name der Gruppe" onFinish={onFinishRename} />
      )}
      {renaming?.kind === 'tab' && (
        <>
          <span className="grp-prefix">{group.name} ·</span>
          <RenameInput initial={renaming.tab.name} onFinish={onFinishRename} />
        </>
      )}
      {!renaming && (
        <>
          <span className="tab-name">
            {group.name}
            <span className="grp-sep"> · </span>
            {selected.name}
          </span>
          <span className="grp-count" aria-hidden="true">
            {group.tabIds.length}
          </span>
          <button
            className="grp-list"
            aria-label="Tabs der Gruppe"
            aria-haspopup="menu"
            aria-expanded={listOpen}
            onClick={(e) => {
              e.stopPropagation();
              const el = e.currentTarget.closest<HTMLElement>('.tab');
              // Per Tastatur ausgelöst (Enter, Leertaste) ist `detail` 0: dann gleich den ersten Eintrag hervorheben.
              if (el) onToggleList(el, e.detail === 0);
            }}
          >
            <ChevronIcon />
          </button>
        </>
      )}
    </div>
  );
}
