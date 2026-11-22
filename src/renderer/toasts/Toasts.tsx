import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { TabSnapshot, ToastCountdown, ToastSnapshot } from '../../shared/types';
import { AlertIcon, ArrowRightIcon, CloseIcon, ListIcon } from '../icons';
import { TabIcon } from '../tabs/TabIcon';
import { focusTerminal } from '../terminal/terminalViews';
import { keepAwakeErrorText } from './keepAwakeErrorText';

const api = window.thub;

interface ToastsProps {
  /** Die Hinweise, wie der Kern sie meldet: in der Reihenfolge ihres Erscheinens, ältester zuerst. */
  toasts: ToastSnapshot[];
  tabs: TabSnapshot[];
  activeTabId: string | null;
}

/**
 * Hinweise unten rechts im Fenster, wie im Prototyp gestapelt, der neueste oben. Welche stehen, entscheidet der Kern;
 * hier gleitet ein neuer herein und ein verschwindender hinaus. Ein Hinweis, den ein neuer desselben Tabs ersetzt,
 * verschwindet ohne Animation. Hinweise nehmen dem Terminal nie den Fokus.
 */
export function Toasts({ toasts, tabs, activeTabId }: ToastsProps) {
  const [shown, forget] = useShownToasts(toasts);

  // Ein geschlossener Tab nimmt seinen Hinweis ohne Animation mit: Ohne Tab gibt es nichts mehr zu zeigen. Der Fehler
  // beim Wachhalten gehört zu keinem Tab und gleitet immer hinaus.
  useEffect(() => {
    for (const { toast, leaving } of shown) {
      if (leaving && toast.tabId !== undefined && !tabs.some((t) => t.id === toast.tabId)) forget(toast.id);
    }
  }, [shown, tabs, forget]);

  return (
    <div className="toasts" aria-live="polite">
      {shown
        .slice()
        .reverse()
        .map(({ toast, leaving }) => {
          if (toast.kind === 'keepAwakeError') {
            return <ErrorToastCard key={toast.id} toast={toast} leaving={leaving} onLeft={forget} />;
          }
          const tab = tabs.find((t) => t.id === toast.tabId);
          if (!tab) return null;
          return (
            <ToastCard
              key={toast.id}
              toast={toast}
              tabName={tab.name}
              active={tab.id === activeTabId}
              leaving={leaving}
              onLeft={forget}
            />
          );
        })}
    </div>
  );
}

interface ShownToast {
  toast: ToastSnapshot;
  /** Der Kern hat ihn weggenommen; er gleitet gerade hinaus. */
  leaving: boolean;
}

/**
 * Die angezeigten Hinweise: die des Kerns, dazu die verschwindenden, bis ihre Animation zu Ende ist. Liefert dazu, wie
 * ein verschwundener vergessen wird.
 */
function useShownToasts(toasts: ToastSnapshot[]): [ShownToast[], (toastId: string) => void] {
  const [state, setState] = useState(() => ({ source: toasts, shown: toasts.map((toast) => ({ toast, leaving: false })) }));
  let current = state;
  // Neue Meldung des Kerns: noch während des Zeichnens abgleichen, damit kein Bild mit dem alten Stand entsteht.
  if (state.source !== toasts) {
    current = { source: toasts, shown: mergeToasts(state.shown, toasts) };
    setState(current);
  }
  const forget = useCallback((toastId: string) => {
    setState((s) => ({ ...s, shown: s.shown.filter((item) => !(item.leaving && item.toast.id === toastId)) }));
  }, []);
  return [current.shown, forget];
}

/**
 * Gleicht die angezeigten Hinweise mit der neuen Meldung ab: Bestehende bekommen ihren neuen Stand (etwa den
 * Countdown), weggenommene gleiten an ihrem Platz hinaus, neue kommen hinten dazu. Ein weggenommener Hinweis, dessen
 * Tab gerade einen neuen bekommt, verschwindet sofort, wie im Prototyp.
 */
function mergeToasts(shown: ShownToast[], next: ToastSnapshot[]): ShownToast[] {
  const known = new Set(shown.map((item) => item.toast.id));
  const added = next.filter((toast) => !known.has(toast.id));
  const replacedTabs = new Set(added.map((toast) => toast.tabId));
  const result: ShownToast[] = [];
  for (const item of shown) {
    const update = next.find((toast) => toast.id === item.toast.id);
    if (update) result.push({ toast: update, leaving: false });
    else if (!replacedTabs.has(item.toast.tabId)) result.push({ toast: item.toast, leaving: true });
  }
  for (const toast of added) result.push({ toast, leaving: false });
  return result;
}

type ErrorToast = Extract<ToastSnapshot, { kind: 'keepAwakeError' }>;
type TabToast = Exclude<ToastSnapshot, ErrorToast>;

/**
 * Fehler beim Wachhalten (Ticket 31), als Fehler markiert: Fehlersymbol und Rand in der Fehlerfarbe, für Screenreader
 * `role="alert"`. Er gehört zu keinem Tab; ein Klick oder das × schliesst ihn.
 */
function ErrorToastCard({
  toast,
  leaving,
  onLeft,
}: {
  toast: ErrorToast;
  leaving: boolean;
  onLeft(toastId: string): void;
}) {
  const { title, reason, consequence } = keepAwakeErrorText(toast.failure);
  const dismiss = () => api.send({ type: 'dismissToast', toastId: toast.id });
  return (
    <div
      className={leaving ? 'toast error out' : 'toast error'}
      role="alert"
      title="Hinweis schliessen"
      data-toast-kind="keepAwakeError"
      // Nie den Fokus nehmen, wie bei den übrigen Hinweisen.
      onMouseDown={(e) => e.preventDefault()}
      onClick={dismiss}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onLeft(toast.id);
      }}
    >
      <span className="t-err" aria-hidden="true">
        <AlertIcon />
      </span>
      <div className="t-body">
        <div className="t-title">{title}</div>
        <div className="t-msg">{reason}</div>
        <div className="t-msg">{consequence}</div>
      </div>
      <button
        type="button"
        className="t-close"
        aria-label="Hinweis schliessen"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

interface ToastCardProps {
  toast: TabToast;
  tabName: string;
  /** Der Tab des Hinweises ist der aktive (etwa wenn das Fenster im Hintergrund war). */
  active: boolean;
  leaving: boolean;
  onLeft(toastId: string): void;
}

/**
 * Eine Karte: Symbol, Tab-Name, Inhalt der Art und die dezente Zeile „Zum Tab wechseln →“. Die ganze Karte zeigt den
 * Tab an (ein Hinweis mit offenen Punkten verschwindet dabei), das × (beim Überfahren) nimmt nur den Hinweis weg. Ein
 * Countdown erscheint als Linie am unteren Rand; solange die Maus auf der Karte steht, hält er an.
 */
function ToastCard({ toast, tabName, active, leaving, onLeft }: ToastCardProps) {
  const hold = (on: boolean) => {
    if (toast.kind === 'finished') api.send({ type: 'holdToast', toastId: toast.id, hold: on });
  };
  // Der Kern zeigt den Tab an und nimmt einen Hinweis mit offenen Punkten dabei weg; ist der Tab schon aktiv, bekommt
  // nur sein Terminal den Fokus.
  const open = () => {
    api.send({ type: 'openToast', toastId: toast.id });
    if (active) focusTerminal(toast.tabId);
  };
  const { icon, message } = toastContent(toast);

  return (
    <div
      className={leaving ? 'toast out' : 'toast'}
      role="button"
      title={`„${tabName}“ öffnen`}
      // Nie den Fokus nehmen: Ohne den Standard von mousedown bleibt er im Terminal, auch beim Klick aufs ×.
      onMouseDown={(e) => e.preventDefault()}
      onClick={open}
      onMouseEnter={() => hold(true)}
      onMouseLeave={() => hold(false)}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onLeft(toast.id);
      }}
    >
      {icon}
      <div className="t-body">
        <div className="t-title">{tabName}</div>
        {message}
        <div className="t-hint">
          Zum Tab wechseln <ArrowRightIcon />
        </div>
      </div>
      <button
        type="button"
        className="t-close"
        aria-label="Hinweis schliessen"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          api.send({ type: 'dismissToast', toastId: toast.id });
        }}
      >
        <CloseIcon />
      </button>
      {toast.kind === 'finished' && (
        <CountdownLine key={`${toast.countdown.remainingMs}:${toast.countdown.running}`} countdown={toast.countdown} />
      )}
    </div>
  );
}

/** So viele offene Punkte zeigt eine Karte höchstens; die übrigen fasst „+ k weitere“ zusammen. */
const SHOWN_POINTS = 4;

/**
 * Was eine Karte je Art zeigt: das Symbol und den Inhalt unter dem Tab-Namen. „Wartet“ und „fertig“ zeigen das
 * Status-Symbol des Tabs und den Wortlaut aus dem Prototyp; offene Punkte ein Aufzählungssymbol, „Offene Punkte (n)“
 * und höchstens vier Punkte, jeder höchstens zwei Zeilen (ganz im Tooltip).
 */
function toastContent(toast: TabToast): { icon: ReactNode; message: ReactNode } {
  switch (toast.kind) {
    case 'waiting':
      return {
        icon: <TabIcon kind="claude" status="waiting" />,
        message: <div className="t-msg">Claude wartet auf deine Bestätigung.</div>,
      };
    case 'finished':
      return {
        icon: <TabIcon kind="claude" status="finished" />,
        message: <div className="t-msg">Claude ist fertig.</div>,
      };
    case 'openPoints': {
      const { points } = toast;
      const more = points.length - SHOWN_POINTS;
      return {
        icon: (
          <span className="st" data-s="points" aria-hidden="true">
            <ListIcon />
          </span>
        ),
        message: (
          <>
            <div className="t-msg">Offene Punkte ({points.length})</div>
            <ul className="t-points">
              {points.slice(0, SHOWN_POINTS).map((point, k) => (
                <li key={k} title={point}>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            {more > 0 && <div className="t-more">+ {more} weitere</div>}
          </>
        ),
      };
    }
  }
}

/**
 * Die Linie am unteren Rand: Sie schrumpft vom übrigen Anteil bis auf null, in der übrigen Zeit. Hält der Countdown
 * an, steht sie still; bei jeder Meldung des Kerns beginnt sie neu (`key`) mit seinem Stand.
 */
function CountdownLine({ countdown }: { countdown: ToastCountdown }) {
  const style = {
    '--p': String(countdown.remainingMs / countdown.totalMs),
    '--d': `${countdown.remainingMs}ms`,
    animationPlayState: countdown.running ? 'running' : 'paused',
  } as CSSProperties;
  return <div className="t-progress" style={style} />;
}
