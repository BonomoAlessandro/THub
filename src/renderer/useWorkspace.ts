import { useCallback, useEffect, useState } from 'react';
import type { Settings, ShellOption, TabSnapshot } from '../shared/types';
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
} {
  const [view, setView] = useState<WorkspaceView | null>(null);

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
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const renameTab = useCallback((tabId: string, name: string) => {
    const trimmed = name.trim();
    setView((current) => {
      if (!current || !trimmed) return current;
      return { ...current, tabs: current.tabs.map((t) => (t.id === tabId ? { ...t, name: trimmed } : t)) };
    });
    if (trimmed) api.send({ type: 'renameTab', tabId, name: trimmed });
  }, []);

  return { view, renameTab };
}
