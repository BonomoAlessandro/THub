// Hinweise unten rechts im Fenster (Ticket 14): welche gerade stehen, höchstens einer pro Tab, und der Countdown der
// Hinweise, die von selbst verschwinden. Wann ein Hinweis kommt und wann er geht, entscheidet der Workspace-Kern.

import type { ToastKind, ToastSnapshot } from '../../shared/types';
import type { CancelTimer, Clock } from './ports';

/** So lange Vordergrundzeit steht ein „fertig“-Hinweis. */
export const FINISHED_TOAST_MS = 6000;

/** Wie lange ein Hinweis dieser Art steht, in Vordergrundzeit; ohne Angabe, bis er weggenommen wird. */
const LIFETIME_MS: Partial<Record<ToastKind, number>> = { finished: FINISHED_TOAST_MS };

interface Toast {
  id: string;
  tabId: string;
  kind: ToastKind;
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
  /** Das Fenster ist im Vordergrund; nur dann laufen die Countdowns. Bis zur ersten Meldung nicht. */
  private foreground = false;

  constructor(
    private readonly clock: Clock,
    private readonly changed: () => void,
  ) {}

  /** Zeigt für den Tab einen Hinweis dieser Art. Ein Hinweis, den der Tab schon hat, verschwindet dafür. */
  show(tabId: string, kind: ToastKind): void {
    this.drop((t) => t.tabId === tabId);
    const toast: Toast = { id: `toast-${this.nextId++}`, tabId, kind };
    const lifetime = LIFETIME_MS[kind];
    if (lifetime !== undefined) {
      toast.countdown = { total: lifetime, remaining: lifetime, held: false };
      this.resume(toast);
    }
    this.toasts.push(toast);
    this.changed();
  }

  /** Nimmt den Hinweis des Tabs weg; mit `kind` nur, wenn er von dieser Art ist. */
  dismissTab(tabId: string, kind?: ToastKind): void {
    if (this.drop((t) => t.tabId === tabId && (kind === undefined || t.kind === kind))) this.changed();
  }

  /** Nimmt den Hinweis mit dieser Kennung weg (× am Hinweis). */
  dismiss(toastId: string): void {
    if (this.drop((t) => t.id === toastId)) this.changed();
  }

  /** Nimmt alle Hinweise weg. */
  clear(): void {
    if (this.drop(() => true)) this.changed();
  }

  /** Die Maus steht auf dem Hinweis bzw. nicht mehr: Solange hält sein Countdown an. */
  hold(toastId: string, hold: boolean): void {
    const toast = this.toasts.find((t) => t.id === toastId);
    const countdown = toast?.countdown;
    if (!toast || !countdown || countdown.held === hold) return;
    countdown.held = hold;
    this.update(toast);
  }

  /** Das Fenster ist im Vordergrund bzw. nicht mehr: Die Countdowns laufen weiter bzw. halten an. */
  setForeground(foreground: boolean): void {
    if (foreground === this.foreground) return;
    this.foreground = foreground;
    let changed = false;
    for (const toast of this.toasts) changed = this.update(toast, false) || changed;
    if (changed) this.changed();
  }

  snapshot(): ToastSnapshot[] {
    const now = this.clock.now();
    return this.toasts.map(({ id, tabId, kind, countdown }): ToastSnapshot => {
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
   * Lässt den Countdown des Hinweises laufen oder anhalten, je nach Vordergrund und Maus.
   * @param notify die Änderung gleich melden
   * @returns ob sich etwas geändert hat
   */
  private update(toast: Toast, notify = true): boolean {
    const countdown = toast.countdown;
    if (!countdown) return false;
    const shouldRun = this.foreground && !countdown.held;
    if (shouldRun === (countdown.running !== undefined)) return false;
    if (shouldRun) this.resume(toast);
    else this.pause(countdown);
    if (notify) this.changed();
    return true;
  }

  /** Startet den Countdown, wenn das Fenster im Vordergrund ist und die Maus nicht auf dem Hinweis steht. */
  private resume(toast: Toast): void {
    const countdown = toast.countdown;
    if (!countdown || countdown.running || !this.foreground || countdown.held) return;
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
