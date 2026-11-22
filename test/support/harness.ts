// Test-Gerüst für Teststelle 1: ein Workspace-Kern mit nachgemachten Ports, so wie ihn die App
// beim Start erzeugt, und ein simulierter Neustart auf demselben gespeicherten Zustand.
// Mit `startWorkspaceWithApi` läuft dazu die echte lokale Schnittstelle auf 127.0.0.1, mit Hook-Datei
// in einem Temp-Datenordner, so wie beim Start der App.

import * as path from 'node:path';
import { afterEach } from 'vitest';
import { HOOK_FILE_NAME, writeHookFile } from '../../src/main/hookFile';
import { LocalApiServer } from '../../src/main/localApi';
import type { LocalApiInfo } from '../../src/main/workspace/claude';
import type { ProcessInfo, ShellInfo, StateStorage, TabHistory } from '../../src/main/workspace/ports';
import type { PersistedState, PersistedTab } from '../../src/main/workspace/schema';
import { createWorkspace, type Workspace } from '../../src/main/workspace/workspace';
import type { TabSnapshot, WorkspaceEvent, WorkspaceSnapshot } from '../../src/shared/types';
import { ApiClient } from './apiClient';
import {
  FakeClock,
  FakeKeepAwake,
  FakeProcessProbe,
  FakeSystem,
  FakeTerminalBackend,
  MemoryStorage,
  type FakeSystemOptions,
} from './fakes';
import { makeTempDir } from './tempDir';

/** Laufende lokale Schnittstellen; nach jedem Test geschlossen. */
const openApis = new Set<LocalApiServer>();

afterEach(async () => {
  const apis = [...openApis];
  openApis.clear();
  await Promise.all(apis.map((api) => api.close()));
});

/** Eine laufende lokale Schnittstelle mit ihrer Hook-Datei. */
export interface RunningApi {
  server: LocalApiServer;
  info: LocalApiInfo;
}

/** Startet die Schnittstelle und schreibt die Hook-Datei in den Datenordner, wie main.ts beim Start. */
async function startApi(dataDir: string): Promise<RunningApi> {
  const server = await LocalApiServer.start();
  openApis.add(server);
  const hookFile = path.join(dataDir, HOOK_FILE_NAME);
  writeHookFile(hookFile, server.url);
  return { server, info: { url: server.url, token: server.token, hookFile } };
}

async function stopApi(api: RunningApi): Promise<void> {
  openApis.delete(api.server);
  await api.server.close();
}

export const TEST_SHELLS: ShellInfo[] = [
  { id: 'pwsh', name: 'PowerShell 7', file: 'pwsh.exe', args: [], capturesClaude: true, integration: 'powershell' },
  {
    id: 'powershell',
    name: 'Windows PowerShell',
    file: 'powershell.exe',
    args: [],
    capturesClaude: true,
    integration: 'powershell',
  },
  { id: 'cmd', name: 'cmd', file: 'cmd.exe', args: [], capturesClaude: true, integration: 'cmd' },
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
  keepAwake: FakeKeepAwake;
  renderer: TestRenderer;
  events: WorkspaceEvent[];
  api: RunningApi | null;
}

export class TestWorkspace {
  readonly storage: StateStorage;
  readonly clock = new FakeClock();
  readonly processes = new FakeProcessProbe();
  readonly system: FakeSystem;
  private shells: ShellInfo[];
  private current: Instance;

  /** @param api bereits laufende lokale Schnittstelle; ohne sie läuft der Kern wie ohne Server */
  constructor(options: TestWorkspaceOptions = {}, api: RunningApi | null = null) {
    this.storage = options.storage ?? new MemoryStorage(options.state ?? null);
    this.system = new FakeSystem(options);
    this.shells = options.shells ?? TEST_SHELLS;
    this.current = this.boot(api);
  }

  /** Der laufende Kern; nach `restart()` ein neuer. */
  get workspace(): Workspace {
    return this.current.workspace;
  }

  /** Terminal-Backend des laufenden Kerns; nach einem Neustart laufen keine Shells mehr. */
  get terminal(): FakeTerminalBackend {
    return this.current.terminal;
  }

  /** Port Wachhalten des laufenden Kerns; nach einem Neustart ein neuer, wie bei einem neuen Prozess. */
  get keepAwake(): FakeKeepAwake {
    return this.current.keepAwake;
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
   * Die lokale Schnittstelle des laufenden Kerns: Adresse, Token, Hook-Datei.
   * Nach einem Neustart eine neue, mit neuem Port und neuem Token.
   */
  get localApi(): LocalApiInfo {
    if (!this.current.api) throw new Error('Dieser Kern läuft ohne lokale Schnittstelle (startWorkspaceWithApi)');
    return this.current.api.info;
  }

  /** Schickt echte HTTP-Anfragen mit dem gültigen Token an die lokale Schnittstelle. */
  get api(): ApiClient {
    return new ApiClient(this.localApi.url, this.localApi.token);
  }

  /**
   * Simuliert einen Neustart der App: Der Kern wird geordnet beendet, danach entsteht ein neuer
   * Kern auf demselben gespeicherten Zustand, mit frischem Terminal-Backend und, falls vorhanden,
   * neuer lokaler Schnittstelle samt neu geschriebener Hook-Datei.
   * @param options.shells die Shells, die die Erkennung beim neuen Start findet (etwa nach einer Deinstallation)
   */
  async restart(options: { shells?: ShellInfo[] } = {}): Promise<void> {
    if (options.shells) this.shells = options.shells;
    const { workspace, api } = this.current;
    await workspace.shutdown();
    let nextApi: RunningApi | null = null;
    if (api) {
      await stopApi(api);
      nextApi = await startApi(path.dirname(api.info.hookFile));
    }
    this.current = this.boot(nextApi);
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

  /**
   * Der nächste Takt der Prozess-Sonde (1,5 Sekunden) mit dieser Prozessliste: Die Uhr läuft bis dahin, die
   * Abfrage ist beantwortet und ausgewertet.
   */
  async probe(processes: ProcessInfo[]): Promise<void> {
    this.processes.set(processes);
    this.clock.advance(PROBE_INTERVAL_MS);
    await settle();
  }

  eventsOfType<T extends WorkspaceEvent['type']>(type: T): Extract<WorkspaceEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<WorkspaceEvent, { type: T }> => e.type === type);
  }

  /** Was im Speicher „auf der Platte“ liegt; nur mit dem Speicher im Arbeitsspeicher. */
  storedState(): PersistedState {
    if (!(this.storage instanceof MemoryStorage)) throw new Error('storedState braucht den MemoryStorage');
    return structuredClone(this.storage.stored) as PersistedState;
  }

  /** Ein Tab, wie er gespeichert ist, mit seiner Claude-Zuordnung. */
  storedTab(tabId: string): PersistedTab | undefined {
    return this.storedState().tabs.find((t) => t.id === tabId);
  }

  private boot(api: RunningApi | null): Instance {
    const terminal = new FakeTerminalBackend();
    const keepAwake = new FakeKeepAwake();
    const events: WorkspaceEvent[] = [];
    const workspace = createWorkspace(
      { terminal, storage: this.storage, clock: this.clock, processes: this.processes, system: this.system, keepAwake },
      { shells: this.shells, localApi: api?.info },
    );
    api?.server.connect(workspace);
    const renderer = new TestRenderer(workspace);
    workspace.subscribe((event) => {
      events.push(event);
      renderer.handle(event);
    });
    return { workspace, terminal, keepAwake, renderer, events, api };
  }
}

/** Takt der Prozess-Sonde im Kern. */
export const PROBE_INTERVAL_MS = 1500;

/** Wartet, bis erfüllte Versprechen (etwa die Antwort der Prozess-Sonde) verarbeitet sind. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function startWorkspace(options?: TestWorkspaceOptions): TestWorkspace {
  return new TestWorkspace(options);
}

/** Wie `startWorkspace`, dazu die echte lokale Schnittstelle auf 127.0.0.1 mit Hook-Datei. */
export async function startWorkspaceWithApi(options?: TestWorkspaceOptions): Promise<TestWorkspace> {
  return new TestWorkspace(options, await startApi(makeTempDir()));
}
