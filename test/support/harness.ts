// Test-Gerüst für Teststelle 1: ein Workspace-Kern mit nachgemachten Ports, so wie ihn die App
// beim Start erzeugt, und ein simulierter Neustart auf demselben gespeicherten Zustand.

import type { ShellInfo, StateStorage, TabHistory } from '../../src/main/workspace/ports';
import { createWorkspace, type Workspace } from '../../src/main/workspace/workspace';
import type { TabSnapshot, WorkspaceEvent, WorkspaceSnapshot } from '../../src/shared/types';
import {
  FakeClock,
  FakeProcessProbe,
  FakeSystem,
  FakeTerminalBackend,
  MemoryStorage,
  type FakeSystemOptions,
} from './fakes';

export const TEST_SHELLS: ShellInfo[] = [
  { id: 'pwsh', name: 'PowerShell 7', file: 'pwsh.exe', args: [], capturesClaude: true },
  { id: 'powershell', name: 'Windows PowerShell', file: 'powershell.exe', args: [], capturesClaude: true },
  { id: 'cmd', name: 'cmd', file: 'cmd.exe', args: [], capturesClaude: true },
];

export interface TestWorkspaceOptions extends FakeSystemOptions {
  /** Roher gespeicherter Zustand vor dem ersten Start, z.B. eine Datei der Version 1. */
  state?: unknown;
  /** Eigener Speicher, z.B. der echte StateStore in einem Temp-Ordner; ersetzt `state`. */
  storage?: StateStorage;
  shells?: ShellInfo[];
}

/**
 * Die Oberfläche, soweit die Kern-Tests sie brauchen: Sie zeigt pro Tab den wiederhergestellten Verlauf
 * und die Ausgabe der Shell an und liefert diesen Inhalt, wenn der Kern den Verlauf anfordert. Sie
 * antwortet sofort; mit `answersHistory = false` spielt sie einen Renderer, der nicht mehr antwortet.
 */
export class TestRenderer {
  answersHistory = true;
  private readonly screens = new Map<string, string>();

  constructor(private readonly workspace: Workspace) {}

  /** Was im Terminal des Tabs steht. */
  screen(tabId: string): string {
    return this.screens.get(tabId) ?? '';
  }

  handle(event: WorkspaceEvent): void {
    switch (event.type) {
      case 'restoreHistory':
        this.screens.set(event.tabId, event.content);
        return;
      case 'output':
        this.screens.set(event.tabId, this.screen(event.tabId) + event.data);
        return;
      case 'requestHistory':
        if (!this.answersHistory) return;
        for (const tabId of event.tabIds) this.workspace.saveHistory(tabId, this.screen(tabId));
        return;
    }
  }
}

interface Instance {
  workspace: Workspace;
  terminal: FakeTerminalBackend;
  renderer: TestRenderer;
  events: WorkspaceEvent[];
}

export class TestWorkspace {
  readonly storage: StateStorage;
  readonly clock = new FakeClock();
  readonly processes = new FakeProcessProbe();
  readonly system: FakeSystem;
  private readonly shells: ShellInfo[];
  private current: Instance;

  constructor(options: TestWorkspaceOptions = {}) {
    this.storage = options.storage ?? new MemoryStorage(options.state ?? null);
    this.system = new FakeSystem(options);
    this.shells = options.shells ?? TEST_SHELLS;
    this.current = this.boot();
  }

  /** Der laufende Kern; nach `restart()` ein neuer. */
  get workspace(): Workspace {
    return this.current.workspace;
  }

  /** Terminal-Backend des laufenden Kerns; nach einem Neustart laufen keine Shells mehr. */
  get terminal(): FakeTerminalBackend {
    return this.current.terminal;
  }

  /** Ereignisse, die der Renderer vom laufenden Kern bekommen hat. */
  get events(): WorkspaceEvent[] {
    return this.current.events;
  }

  /** Die Oberfläche des laufenden Kerns; nach einem Neustart eine neue mit leeren Terminals. */
  get renderer(): TestRenderer {
    return this.current.renderer;
  }

  /**
   * Simuliert einen Neustart der App: Der Kern wird geordnet beendet, danach entsteht ein neuer
   * Kern auf demselben gespeicherten Zustand, mit frischem Terminal-Backend.
   */
  async restart(): Promise<void> {
    await this.current.workspace.shutdown();
    this.current = this.boot();
  }

  snapshot(): WorkspaceSnapshot {
    return this.workspace.snapshot();
  }

  tabs(): TabSnapshot[] {
    return this.snapshot().tabs;
  }

  activeTab(): TabSnapshot | undefined {
    const { tabs, activeTabId } = this.snapshot();
    return tabs.find((t) => t.id === activeTabId);
  }

  /** Der gesicherte Verlauf eines Tabs, so wie er im Speicher liegt. */
  storedHistory(tabId: string): TabHistory | null {
    return this.storage.loadHistory(tabId);
  }

  tabNamed(name: string): TabSnapshot {
    const tab = this.tabs().find((t) => t.name === name);
    if (!tab) throw new Error(`Kein Tab mit dem Namen ${name}`);
    return tab;
  }

  /** Wie der Renderer nach dem Laden: Jede Ansicht meldet „bereit“ mit ihrer Grösse. */
  showAllViews(cols = 120, rows = 30): void {
    for (const tab of this.tabs()) this.workspace.viewReady(tab.id, cols, rows);
  }

  eventsOfType<T extends WorkspaceEvent['type']>(type: T): Extract<WorkspaceEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<WorkspaceEvent, { type: T }> => e.type === type);
  }

  private boot(): Instance {
    const terminal = new FakeTerminalBackend();
    const events: WorkspaceEvent[] = [];
    const workspace = createWorkspace(
      { terminal, storage: this.storage, clock: this.clock, processes: this.processes, system: this.system },
      { shells: this.shells },
    );
    const renderer = new TestRenderer(workspace);
    workspace.subscribe((event) => {
      events.push(event);
      renderer.handle(event);
    });
    return { workspace, terminal, renderer, events };
  }
}

export function startWorkspace(options?: TestWorkspaceOptions): TestWorkspace {
  return new TestWorkspace(options);
}
