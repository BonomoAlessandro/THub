import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runShortcut, takesSharedKey } from './commands';
import { WheelSteps } from './fontSize';
import { Palette } from './palette/Palette';
import type { PaletteContext } from './palette/paletteEntries';
import { isPopupOpen } from './popup/popups';
import { SettingsDialog } from './settings/SettingsDialog';
import { ShortcutsDialog } from './settings/ShortcutsDialog';
import { resolveShortcut, resolveWheel, type ShortcutAction } from './shortcuts';
import { CloseDialog } from './tabs/CloseDialog';
import { TabBar, type RenameTarget } from './tabs/TabBar';
import { TerminalArea } from './terminal/TerminalArea';
import { Toasts } from './toasts/Toasts';
import { focusTerminal } from './terminal/terminalViews';
import { useWorkspace } from './useWorkspace';

/**
 * Das Fenster: Tab-Leiste oben, darunter die Terminal-Fläche, unten rechts die Hinweise; darüber bei Bedarf die
 * Befehlspalette, die Einstellungen, die Übersicht der Tastenkürzel oder die Rückfrage vor dem Schliessen.
 */
export function App() {
  /** Was gerade umbenannt wird: ein Tab oder eine Gruppe (Ticket 36). */
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  // Eine über „Neue Gruppe“ entstandene Gruppe geht sofort ins Umbenennen.
  const { view, renameTab, renameGroup, closeQuestion, answerCloseQuestion } = useWorkspace((groupId) =>
    setRenaming({ kind: 'group', id: groupId }),
  );
  const startRenameTab = useCallback((tabId: string) => setRenaming({ kind: 'tab', id: tabId }), []);
  const startRenameGroup = useCallback((groupId: string) => setRenaming({ kind: 'group', id: groupId }), []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Die offene Übersicht der Tastenkürzel und woher sie kam: Aus den Einstellungen geht es danach dorthin zurück. */
  const [shortcutsFrom, setShortcutsFrom] = useState<'palette' | 'settings' | null>(null);

  // Für die Handler ausserhalb von React (Tastenkürzel): immer der zuletzt angezeigte Zustand.
  const viewRef = useRef(view);
  viewRef.current = view;

  const finishRename = useCallback(
    (target: RenameTarget, name: string | null) => {
      setRenaming(null);
      if (name !== null && target.kind === 'tab') renameTab(target.id, name);
      if (name !== null && target.kind === 'group') renameGroup(target.id, name);
      // Danach geht der Fokus zurück ins Terminal.
      focusTerminal(viewRef.current?.activeTabId ?? null);
    },
    [renameTab, renameGroup],
  );

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    focusTerminal(viewRef.current?.activeTabId ?? null);
  }, []);

  // Die Palette übergibt den Fokus ans Terminal, bevor ein gewählter Befehl läuft; der kann ihn weitergeben (etwa an
  // einen Dialog oder das Umbenennen).
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    focusTerminal(viewRef.current?.activeTabId ?? null);
  }, []);

  const showShortcutsFromSettings = useCallback(() => {
    setSettingsOpen(false);
    setShortcutsFrom('settings');
  }, []);

  const closeShortcuts = useCallback(() => {
    if (shortcutsFrom === 'settings') {
      setSettingsOpen(true);
    } else {
      focusTerminal(viewRef.current?.activeTabId ?? null);
    }
    setShortcutsFrom(null);
  }, [shortcutsFrom]);

  // Nach der Rückfrage geht der Fokus ins Terminal: beim Abbrechen in das des aktiven Tabs, beim Schliessen in das des
  // Nachbarn, sobald der Kern ihn aktiv meldet.
  const answerClose = useCallback(
    (confirmed: boolean) => {
      if (!closeQuestion) return;
      answerCloseQuestion(closeQuestion, confirmed);
      focusTerminal(viewRef.current?.activeTabId ?? null);
    },
    [closeQuestion, answerCloseQuestion],
  );

  // Führt ein Tastenkürzel aus; was die Oberfläche selbst zeigt (Umbenennen, Palette), regelt sie hier.
  const runAppShortcut = useCallback((action: ShortcutAction) => {
    runShortcut(action, {
      activeTabId: viewRef.current?.activeTabId ?? null,
      // F2 benennt den aktiven Tab um, auch in einer Gruppe.
      startRename: startRenameTab,
      openPalette: () => setPaletteOpen(true),
    });
  }, [startRenameTab]);

  // Tastenkürzel in der Capture-Phase, also bevor xterm.js die Taste sieht. Solange ein Menü oder
  // Dialog offen ist, gehören die Tasten ihm, in Eingabefeldern dem Feld (auch Ctrl+C und Ctrl+V).
  // Ctrl+C und Ctrl+V nimmt THub nur, wenn es kopiert bzw. einfügt; sonst fängt es sie gar nicht erst ab, und xterm.js
  // schickt `^C` bzw. `^V` ans Programm (Ticket 34).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || isPopupOpen()) return;
      const view = viewRef.current;
      const action = view ? resolveShortcut(e, (shared) => takesSharedKey(shared, view)) : null;
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      runAppShortcut(action);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [runAppShortcut]);

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
      const action = step !== 0 && !isPopupOpen() ? resolveWheel(e, step) : null;
      if (action) runAppShortcut(action);
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, [runAppShortcut]);

  // Was die Befehle der Palette brauchen; neu nur, wenn sich Tabs, Gruppen oder das Wachhalten ändern.
  const tabs = view?.tabs;
  const groups = view?.groups;
  const activeTabId = view?.activeTabId ?? null;
  const keepAwakeOn = view?.settings.keepAwake ?? false;
  const keepAwakeMode = view?.settings.keepAwakeMode ?? 'system';
  const paletteContext = useMemo<PaletteContext>(
    () => ({
      tabs: tabs ?? [],
      groups: groups ?? [],
      activeTabId,
      startRename: startRenameTab,
      startRenameGroup,
      openSettings: () => setSettingsOpen(true),
      openShortcuts: () => setShortcutsFrom('palette'),
      keepAwake: { on: keepAwakeOn, mode: keepAwakeMode },
    }),
    [tabs, groups, activeTabId, keepAwakeOn, keepAwakeMode, startRenameTab, startRenameGroup],
  );

  if (!view) return null;

  // Ein inzwischen geschlossener Tab, eine verschwundene Gruppe wird nicht mehr umbenannt.
  const renamingNow =
    renaming &&
    (renaming.kind === 'tab'
      ? view.tabs.some((t) => t.id === renaming.id)
      : view.groups.some((g) => g.id === renaming.id))
      ? renaming
      : null;

  return (
    <>
      <TabBar
        tabs={view.tabs}
        groups={view.groups}
        activeTabId={view.activeTabId}
        shells={view.shells}
        defaultShellId={view.defaultShellId}
        renaming={renamingNow}
        onStartRename={setRenaming}
        onFinishRename={finishRename}
        onOpenSettings={() => setSettingsOpen(true)}
        keepAwake={view.settings.keepAwake}
        keepAwakeMode={view.settings.keepAwakeMode}
      />
      <TerminalArea tabs={view.tabs} activeTabId={view.activeTabId} fontSize={view.settings.fontSize} />
      <Toasts toasts={view.toasts} tabs={view.tabs} groups={view.groups} activeTabId={view.activeTabId} />
      {settingsOpen && (
        <SettingsDialog
          settings={view.settings}
          homeDir={view.homeDir}
          shells={view.shells}
          defaultShellId={view.defaultShellId}
          onClose={closeSettings}
          onShowShortcuts={showShortcutsFromSettings}
        />
      )}
      {shortcutsFrom && <ShortcutsDialog onClose={closeShortcuts} />}
      {paletteOpen && <Palette context={paletteContext} onClose={closePalette} />}
      {closeQuestion && <CloseDialog question={closeQuestion} onAnswer={answerClose} />}
    </>
  );
}
