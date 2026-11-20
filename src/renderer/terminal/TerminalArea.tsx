import { useEffect, useLayoutEffect, useRef } from 'react';
import type { TabSnapshot } from '../../shared/types';
import { TerminalView } from './TerminalView';
import { terminalViews } from './terminalViews';

const api = window.thub;

interface TerminalAreaProps {
  tabs: TabSnapshot[];
  activeTabId: string | null;
  /** Schriftgrösse aller Terminals. */
  fontSize: number;
}

/**
 * Terminal-Fläche als Karte: ein xterm.js pro Tab, alle übereinander. Inaktive Ansichten werden
 * ausgeblendet, nicht zerstört, damit Inhalt und laufende Programme erhalten bleiben. Ein pausierter
 * Claude-Tab bekommt seine Ansicht erst, wenn er angezeigt wird: Dann setzt der Kern seine Session fort.
 */
export function TerminalArea({ tabs, activeTabId, fontSize }: TerminalAreaProps) {
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
          {tabs
            .filter((tab) => !tab.paused)
            .map((tab) => (
              <TerminalPane
                key={tab.id}
                tabId={tab.id}
                active={tab.id === activeTabId}
                exited={tab.process === 'exited'}
                fontSize={fontSize}
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
  fontSize: number;
}

function TerminalPane({ tabId, active, exited, fontSize }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<TerminalView | null>(null);
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  // Die Ansicht entsteht mit dem Tab und meldet sofort „bereit“; erst dann startet der Kern die Shell,
  // gleich in der Grösse, die zur eingestellten Schrift passt.
  useLayoutEffect(() => {
    const view = new TerminalView(tabId, hostRef.current!, fontSizeRef.current);
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

  // Alle Terminals zugleich, auch die verdeckten: Ihre Shells erfahren die neue Grösse sofort.
  useLayoutEffect(() => {
    viewRef.current?.setFontSize(fontSize);
  }, [fontSize]);

  return <div ref={hostRef} className={active ? 'terminal-host active' : 'terminal-host'} />;
}
