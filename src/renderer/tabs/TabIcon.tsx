import { SparkIcon, TerminalTypeIcon } from '../icons';

/** Art des Tabs: normales Terminal oder Claude-Tab (Claude-Tabs gibt es ab Ticket 10). */
export type TabKind = 'terminal' | 'claude';

/**
 * Status am Tab. Bisher nur „ruht“; arbeitet, wartet, Prozesse, fertig und pausiert folgen mit
 * Ticket 13 als weitere Werte, mit ihren Symbolen und Animationen aus dem Prototyp.
 */
export type TabStatus = 'idle';

interface TabIconProps {
  kind: TabKind;
  status: TabStatus;
}

/** Symbol-Platz links vom Tab-Namen. Im Ruhezustand zeigt er gedämpft den Typ des Tabs. */
export function TabIcon({ kind, status }: TabIconProps) {
  return (
    <span className="st" data-s={status} aria-hidden="true">
      {kind === 'claude' ? <SparkIcon /> : <TerminalTypeIcon />}
    </span>
  );
}
