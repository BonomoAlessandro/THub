import { useEffect, useLayoutEffect, useRef } from 'react';
import type { TabSnapshot } from '../../shared/types';
import { TerminalView } from './TerminalView';
import { terminalViews } from './terminalViews';

const api = window.thub;

interface TerminalAreaProps {
  tabs: TabSnapshot[];
  activeTabId: string | null;
}

/**
 * Terminal-Fläche als Karte: ein xterm.js pro Tab, alle übereinander. Inaktive Ansichten werden
 * ausgeblendet, nicht zerstört, damit Inhalt und laufende Programme erhalten bleiben.
 */
export function TerminalArea({ tabs, activeTabId }: TerminalAreaProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeTabId);
  activeRef.current = activeTabId;

  // Ändert sich die Grösse der Fläche, passt sich die sichtbare Ansicht an; verdeckte beim Anzeigen.
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const observer = new ResizeObserver(() => {
      if (activeRef.current) terminalViews.get(activeRef.current)?.fit();
    });
    observer.observe(stack);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="terminal-area">
      <div className="terminal-card">
        <div className="terminal-stack" ref={stackRef}>
          {tabs.map((tab) => (
            <TerminalPane
              key={tab.id}
              tabId={tab.id}
              active={tab.id === activeTabId}
              exited={tab.process === 'exited'}
            />
          ))}
        </div>
        {tabs.length === 0 && (
          <div className="empty-state">
            <p>Kein Terminal offen.</p>
            <button className="btn primary" onClick={() => api.send({ type: 'createTab' })}>
              Neues Terminal
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

interface TerminalPaneProps {
  tabId: string;
  active: boolean;
  exited: boolean;
}

function TerminalPane({ tabId, active, exited }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<TerminalView | null>(null);

  // Die Ansicht entsteht mit dem Tab und meldet sofort „bereit“; erst dann startet der Kern die Shell.
  useLayoutEffect(() => {
    const view = new TerminalView(tabId, hostRef.current!);
    viewRef.current = view;
    terminalViews.set(tabId, view);
    view.reportReady();
    return () => {
      terminalViews.delete(tabId);
      viewRef.current = null;
      view.dispose();
    };
  }, [tabId]);

  useLayoutEffect(() => {
    viewRef.current?.setExited(exited);
  }, [exited]);

  useLayoutEffect(() => {
    if (active) viewRef.current?.show();
  }, [active]);

  return <div ref={hostRef} className={active ? 'terminal-host active' : 'terminal-host'} />;
}
