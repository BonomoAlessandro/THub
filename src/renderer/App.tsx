import { useCallback, useEffect, useRef, useState } from 'react';
import { FONT_SIZE } from '../shared/types';
import { stepFontSize, WheelSteps } from './fontSize';
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

  // Ctrl + Mausrad ändert die Schriftgrösse aller Terminals. Abgefangen wird es überall und vor xterm.js:
  // Sonst scrollte das Terminal mit, und Chromium zoomte die ganze Oberfläche. Solange ein Menü oder
  // Dialog offen ist, ruht es wie die Tastenkürzel.
  useEffect(() => {
    const wheel = new WheelSteps();
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const step = wheel.add(e.deltaY, e.deltaMode);
      const current = viewRef.current;
      if (step !== 0 && current && !isPopupOpen()) setFontSize(current, stepFontSize(current.settings.fontSize, step));
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  if (!view) return null;

  // Ein inzwischen geschlossener Tab wird nicht mehr umbenannt.
  const renaming = view.tabs.some((t) => t.id === renamingId) ? renamingId : null;

  return (
    <>
      <TabBar
        tabs={view.tabs}
        activeTabId={view.activeTabId}
        renamingId={renaming}
        onStartRename={setRenamingId}
        onFinishRename={finishRename}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <TerminalArea tabs={view.tabs} activeTabId={view.activeTabId} fontSize={view.settings.fontSize} />
      {settingsOpen && <SettingsDialog settings={view.settings} homeDir={view.homeDir} onClose={closeSettings} />}
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
    case 'fontSize':
      setFontSize(view, stepFontSize(view.settings.fontSize, action.step));
      return;
    case 'resetFontSize':
      setFontSize(view, FONT_SIZE.default);
      return;
  }
}

/** Schriftgrösse aller Terminals; der Kern speichert sie und meldet sie zurück, dann passen sich die Terminals an. */
function setFontSize(view: WorkspaceView, size: number): void {
  if (size !== view.settings.fontSize) api.send({ type: 'updateSettings', patch: { fontSize: size } });
}
