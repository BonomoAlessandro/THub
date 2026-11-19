import { useCallback, useEffect, useState } from 'react';
import type { TabSnapshot } from '../shared/types';
import { terminalViews } from './terminal/terminalViews';

const api = window.termhub;

/** Was die Oberfläche vom Zustand des Kerns anzeigt. */
export interface WorkspaceView {
  tabs: TabSnapshot[];
  activeTabId: string | null;
}

/**
 * Hält die Anzeige mit dem Kern im Gleichstand: zuerst der Schnappschuss, danach die
 * Änderungsereignisse. Ausgabe, Ende und Hinweise gehen direkt an die Terminal-Ansichten.
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
          setView({ tabs: event.tabs, activeTabId: event.activeTabId });
          return;
        case 'output':
          terminalViews.get(event.tabId)?.write(event.data);
          return;
        case 'exit':
          terminalViews.get(event.tabId)?.markExited(event.exitCode);
          return;
        case 'notice':
          terminalViews.get(event.tabId)?.notice(event.level, event.text);
          return;
        case 'settings':
          // Einstellungen zeigt die Oberfläche erst mit dem Einstellungsdialog (Ticket 05) wieder an.
          return;
      }
    });

    void api.loadSnapshot().then((snapshot) => {
      if (disposed) return;
      loaded = true;
      // Die gespeicherten Tabs zeigen; ihre Shells startet der Kern, sobald die Ansichten bereit sind.
      setView({ tabs: snapshot.tabs, activeTabId: snapshot.activeTabId });
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
