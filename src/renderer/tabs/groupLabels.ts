// Texte am Gruppen-Tab (Tickets 36 und 40): Tooltip und Beschriftung des Pfeils. Reine Funktionen, damit sie sich ohne
// Fenster prüfen lassen; den Status und den Punkt rechnet der Kern aus (`GroupSnapshot.status`, `GroupSnapshot.dot`).

import type { GroupSnapshot, TabSnapshot } from '../../shared/types';
import { STATUS_TEXT } from './TabIcon';

/** Eine Zeile im Tooltip: Bezeichnung links (leer, wenn die Zeile die vorige fortsetzt), Wert rechts. */
export interface TipRow {
  label: string;
  value: string;
  /** Wert in Festbreitenschrift (Ordner). */
  mono?: boolean;
}

/** Ein anderer Tab, der den Punkt am Pfeil ergibt, mit seinem Grund. */
interface DotTab {
  tab: TabSnapshot;
  status: 'waiting' | 'finished';
}

/**
 * Die anderen Tabs der Gruppe, die auf dich warten oder fertig sind: zuerst die wartenden, dann die fertigen, je in der
 * Reihenfolge der Gruppe. Nie der gewählte Tab; ohne Punkt keiner.
 */
function dotTabs(group: GroupSnapshot, tabs: readonly TabSnapshot[]): DotTab[] {
  if (group.dot === 'none') return [];
  const others = group.tabIds
    .filter((id) => id !== group.selectedTabId)
    .map((id) => tabs.find((t) => t.id === id))
    .filter((tab): tab is TabSnapshot => tab !== undefined);
  const withStatus = (status: DotTab['status']): DotTab[] =>
    others.filter((tab) => tab.status === status).map((tab) => ({ tab, status }));
  return [...withStatus('waiting'), ...withStatus('finished')];
}

const DOT_TEXT: Record<DotTab['status'], string> = {
  waiting: 'wartet auf dich',
  finished: 'ist fertig',
};

/**
 * Tooltip am Gruppen-Tab: Zahl der Tabs, Name, Ordner und Shell des gewählten Tabs, als letzte Zeile sein Status
 * (Ticket 40). Trägt der Pfeil einen Punkt, nennen die Zeilen darunter die anderen Tabs, die warten oder fertig sind,
 * etwa „web wartet auf dich“.
 */
export function groupTipRows(group: GroupSnapshot, selected: TabSnapshot, tabs: readonly TabSnapshot[]): TipRow[] {
  const rows: TipRow[] = [
    { label: 'Tabs', value: String(group.tabIds.length) },
    { label: 'Gewählt', value: selected.name },
    { label: 'Ordner', value: selected.cwd, mono: true },
    { label: 'Shell', value: selected.shellName },
    { label: 'Status', value: STATUS_TEXT[group.status] },
  ];
  dotTabs(group, tabs).forEach(({ tab, status }, i) => {
    rows.push({ label: i === 0 ? 'Andere' : '', value: `${tab.name} ${DOT_TEXT[status]}` });
  });
  return rows;
}

/**
 * Beschriftung des Pfeils für Bildschirmleser: was er tut, und trägt er einen Punkt, dessen Grund, etwa „Tabs der
 * Gruppe, ein anderer Tab wartet auf dich“.
 */
export function groupListLabel(group: GroupSnapshot, tabs: readonly TabSnapshot[]): string {
  const base = 'Tabs der Gruppe';
  if (group.dot === 'none') return base;
  const count = dotTabs(group, tabs).filter(({ status }) => status === group.dot).length;
  if (group.dot === 'waiting') {
    return count > 1 ? `${base}, ${count} andere Tabs warten auf dich` : `${base}, ein anderer Tab wartet auf dich`;
  }
  return count > 1 ? `${base}, ${count} andere Tabs sind fertig` : `${base}, ein anderer Tab ist fertig`;
}
