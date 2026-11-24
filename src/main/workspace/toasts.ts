// Hinweise unten rechts im Fenster (Tickets 14 und 22): welche gerade stehen, höchstens einer je Platz und Tab, und der
// Countdown der Hinweise, die von selbst verschwinden; er läuft, solange das Fenster sichtbar ist (Ticket 33). Dazu der
// Fehler beim Wachhalten (Ticket 31), der zu keinem Tab gehört. Wann ein Hinweis kommt und wann er geht, entscheidet
// der Workspace-Kern.

import type { KeepAwakeFailure, ToastKind, ToastSnapshot } from '../../shared/types';
import type { CancelTimer, Clock } from './ports';

/** So lange steht ein „fertig“-Hinweis, gezählt nur, solange das Fenster sichtbar ist. */
export const FINISHED_TOAST_MS = 6000;

/** Wie lange ein Hinweis dieser Art steht, in Zeit mit sichtbarem Fenster; ohne Angabe, bis er weggenommen wird. */
const LIFETIME_MS: Partial<Record<ToastKind, number>> = { finished: FINISHED_TOAST_MS };

/** Die Hinweise zum Claude-Status eines Tabs; sie teilen sich einen Platz pro Tab. */
export const STATUS_TOASTS: readonly ToastKind[] = ['waiting', 'finished'];

/**
 * Welche Hinweise desselben Tabs ein neuer Hinweis dieser Art ersetzt. „Wartet“ und „fertig“ teilen sich einen Platz;
 * offene Punkte haben einen eigenen und ersetzen dazu „fertig“, weil sie mehr sagen als „Claude ist fertig“.
 */
const REPLACES: Record<ToastKind, readonly ToastKind[]> = {
  waiting: STATUS_TOASTS,
  finished: STATUS_TOASTS,
  openPoints: ['openPoints', 'finished'],
  keepAwakeError: ['keepAwakeError'],
};

interface Toast {
  id: string;
  /** Der Tab des Hinweises; fehlt beim Fehler des Wachhaltens. */
  tabId?: string;
  kind: ToastKind;
  /** Nur bei offenen Punkten. */
  points?: string[];
  /** Nur beim Fehler des Wachhaltens. */
  failure?: KeepAwakeFailure;
  /** Nur bei Hinweisen, die von selbst verschwinden. */
  countdown?: Countdown;
}

interface Countdown {
  total: number;
  /** Übrig beim letzten Anhalten bzw. beim Start, in ms. */
  remaining: number;
  /** Die Maus steht auf dem Hinweis. */
  held: boolean;
  /** Seit wann er läuft (Uhr des Kerns), und der Zeitgeber bis zum Ende; beides fehlt, solange er anhält. */
  running?: { since: number; cancel: CancelTimer };
}

/**
 * Die Hinweise, die gerade stehen, in der Reihenfolge ihres Erscheinens. Jede Änderung meldet `changed`, auch ein
 * Countdown, der anhält oder weiterläuft (die Oberfläche zeichnet daraus den Fortschritt).
 */
export class ToastBoard {
  private toasts: Toast[] = [];
  private nextId = 1;
  /**
   * Das Fenster ist sichtbar (nicht minimiert, versteckt, ganz verdeckt oder hinter dem Sperrbildschirm); nur dann laufen
   * die Countdowns. Ob es den Fokus hat, zählt nicht (Ticket 33). Bis zur ersten Meldung gilt es als nicht sichtbar.
   */
  private windowVisible = false;

  constructor(
    private readonly clock: Clock,
    private readonly changed: () => void,
  ) {}

  /**
   * Zeigt für den Tab einen Hinweis dieser Art; offene Punkte mit ihren Punkten. Die Hinweise des Tabs, die er ersetzt
   * (`REPLACES`), verschwinden dafür.
   */
  show(tabId: string, kind: 'waiting' | 'finished'): void;
  show(tabId: string, kind: 'openPoints', points: string[]): void;
  show(tabId: string, kind: ToastKind, points?: string[]): void {
    const replaced = REPLACES[kind];
    this.drop((t) => t.tabId === tabId && replaced.includes(t.kind));
    const toast: Toast = { id: `toast-${this.nextId++}`, tabId, kind };
    if (kind === 'openPoints') toast.points = [...(points ?? [])];
    const lifetime = LIFETIME_MS[kind];
    if (lifetime !== undefined) {
      toast.countdown = { total: lifetime, remaining: lifetime, held: false };
      this.resume(toast);
    }
    this.toasts.push(toast);
    this.changed();
  }

  /**
   * Zeigt den Fehler beim Wachhalten (Ticket 31). Er gehört zu keinem Tab, hat keinen Countdown und steht höchstens
   * einmal da: Ein neuer ersetzt den bisherigen, mit dem letzten Grund.
   */
  showKeepAwakeError(failure: KeepAwakeFailure): void {
    this.drop((t) => t.kind === 'keepAwakeError');
    this.toasts.push({ id: `toast-${this.nextId++}`, kind: 'keepAwakeError', failure: { ...failure } });
    this.changed();
  }

  /** Nimmt die Hinweise des Tabs weg; mit `kinds` nur die dieser Arten. */
  dismissTab(tabId: string, kinds?: readonly ToastKind[]): void {
    if (this.drop((t) => t.tabId === tabId && (kinds === undefined || kinds.includes(t.kind)))) this.changed();
  }

  /**
   * Zu welchem Tab der Hinweis mit dieser Kennung gehört (keiner beim Fehler des Wachhaltens) und welcher Art er ist;
   * nichts, wenn er nicht (mehr) steht.
   */
  find(toastId: string): { tabId?: string; kind: ToastKind } | undefined {
    const toast = this.toasts.find((t) => t.id === toastId);
    return toast && { tabId: toast.tabId, kind: toast.kind };
  }

  /** Nimmt den Hinweis mit dieser Kennung weg (× am Hinweis); liefert, zu welchem Tab er gehörte und welcher Art er war. */
  dismiss(toastId: string): { tabId?: string; kind: ToastKind } | undefined {
    const toast = this.toasts.find((t) => t.id === toastId);
    if (!toast) return undefined;
    this.drop((t) => t === toast);
    this.changed();
    return { tabId: toast.tabId, kind: toast.kind };
  }

  /** Nimmt alle Hinweise weg; mit `kinds` nur die dieser Arten. */
  clear(kinds?: readonly ToastKind[]): void {
    if (this.drop((t) => kinds === undefined || kinds.includes(t.kind))) this.changed();
  }

  /** Die Maus steht auf dem Hinweis bzw. nicht mehr: Solange hält sein Countdown an. */
  hold(toastId: string, hold: boolean): void {
    const toast = this.toasts.find((t) => t.id === toastId);
    const countdown = toast?.countdown;
    if (!toast || !countdown || countdown.held === hold) return;
    countdown.held = hold;
    this.update(toast);
  }

  /** Das Fenster ist sichtbar bzw. nicht mehr: Die Countdowns laufen weiter bzw. halten an. */
  setWindowVisible(visible: boolean): void {
    if (visible === this.windowVisible) return;
    this.windowVisible = visible;
    let changed = false;
    for (const toast of this.toasts) changed = this.update(toast, false) || changed;
    if (changed) this.changed();
  }

  snapshot(): ToastSnapshot[] {
    const now = this.clock.now();
    return this.toasts.map(({ id, tabId = '', kind, points, failure, countdown }): ToastSnapshot => {
      if (kind === 'keepAwakeError') return { id, kind, failure: { ...(failure ?? { action: 'on', reason: 'other' }) } };
      if (kind === 'openPoints') return { id, tabId, kind, points: [...(points ?? [])] };
      if (kind === 'waiting' || !countdown) return { id, tabId, kind: 'waiting' };
      const remaining = countdown.running
        ? Math.max(0, countdown.remaining - (now - countdown.running.since))
        : countdown.remaining;
      return {
        id,
        tabId,
        kind,
        countdown: { totalMs: countdown.total, remainingMs: remaining, running: countdown.running !== undefined },
      };
    });
  }

  /**
   * Lässt den Countdown des Hinweises laufen oder anhalten, je nach Sichtbarkeit des Fensters und Maus.
   * @param notify die Änderung gleich melden
   * @returns ob sich etwas geändert hat
   */
  private update(toast: Toast, notify = true): boolean {
    const countdown = toast.countdown;
    if (!countdown) return false;
    const shouldRun = this.windowVisible && !countdown.held;
    if (shouldRun === (countdown.running !== undefined)) return false;
    if (shouldRun) this.resume(toast);
    else this.pause(countdown);
    if (notify) this.changed();
    return true;
  }

  /** Startet den Countdown, wenn das Fenster sichtbar ist und die Maus nicht auf dem Hinweis steht. */
  private resume(toast: Toast): void {
    const countdown = toast.countdown;
    if (!countdown || countdown.running || !this.windowVisible || countdown.held) return;
    countdown.running = {
      since: this.clock.now(),
      cancel: this.clock.schedule(countdown.remaining, () => {
        countdown.running = undefined;
        this.dismiss(toast.id);
      }),
    };
  }

  private pause(countdown: Countdown): void {
    const running = countdown.running;
    if (!running) return;
    running.cancel();
    countdown.remaining = Math.max(0, countdown.remaining - (this.clock.now() - running.since));
    countdown.running = undefined;
  }

  /** Entfernt die passenden Hinweise samt ihrem Countdown; liefert, ob es welche gab. */
  private drop(match: (toast: Toast) => boolean): boolean {
    const dropped = this.toasts.filter(match);
    if (dropped.length === 0) return false;
    for (const toast of dropped) toast.countdown?.running?.cancel();
    this.toasts = this.toasts.filter((t) => !match(t));
    return true;
  }
}
