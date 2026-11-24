import { useCallback, useEffect, useState } from 'react';
import type { BusyTab, Settings, ShellOption, TabSnapshot, ToastSnapshot } from '../shared/types';
import { terminalViews } from './terminal/terminalViews';

const api = window.thub;

/** Was die Oberfläche vom Zustand des Kerns anzeigt. */
export interface WorkspaceView {
  tabs: TabSnapshot[];
  activeTabId: string | null;
  settings: Settings;
  /** Die erkannten Shells, in der Reihenfolge des Pfeil-Menüs. */
  shells: ShellOption[];
  /** Die Standard-Shell, so wie der Kern sie aus der Einstellung ableitet. */
  defaultShellId: string;
  /** Benutzerordner, zur Anzeige eines leeren Standardordners. */
  homeDir: string;
  /** Die Hinweise unten rechts, ältester zuerst. */
  toasts: ToastSnapshot[];
}

/** Eine offene Rückfrage des Kerns vor dem Schliessen: diese Tabs schliessen, in `busy` läuft noch etwas. */
export interface CloseQuestion {
  tabIds: string[];
  busy: BusyTab[];
}

/**
 * Hält die Anzeige mit dem Kern im Gleichstand: zuerst der Schnappschuss, danach die
 * Änderungsereignisse. Ausgabe, Ende, Hinweise und Verlauf gehen direkt an die Terminal-Ansichten;
 * fordert der Kern den Verlauf an, antworten sie mit ihrem serialisierten Inhalt.
 * Liefert `null`, solange der Schnappschuss noch nicht da ist.
 */
export function useWorkspace(): {
  view: WorkspaceView | null;
  /** Benennt einen Tab um und zeigt den neuen Namen sofort; der Kern bestätigt mit dem nächsten Ereignis. */
  renameTab(tabId: string, name: string): void;
  /** Die offene Rückfrage vor dem Schliessen; eine neue ersetzt sie. */
  closeQuestion: CloseQuestion | null;
  /** Antwort auf die Rückfrage: Bestätigt schliesst der Kern ihre Tabs, sonst bleiben alle offen. */
  answerCloseQuestion(question: CloseQuestion, confirmed: boolean): void;
} {
  const [view, setView] = useState<WorkspaceView | null>(null);
  const [closeQuestion, setCloseQuestion] = useState<CloseQuestion | null>(null);

  useEffect(() => {
    /** Erst nach dem Schnappschuss werden Ereignisse angewendet; frühere stecken schon darin. */
    let loaded = false;
    let disposed = false;

    // Zuerst abonnieren, dann den Schnappschuss holen: So geht kein Ereignis verloren.
    const unsubscribe = api.onEvent((event) => {
      if (!loaded) return;
      switch (event.type) {
        case 'tabs':
          setView((current) => current && { ...current, tabs: event.tabs, activeTabId: event.activeTabId });
          return;
        case 'toasts':
          setView((current) => current && { ...current, toasts: event.toasts });
          return;
        case 'settings':
          setView(
            (current) => current && { ...current, settings: event.settings, defaultShellId: event.defaultShellId },
          );
          return;
        case 'output':
          terminalViews.get(event.tabId)?.write(event.data);
          return;
        case 'exit':
          terminalViews.get(event.tabId)?.markExited(event.exitCode);
          return;
        case 'notice':
          terminalViews.get(event.tabId)?.notice(event.level, event.text, event.beforeStart === true);
          return;
        case 'restoreHistory':
          // Kommt nach „Ansicht bereit“ und vor der ersten Ausgabe der Shell.
          terminalViews.get(event.tabId)?.restoreHistory(event.content, event.savedAt);
          return;
        case 'requestHistory':
          for (const tabId of event.tabIds) {
            void terminalViews
              .get(tabId)
              ?.serializeHistory()
              .then((content) => api.send({ type: 'saveHistory', tabId, content }));
          }
          return;
        case 'askClose':
          setCloseQuestion({ tabIds: event.tabIds, busy: event.busy });
          return;
      }
    });

    void api.loadSnapshot().then((snapshot) => {
      if (disposed) return;
      loaded = true;
      // Die gespeicherten Tabs zeigen; ihre Shells startet der Kern, sobald die Ansichten bereit sind.
      setView({
        tabs: snapshot.tabs,
        activeTabId: snapshot.activeTabId,
        settings: snapshot.settings,
        shells: snapshot.shells,
        defaultShellId: snapshot.defaultShellId,
        homeDir: snapshot.homeDir,
        toasts: snapshot.toasts,
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  // Der Kern muss wissen, ob das Fenster im Vordergrund ist: Nur dann gilt der aktive Tab als angeschaut
  // („fertig“ verschwindet, Hinweise braucht es keine). Gemeldet beim Laden und bei jedem Wechsel.
  useEffect(() => {
    const report = (foreground: boolean) => api.send({ type: 'windowForeground', foreground });
    const onFocus = () => report(true);
    const onBlur = () => report(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    report(document.hasFocus());
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Der Countdown der „fertig“-Hinweise läuft, solange das Fenster sichtbar ist, auch ohne Fokus (Ticket 33). Chromium
  // setzt die Seite auf „hidden“, wenn das Fenster minimiert, versteckt oder ganz verdeckt ist und wenn der Bildschirm
  // gesperrt oder aus ist. Gemeldet beim Laden und bei jedem Wechsel.
  useEffect(() => {
    const report = () => api.send({ type: 'windowVisible', visible: document.visibilityState === 'visible' });
    document.addEventListener('visibilitychange', report);
    report();
    return () => document.removeEventListener('visibilitychange', report);
  }, []);

  const renameTab = useCallback((tabId: string, name: string) => {
    const trimmed = name.trim();
    setView((current) => {
      if (!current || !trimmed) return current;
      return { ...current, tabs: current.tabs.map((t) => (t.id === tabId ? { ...t, name: trimmed } : t)) };
    });
    if (trimmed) api.send({ type: 'renameTab', tabId, name: trimmed });
  }, []);

  const answerCloseQuestion = useCallback((question: CloseQuestion, confirmed: boolean) => {
    setCloseQuestion((current) => (current === question ? null : current));
    if (confirmed) api.send({ type: 'closeTabs', tabIds: question.tabIds });
  }, []);

  return { view, renameTab, closeQuestion, answerCloseQuestion };
}
