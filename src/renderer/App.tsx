import { useCallback, useEffect, useRef, useState } from 'react';
import { isPopupOpen } from './popup/popups';
import { SettingsDialog } from './settings/SettingsDialog';
import { resolveShortcut, type ShortcutAction } from './shortcuts';
import { TabBar } from './tabs/TabBar';
import { TerminalArea } from './terminal/TerminalArea';
import { focusTerminal, terminalViews } from './terminal/terminalViews';
import { useWorkspace, type WorkspaceView } from './useWorkspace';

const api = window.thub;

/** Das Fenster: Tab-Leiste oben, darunter die Terminal-Fläche; darüber bei Bedarf die Einstellungen. */
export function App() {
  const { view, renameTab } = useWorkspace();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Für die Handler ausserhalb von React (Tastenkürzel): immer der zuletzt angezeigte Zustand.
  const viewRef = useRef(view);
  viewRef.current = view;

  const finishRename = useCallback(
    (tabId: string, name: string | null) => {
      setRenamingId(null);
      if (name !== null) renameTab(tabId, name);
      // Danach geht der Fokus zurück ins Terminal.
      focusTerminal(viewRef.current?.activeTabId ?? null);
    },
    [renameTab],
  );

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    focusTerminal(viewRef.current?.activeTabId ?? null);
  }, []);

  // Tastenkürzel in der Capture-Phase, also bevor xterm.js die Taste sieht. Solange ein Menü oder
  // Dialog offen ist, gehören die Tasten ihm.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || isPopupOpen()) return;
      const current = viewRef.current;
      const action = current ? resolveShortcut(e) : null;
      if (!current || !action) return;
      e.preventDefault();
      e.stopPropagation();
      runShortcut(action, current, setRenamingId);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  if (!view) return null;

  // Ein inzwischen geschlossener Tab wird nicht mehr umbenannt.
  const renaming = view.tabs.some((t) => t.id === renamingId) ? renamingId : null;

  return (
    <>
      <TabBar
        tabs={view.tabs}
        activeTabId={view.activeTabId}
        shells={view.shells}
        defaultShellId={view.defaultShellId}
        renamingId={renaming}
        onStartRename={setRenamingId}
        onFinishRename={finishRename}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <TerminalArea tabs={view.tabs} activeTabId={view.activeTabId} />
      {settingsOpen && (
        <SettingsDialog
          settings={view.settings}
          homeDir={view.homeDir}
          shells={view.shells}
          defaultShellId={view.defaultShellId}
          onClose={closeSettings}
        />
      )}
    </>
  );
}

/** Führt ein Tastenkürzel aus: Tab-Befehle gehen an den Kern, Kopieren und Einfügen ans Terminal. */
function runShortcut(action: ShortcutAction, view: WorkspaceView, startRename: (tabId: string) => void): void {
  const activeId = view.activeTabId;
  switch (action.type) {
    case 'newTab':
      api.send({ type: 'createTab' });
      return;
    case 'closeTab':
      if (activeId) api.send({ type: 'closeTab', tabId: activeId });
      return;
    case 'copy':
      if (activeId) void terminalViews.get(activeId)?.copySelection();
      return;
    case 'paste':
      if (activeId) void terminalViews.get(activeId)?.paste();
      return;
    case 'nextTab':
      api.send({ type: 'activateRelativeTab', offset: 1 });
      return;
    case 'previousTab':
      api.send({ type: 'activateRelativeTab', offset: -1 });
      return;
    case 'tabAt':
      api.send({ type: 'activateTabAt', index: action.index });
      return;
    case 'renameTab':
      if (activeId) startRename(activeId);
      return;
  }
}
