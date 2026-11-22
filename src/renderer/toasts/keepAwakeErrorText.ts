// Der Wortlaut des Fehler-Hinweises beim Wachhalten (Ticket 31), ohne DOM, damit er sich prüfen lässt.

import type { KeepAwakeFailure } from '../../shared/types';

export interface KeepAwakeErrorText {
  title: string;
  /** Der Grund in einfachen Worten. */
  reason: string;
  /** Was das für den Nutzer heisst. */
  consequence: string;
}

/** Titel, Grund und Folge des Hinweises, je nachdem, was scheiterte und warum. */
export function keepAwakeErrorText(failure: KeepAwakeFailure): KeepAwakeErrorText {
  return {
    title: failure.action === 'on' ? 'Rechner wach halten ausgeschaltet' : 'Wachhalten liess sich nicht beenden',
    reason: reasonText(failure),
    consequence:
      failure.action === 'on'
        ? 'Zum erneuten Versuch den Schalter wieder einschalten.'
        : 'Windows hält den Rechner womöglich weiter wach, bis THub beendet wird.',
  };
}

function reasonText({ reason, code }: KeepAwakeFailure): string {
  switch (reason) {
    case 'windows':
      return code === undefined
        ? 'Windows hat die Anforderung abgelehnt.'
        : `Windows hat die Anforderung abgelehnt (Fehler ${code}).`;
    case 'load':
      return 'Die Verbindung zu Windows liess sich nicht herstellen.';
    case 'unsupported':
      return 'Auf diesem System wird das nicht unterstützt.';
    case 'other':
      return 'Ein unerwarteter Fehler ist aufgetreten.';
  }
}
