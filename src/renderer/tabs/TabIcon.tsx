import type { TabKind, TabStatus } from '../../shared/types';
import { PauseIcon, SparkIcon, TerminalTypeIcon } from '../icons';

/** Status als Text, für den Tooltip des Tabs (Wortlaut aus dem Prototyp). */
export const STATUS_TEXT: Record<TabStatus, string> = {
  idle: 'Ruht',
  working: 'Claude arbeitet',
  waiting: 'Claude wartet auf dich',
  processes: 'Prozesse laufen',
  finished: 'Claude ist fertig (noch nicht angeschaut)',
  paused: 'Pausiert, wird beim Öffnen fortgesetzt',
};

interface TabIconProps {
  kind: TabKind;
  status: TabStatus;
}

/**
 * Symbol-Platz links vom Tab-Namen, wie im Prototyp. Im Ruhezustand zeigt er gedämpft die Art des Tabs (`>_` bzw.
 * Claude-Stern), sonst den Status: violetter Stern, der rotiert und pulsiert (arbeitet); oranger Punkt mit
 * Ping-Ring (wartet); blauer, atmender Punkt (Prozesse laufen); grüner Punkt (fertig); graues Pause-Symbol.
 * Die Animationen stehen im CSS (`.st[data-s=…]`).
 */
export function TabIcon({ kind, status }: TabIconProps) {
  return (
    <span className="st" data-s={status} aria-hidden="true">
      <StatusGlyph kind={kind} status={status} />
    </span>
  );
}

function StatusGlyph({ kind, status }: TabIconProps) {
  switch (status) {
    case 'idle':
      return kind === 'claude' ? <SparkIcon /> : <TerminalTypeIcon />;
    case 'working':
      return <SparkIcon />;
    case 'waiting':
      // Punkt und Ring sind beide 8 px und liegen mittig übereinander (siehe .st-ping).
      return (
        <>
          <span className="st-dot" />
          <span className="st-ping" />
        </>
      );
    case 'paused':
      return <PauseIcon />;
    case 'processes':
    case 'finished':
      return <span className="st-dot" />;
  }
}
