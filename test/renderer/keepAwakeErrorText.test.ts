import { describe, expect, it } from 'vitest';
import { keepAwakeErrorText } from '../../src/renderer/toasts/keepAwakeErrorText';

// Wortlaut des Fehler-Hinweises beim Wachhalten (Ticket 31): Titel nach dem, was scheiterte, Grund in einfachen Worten.

describe('Fehler-Hinweis beim Wachhalten', () => {
  it('Einschalten gescheitert: „ausgeschaltet“, Grund mit Fehlercode von Windows, wie man es erneut versucht', () => {
    expect(keepAwakeErrorText({ action: 'on', reason: 'windows', code: 5 })).toEqual({
      title: 'Rechner wach halten ausgeschaltet',
      reason: 'Windows hat die Anforderung abgelehnt (Fehler 5).',
      consequence: 'Zum erneuten Versuch den Schalter wieder einschalten.',
    });
  });

  it('Aufheben gescheitert: „liess sich nicht beenden“, Windows hält womöglich weiter wach', () => {
    expect(keepAwakeErrorText({ action: 'off', reason: 'windows', code: 6 })).toEqual({
      title: 'Wachhalten liess sich nicht beenden',
      reason: 'Windows hat die Anforderung abgelehnt (Fehler 6).',
      consequence: 'Windows hält den Rechner womöglich weiter wach, bis THub beendet wird.',
    });
  });

  it.each([
    [{ reason: 'windows' as const }, 'Windows hat die Anforderung abgelehnt.'],
    [{ reason: 'load' as const }, 'Die Verbindung zu Windows liess sich nicht herstellen.'],
    [{ reason: 'unsupported' as const }, 'Auf diesem System wird das nicht unterstützt.'],
    [{ reason: 'other' as const }, 'Ein unerwarteter Fehler ist aufgetreten.'],
  ])('Grund %o', (failure, reason) => {
    expect(keepAwakeErrorText({ action: 'on', ...failure }).reason).toBe(reason);
  });
});
