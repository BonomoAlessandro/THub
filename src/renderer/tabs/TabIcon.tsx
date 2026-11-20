import { PauseIcon, SparkIcon, TerminalTypeIcon } from '../icons';

/** Art des Tabs: normales Terminal oder Claude-Tab (Claude-Tabs gibt es ab Ticket 10). */
export type TabKind = 'terminal' | 'claude';

/**
 * Status am Tab: „ruht“ und „pausiert“ (ein Claude-Tab nach einem Neustart, dessen Session erst beim Anzeigen
 * fortgesetzt wird, Ticket 12). Arbeitet, wartet, Prozesse und fertig folgen mit Ticket 13 als weitere Werte, mit
 * ihren Symbolen und Animationen aus dem Prototyp.
 */
export type TabStatus = 'idle' | 'paused';

interface TabIconProps {
  kind: TabKind;
  status: TabStatus;
}

/** Symbol-Platz links vom Tab-Namen. Im Ruhezustand zeigt er gedämpft den Typ des Tabs, sonst den Status. */
export function TabIcon({ kind, status }: TabIconProps) {
  return (
    <span className="st" data-s={status} aria-hidden="true">
      {status === 'paused' ? <PauseIcon /> : kind === 'claude' ? <SparkIcon /> : <TerminalTypeIcon />}
    </span>
  );
}
