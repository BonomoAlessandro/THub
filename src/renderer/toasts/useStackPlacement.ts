import { useEffect, useLayoutEffect, useState } from 'react';
import { onTerminalChange, terminalViews } from '../terminal/terminalViews';
import { SteadyPlacement, freePlacement, placeStack, type StackPlacement } from './stackPlacement';

/** Was `.toasts` vom Hook bekommt: die Ref und das Halten unter der Maus. */
export interface StackProps {
  ref(element: HTMLDivElement | null): void;
  onMouseEnter(): void;
  onMouseLeave(): void;
}

/**
 * Hält den Stapel der Hinweise aus der Eingabe des sichtbaren Tabs heraus (Ticket 32). Liefert die Props für `.toasts`.
 * Gemessen und gesetzt wird nur, solange eine Karte steht.
 */
export function useStackPlacement(activeTabId: string | null): StackProps {
  const [placer] = useState(() => new StackPlacer());
  useEffect(() => placer.start(), [placer]);
  useLayoutEffect(() => placer.showTab(activeTabId), [placer, activeTabId]);
  // Nach jedem Zeichnen: Ein Hinweis kam dazu oder ging, oder eine Karte hat ihre Höhe geändert.
  useLayoutEffect(() => placer.stackDrawn());
  return placer.props;
}

/**
 * Der DOM-Teil zur reinen Rechnung in `stackPlacement.ts`: misst Fenster, Titelleiste, die Eingabe des aktiven Tabs
 * (`TerminalView.inputGeometry`) und die Höhe des Stapels, wählt das Band (`placeStack`), hält es ruhig
 * (`SteadyPlacement`) und setzt es an `.toasts`: `top`, `bottom`, `padding-top`, `padding-bottom` und `data-band`. Den
 * Übergang dorthin macht app.css.
 *
 * Ausgewertet wird höchstens einmal pro Bild: Ausgabe, Cursor, Scrollen, Grösse und Schrift des aktiven Terminals
 * (`onTerminalChange`), Wechsel des Tabs, Grösse des Fensters und jede neu gezeichnete Spalte melden sich nur an. Im
 * versteckten Fenster läuft `requestAnimationFrame` nicht; dort springt `setTimeout` ein.
 */
class StackPlacer {
  private element: HTMLDivElement | null = null;
  private tabId: string | null = null;
  /** Die Lage am Anfang ist die aus app.css: unten rechts wie bisher. */
  private readonly steady = new SteadyPlacement(freePlacement(window.innerHeight, titlebarHeight()));
  /** Bei der letzten Auswertung stand keine Karte. */
  private wasEmpty = true;
  /** Die Maus steht auf einer Karte. */
  private held = false;
  /** Meldet die angemeldete Auswertung wieder ab; null, solange keine ansteht. */
  private cancelFrame: (() => void) | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Zuletzt gesetzte Werte, damit gleiche nicht erneut geschrieben werden. */
  private appliedKey = '';

  readonly props: StackProps = {
    ref: (element) => {
      this.element = element;
    },
    onMouseEnter: () => this.hold(true),
    onMouseLeave: () => this.hold(false),
  };

  /** Hört auf Terminal, Fenster und Sichtbarkeit; liefert, wie man wieder aufhört. */
  start(): () => void {
    const stopTerminal = onTerminalChange((tabId) => {
      if (tabId === this.tabId) this.schedule();
    });
    window.addEventListener('resize', this.schedule);
    document.addEventListener('visibilitychange', this.onVisibility);
    return () => {
      stopTerminal();
      window.removeEventListener('resize', this.schedule);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.unschedule();
      clearTimeout(this.settleTimer);
    };
  }

  showTab(tabId: string | null): void {
    this.tabId = tabId;
    this.schedule();
  }

  /**
   * Die Spalte ist neu gezeichnet. Kommt die erste Karte (oder geht die letzte), wird sofort ausgewertet und ohne
   * Übergang gesetzt: Der erste Hinweis erscheint gleich am richtigen Platz und gleitet dort herein.
   */
  stackDrawn(): void {
    if (!this.element) return;
    if (isEmpty(this.element) !== this.wasEmpty) this.update();
    else this.schedule();
  }

  /** Meldet eine Auswertung für das nächste Bild an; ohne Karten gibt es nichts zu tun. */
  private readonly schedule = (): void => {
    if (this.cancelFrame || !this.element || isEmpty(this.element)) return;
    if (document.visibilityState === 'visible') {
      const id = requestAnimationFrame(this.update);
      this.cancelFrame = () => cancelAnimationFrame(id);
    } else {
      const id = setTimeout(this.update, 0);
      this.cancelFrame = () => clearTimeout(id);
    }
  };

  private unschedule(): void {
    this.cancelFrame?.();
    this.cancelFrame = null;
  }

  /** Ein angemeldetes Bild kommt im versteckten Fenster nie; mit der Sichtbarkeit neu anmelden. */
  private readonly onVisibility = (): void => {
    this.unschedule();
    this.schedule();
  };

  private hold(on: boolean): void {
    this.setHeld(on);
    // Danach rückt der Stapel nach, wenn inzwischen eine andere Lage ansteht.
    if (!on) this.schedule();
  }

  private setHeld(on: boolean): void {
    this.held = on;
    this.steady.hold(on);
  }

  /** Misst, wählt das Band und setzt es, sobald es ruhig ist. */
  private readonly update = (): void => {
    this.unschedule();
    const element = this.element;
    if (!element) return;
    const now = performance.now();
    const empty = isEmpty(element);
    // Verschwindet die Karte unter der Maus, kommt kein `mouseleave`; ohne Karte unter der Maus hält nichts.
    if (this.held && (empty || !element.matches(':hover'))) this.setHeld(false);

    const target = this.measure(element);
    if (empty || this.wasEmpty) {
      // Ohne Karte bewegt sich nichts Sichtbares; die erste Karte erscheint gleich am richtigen Platz.
      this.steady.jump(target);
      this.apply(element, target, false);
    } else {
      this.steady.propose(target, now);
      if (this.steady.settle(now)) this.apply(element, this.steady.shown, true);
    }
    this.wasEmpty = empty;

    clearTimeout(this.settleTimer);
    const due = this.steady.dueAt();
    if (due !== null) this.settleTimer = setTimeout(this.schedule, Math.max(0, due - now));
  };

  private measure(element: HTMLElement): StackPlacement {
    const geometry = this.tabId ? terminalViews.get(this.tabId)?.inputGeometry() : null;
    return placeStack({
      windowHeight: window.innerHeight,
      titlebarHeight: titlebarHeight(),
      terminalTop: geometry?.top ?? 0,
      rowHeight: geometry?.rowHeight ?? 0,
      input: geometry?.input ?? null,
      stackHeight: stackHeight(element),
    });
  }

  /** Setzt die Lage an die Spalte; ohne Übergang, wenn `animate` falsch ist. */
  private apply(element: HTMLElement, placement: StackPlacement, animate: boolean): void {
    const top = placement.areaTop - placement.padTop;
    const bottom = window.innerHeight - placement.areaBottom - placement.padBottom;
    const key = `${placement.band} ${top} ${bottom} ${placement.padTop} ${placement.padBottom}`;
    if (key === this.appliedKey) return;
    this.appliedKey = key;

    const { style } = element;
    if (!animate) style.transition = 'none';
    style.top = `${top}px`;
    style.bottom = `${bottom}px`;
    style.paddingTop = `${placement.padTop}px`;
    style.paddingBottom = `${placement.padBottom}px`;
    element.dataset.band = placement.band;
    if (!animate) {
      // Erst die neue Lage ohne Übergang übernehmen lassen (Reflow), dann den Übergang aus app.css wieder zulassen.
      void element.offsetHeight;
      style.transition = '';
    }
  }
}

function isEmpty(element: HTMLElement): boolean {
  return element.childElementCount === 0;
}

/** Höhe aller Karten samt den Abständen dazwischen; Layout-Werte, damit die Animation der Karten nicht mitzählt. */
function stackHeight(element: HTMLElement): number {
  const first = element.firstElementChild;
  const last = element.lastElementChild;
  if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) return 0;
  return last.offsetTop + last.offsetHeight - first.offsetTop;
}

/** Höhe der Titelleiste (`--titlebar-h`), unter der die Spalte beginnt. */
function titlebarHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--titlebar-h')) || 0;
}
