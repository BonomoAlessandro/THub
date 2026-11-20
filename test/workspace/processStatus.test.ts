import { describe, expect, it } from 'vitest';
import type { ProcessInfo, ShellInfo } from '../../src/main/workspace/ports';
import type { TabSnapshot } from '../../src/shared/types';
import { hookPayload, type HookSample } from '../support/apiClient';
import {
  PROBE_INTERVAL_MS,
  settle,
  startWorkspace,
  startWorkspaceWithApi,
  type TestWorkspace,
} from '../support/harness';

// Prozess-Regeln (Ticket 13) mit steuerbarer Prozess-Sonde. Die Prozessbäume stammen aus dem Spike
// (spikes/prozess-sonde/ergebnisse/trees.txt): echte Shells über node-pty, mit ihren Prozess-IDs und den
// Startzeiten relativ zum Start der Shell.

const PWSH: ShellInfo = {
  id: 'pwsh',
  name: 'PowerShell 7',
  file: 'C:\\Users\\anna\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe',
  args: [],
  capturesClaude: true,
  integration: 'powershell',
};
const GIT_BASH: ShellInfo = {
  id: 'gitbash',
  name: 'Git Bash',
  file: 'C:\\Program Files\\Git\\bin\\bash.exe',
  args: ['--login', '-i'],
  capturesClaude: true,
  integration: 'bash',
};
const UBUNTU: ShellInfo = {
  id: 'wsl:Ubuntu',
  name: 'Ubuntu (WSL)',
  file: 'C:\\Windows\\System32\\wsl.exe',
  args: ['-d', 'Ubuntu'],
  capturesClaude: false,
};

/** Der THub-Hauptprozess; die Shells und ihre Konsolen-Hosts sind seine Kinder. */
const ELECTRON_PID = 29248;

/** Ein Tab mit laufender Shell; `at(ms)` ist eine Startzeit relativ zum Start der Shell. */
interface Terminal {
  h: TestWorkspace;
  tabId: string;
  at(ms: number): number;
  proc(pid: number, ppid: number, name: string, startedMs: number): ProcessInfo;
  status(): TabSnapshot['status'];
}

/** Startet einen Tab mit dieser Shell; node-pty meldet `pid`. */
function terminal(h: TestWorkspace, shellId: string, pid: number): Terminal {
  const tabId = h.workspace.createTab({ shellId });
  h.terminal.usePids(pid);
  const start = h.clock.now();
  h.workspace.viewReady(tabId, 120, 30);
  return terminalOf(h, tabId, start);
}

function terminalOf(h: TestWorkspace, tabId: string, start: number): Terminal {
  const at = (ms: number) => start + ms;
  return {
    h,
    tabId,
    at,
    proc: (pid, ppid, name, startedMs) => ({ pid, ppid, name, startTime: at(startedMs) }),
    status: () => h.tabs().find((t) => t.id === tabId)!.status,
  };
}

/** Wie die Sonde den THub-Hauptprozess sieht: lange vor den Shells gestartet. */
function electron(t: Terminal): ProcessInfo {
  return t.proc(ELECTRON_PID, 1200, 'electron.exe', -600_000);
}

function workspace(shells: ShellInfo[]): TestWorkspace {
  const h = startWorkspace({ homeDir: 'C:\\Users\\anna', shells });
  // Der automatisch angelegte erste Tab stört die Prozessbäume nicht, er bekommt aber keine Ansicht.
  h.workspace.windowForeground(true);
  return h;
}

describe('Prozesse laufen', () => {
  describe('normale Tabs (PowerShell 7 über den WindowsApps-Alias)', () => {
    function pwsh() {
      const h = workspace([PWSH]);
      const t = terminal(h, 'pwsh', 19996);
      const base = [electron(t), t.proc(4552, ELECTRON_PID, 'conhost.exe', 6), t.proc(19996, ELECTRON_PID, 'pwsh.exe', 102)];
      return { h, t, base };
    }

    it('Shell im Leerlauf → nichts', async () => {
      const { h, t, base } = pwsh();

      await h.probe(base);
      await h.probe(base);
      await h.probe(base);

      expect(t.status()).toBe('idle');
    });

    it('Prozess nur in einer Abfrage → nichts; in zwei → blau; nach seinem Ende → nichts', async () => {
      const { h, t, base } = pwsh();
      const ping = t.proc(8120, 19996, 'PING.EXE', 2499);
      await h.probe(base);

      await h.probe([...base, ping]);
      expect(t.status()).toBe('idle');
      await h.probe([...base, ping]);
      expect(t.status()).toBe('processes');
      expect(h.events.at(-1)).toMatchObject({ type: 'tabs' });
      await h.probe(base);
      expect(t.status()).toBe('idle');
    });

    it('kurzlebige Prompt-Helfer (posh-git startet pro Prompt ein git.exe) → nichts', async () => {
      const { h, t, base } = pwsh();

      await h.probe([...base, t.proc(9284, 19996, 'git.exe', 3000)]);
      await h.probe([...base, t.proc(32700, 19996, 'git.exe', 4500)]);
      // Dieselbe Prozess-ID, aber ein anderer Prozess (andere Startzeit): zählt nicht als derselbe.
      await h.probe([...base, t.proc(32700, 19996, 'git.exe', 6000)]);

      expect(t.status()).toBe('idle');
    });

    it('Nachfahren in jeder Tiefe zählen, auch mit eigener Konsole (Start-Process -WindowStyle Hidden)', async () => {
      const { h, t, base } = pwsh();
      const hidden = [t.proc(2508, 19996, 'PING.EXE', 7291), t.proc(8900, 2508, 'conhost.exe', 7300)];

      await h.probe([...base, ...hidden]);
      await h.probe([...base, ...hidden]);

      expect(t.status()).toBe('processes');
    });

    it('conhost.exe und OpenConsole.exe zählen nie', async () => {
      const { h, t, base } = pwsh();
      const hosts = [t.proc(8900, 19996, 'conhost.exe', 7300), t.proc(8904, 19996, 'OpenConsole.exe', 7400)];

      await h.probe([...base, ...hosts]);
      await h.probe([...base, ...hosts]);

      expect(t.status()).toBe('idle');
    });

    it('wiederverwendete Prozess-ID: ein Prozess, der älter ist als seine „Eltern“, zählt nicht als Nachfahre', async () => {
      const { h, t, base } = pwsh();
      // Sein echter Elternprozess hatte früher die ID 19996; heute trägt sie die Shell.
      const stale = [t.proc(4508, 19996, 'MoNotificationUx.exe', -30_000), t.proc(4512, 4508, 'msrdc.exe', -29_000)];

      await h.probe([...base, ...stale]);
      await h.probe([...base, ...stale]);

      expect(t.status()).toBe('idle');
    });

    it('ein Prozess mit der Prozess-ID der Shell, der vor ihrem Start lief, ist nicht die Shell', async () => {
      const h = workspace([PWSH]);
      const t = terminal(h, 'pwsh', 19996);
      const old = [electron(t), t.proc(19996, 1200, 'svchost.exe', -60_000), t.proc(4600, 19996, 'dllhost.exe', -50_000)];

      await h.probe(old);
      await h.probe(old);

      expect(t.status()).toBe('idle');
    });

    it('Ende der Shell → sofort nichts mehr', async () => {
      const { h, t, base } = pwsh();
      const ping = t.proc(8120, 19996, 'PING.EXE', 2499);
      await h.probe([...base, ping]);
      await h.probe([...base, ping]);

      h.terminal.exit(t.tabId, 0);

      expect(t.status()).toBe('idle');
    });

    it('jeder Tab für sich: Prozesse unter der einen Shell machen den anderen Tab nicht blau', async () => {
      const { h, t, base } = pwsh();
      const other = terminal(h, 'pwsh', 10420);
      const tree = [...base, other.proc(10420, ELECTRON_PID, 'pwsh.exe', 50), t.proc(8120, 19996, 'PING.EXE', 2499)];

      await h.probe(tree);
      await h.probe(tree);

      expect(t.status()).toBe('processes');
      expect(other.status()).toBe('idle');
    });
  });

  describe('Git Bash', () => {
    const LAUNCHER = 32316;
    const SHELL = 26328;
    const HOST = 48784;

    function gitBash() {
      const h = workspace([GIT_BASH]);
      const t = terminal(h, 'gitbash', LAUNCHER);
      h.processes.setConsoleHost(SHELL, HOST);
      const base = [
        electron(t),
        t.proc(HOST, ELECTRON_PID, 'conhost.exe', 6),
        t.proc(LAUNCHER, ELECTRON_PID, 'bash.exe', 82),
        t.proc(SHELL, LAUNCHER, 'bash.exe', 124),
      ];
      return { h, t, base };
    }

    it('Startkette allein → nichts, auch mit der Subshell des Prompts in einer Abfrage', async () => {
      const { h, t, base } = gitBash();

      await h.probe(base);
      await h.probe([...base, t.proc(37664, SHELL, 'bash.exe', 959)]);
      await h.probe(base);
      await h.probe(base);

      expect(t.status()).toBe('idle');
    });

    it('die Kaskade des Prompts (__git_ps1) bleibt unter 1,5 Sekunden und zählt nicht', async () => {
      const { h, t, base } = gitBash();
      const prompt = (fork: number, ms: number) => [
        t.proc(fork, SHELL, 'bash.exe', ms),
        t.proc(fork + 1, fork, 'bash.exe', ms + 50),
        t.proc(fork + 2, fork + 1, 'git.exe', ms + 90),
      ];

      await h.probe([...base, ...prompt(36280, 2000)]);
      await h.probe([...base, ...prompt(29012, 3500)]);
      await h.probe([...base, ...prompt(4308, 5000)]);

      expect(t.status()).toBe('idle');
    });

    it('ping über ein Fork-Kind der Shell → blau: tiefere bash.exe gehören zu den Nachfahren', async () => {
      const { h, t, base } = gitBash();
      const ping = [t.proc(24020, SHELL, 'bash.exe', 1986), t.proc(48944, 24020, 'PING.EXE', 2014)];

      await h.probe([...base, ...ping]);
      await h.probe([...base, ...ping]);

      expect(t.status()).toBe('processes');
    });

    it('ssh als verwaister MSYS-Prozess mit dem Konsolen-Host des Tabs → blau', async () => {
      const { h, t, base } = gitBash();
      // Das Fork-Kind 22440 hat sich durch ssh.exe ersetzt und ist beendet.
      const ssh = t.proc(37368, 22440, 'ssh.exe', 30_000);
      h.processes.setConsoleHost(37368, HOST);

      await h.probe([...base, ssh]);
      expect(t.status()).toBe('idle');
      await h.probe([...base, ssh]);
      expect(t.status()).toBe('processes');
      await h.probe(base);
      expect(t.status()).toBe('idle');
    });

    it('eine Waise, die vor der Shell gestartet ist, gehört nicht zum Tab, auch mit demselben Konsolen-Host', async () => {
      const { h, t, base } = gitBash();
      const old = t.proc(36000, 22440, 'sleep.exe', -5000);
      h.processes.setConsoleHost(36000, HOST);

      await h.probe([...base, old]);
      await h.probe([...base, old]);

      expect(t.status()).toBe('idle');
      expect(h.processes.hostQueries).not.toContain(36000);
    });

    it('eine Waise mit dem Konsolen-Host eines anderen Tabs oder ohne lesbaren Host zählt nicht', async () => {
      const { h, t, base } = gitBash();
      const foreign = t.proc(37368, 22440, 'sleep.exe', 30_000);
      const unreadable = t.proc(37372, 22444, 'less.exe', 30_000);
      h.processes.setConsoleHost(37368, 50000);

      await h.probe([...base, foreign, unreadable]);
      await h.probe([...base, foreign, unreadable]);

      expect(t.status()).toBe('idle');
    });

    it('fragt den Konsolen-Host nur für Waisen ab, die nach der Shell gestartet sind, und jede nur einmal', async () => {
      const { h, t, base } = gitBash();
      const systemOrphans = [t.proc(1596, 1340, 'csrss.exe', -3_600_000), t.proc(1704, 1340, 'wininit.exe', -3_600_000)];
      const ssh = t.proc(37368, 22440, 'ssh.exe', 30_000);
      h.processes.setConsoleHost(37368, HOST);

      await h.probe([...base, ...systemOrphans, ssh]);
      await h.probe([...base, ...systemOrphans, ssh]);
      await h.probe([...base, ...systemOrphans, ssh]);

      expect(h.processes.hostQueries).toEqual([SHELL, 37368]);
    });

    it('vor der eigentlichen Shell zählt nichts; ist sie da, ist sie fest', async () => {
      const { h, t, base } = gitBash();
      const launcherOnly = base.slice(0, 3);
      const child = t.proc(4000, LAUNCHER, 'PING.EXE', 100);

      await h.probe([...launcherOnly, child]);
      await h.probe([...launcherOnly, child]);
      expect(t.status()).toBe('idle');

      // Ein späteres bash.exe-Kind des Starters ersetzt die einmal bestimmte Shell nicht.
      await h.probe(base);
      const second = [t.proc(5000, LAUNCHER, 'bash.exe', 9000), t.proc(5004, 5000, 'PING.EXE', 9100)];
      await h.probe([...base, ...second]);
      await h.probe([...base, ...second]);
      expect(t.status()).toBe('idle');
    });
  });

  describe('WSL', () => {
    it('zeigt nie „Prozesse laufen“ und fragt die Sonde nicht ab', async () => {
      const h = workspace([UBUNTU]);
      // Der erste Tab ist schon ein WSL-Tab; er bekommt jetzt seine Ansicht.
      const tabId = h.activeTab()!.id;
      h.terminal.usePids(7000);
      const start = h.clock.now();
      h.showAllViews();
      const t = terminalOf(h, tabId, start);
      const tree = [electron(t), t.proc(7000, ELECTRON_PID, 'wsl.exe', 40), t.proc(7004, 7000, 'wslhost.exe', 300)];

      await h.probe(tree);
      await h.probe(tree);

      expect(t.status()).toBe('idle');
      expect(h.processes.queries).toBe(0);
    });
  });

  describe('Abfragen', () => {
    it('etwa alle 1,5 Sekunden eine Abfrage für alle Tabs zusammen', async () => {
      const h = workspace([PWSH]);
      terminal(h, 'pwsh', 19996);
      terminal(h, 'pwsh', 10420);
      terminal(h, 'pwsh', 20000);

      h.clock.advance(PROBE_INTERVAL_MS - 1);
      await settle();
      expect(h.processes.queries).toBe(0);
      h.clock.advance(1);
      await settle();
      expect(h.processes.queries).toBe(1);
      h.clock.advance(PROBE_INTERVAL_MS);
      await settle();
      expect(h.processes.queries).toBe(2);
    });

    it('ohne laufende Shell wird nicht abgefragt', async () => {
      const h = workspace([PWSH]);

      h.clock.advance(10 * PROBE_INTERVAL_MS);
      await settle();

      expect(h.processes.queries).toBe(0);
    });

    it('läuft die vorige Abfrage noch, fällt der Takt aus', async () => {
      const h = workspace([PWSH]);
      const t = terminal(h, 'pwsh', 19996);
      const tree = [electron(t), t.proc(19996, ELECTRON_PID, 'pwsh.exe', 102), t.proc(8120, 19996, 'PING.EXE', 500)];
      h.processes.set(tree);
      h.processes.hold();

      h.clock.advance(3 * PROBE_INTERVAL_MS);
      await settle();
      expect(h.processes.queries).toBe(1);
      h.processes.release();
      await settle();

      await h.probe(tree);
      expect(h.processes.queries).toBe(2);
      expect(t.status()).toBe('processes');
    });

    it('nach dem Beenden wird nicht mehr abgefragt', async () => {
      const h = workspace([PWSH]);
      terminal(h, 'pwsh', 19996);

      await h.workspace.shutdown();
      // Eine Abfrage gehört zum Beenden selbst: Sie liefert die Nachfahren der Shells.
      const atShutdown = h.processes.queries;
      h.clock.advance(10 * PROBE_INTERVAL_MS);
      await settle();

      expect(atShutdown).toBe(1);
      expect(h.processes.queries).toBe(atShutdown);
    });
  });
});

describe('Prozesse laufen in Claude-Tabs', () => {
  const SHELL = 19996;
  const CLAUDE = 30000;

  /** Ein Claude-Tab in PowerShell 7: Starter gemeldet, Claude läuft mit Prozess-ID 30000. */
  async function claudeTab(options: { otherTab?: boolean; claudePid?: number } = {}) {
    const h = await startWorkspaceWithApi({ homeDir: 'C:\\Users\\anna', shells: [PWSH] });
    const tabId = h.activeTab()!.id;
    const otherTabId = options.otherTab ? h.workspace.createTab() : '';
    h.workspace.activateTab(tabId);
    h.terminal.usePids(SHELL, 10420);
    const start = h.clock.now();
    h.showAllViews();
    h.workspace.windowForeground(true);
    const t = terminalOf(h, tabId, start);
    const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });
    const sessionId = JSON.parse(res.body).sessionId as string;
    await h.api.started(tabId, options.claudePid ?? CLAUDE);
    const send = async (sample: HookSample) => {
      const response = await h.api.hook(tabId, sample.split('-')[0], hookPayload(sample, { session_id: sessionId }));
      expect(response.status).toBe(200);
    };
    await send('SessionStart-startup');
    return { h, t, otherTabId, send };
  }

  /** Shell und Claude mit seinen MCP-Servern, wie im Spike: jeder MCP-Server mit eigener versteckter Konsole. */
  function claudeTree(t: Terminal): ProcessInfo[] {
    return [
      electron(t),
      t.proc(4552, ELECTRON_PID, 'conhost.exe', 6),
      t.proc(SHELL, ELECTRON_PID, 'pwsh.exe', 102),
      t.proc(CLAUDE, SHELL, 'claude.exe', 200),
      t.proc(30004, CLAUDE, 'conhost.exe', 210),
      t.proc(30008, CLAUDE, 'uv.exe', 400),
      t.proc(30012, 30008, 'conhost.exe', 410),
      t.proc(30016, 30008, 'serena-mcp.exe', 500),
      t.proc(30020, 30016, 'python.exe', 600),
      t.proc(30024, 30020, 'python.exe', 700),
    ];
  }

  it('MCP-Server, die vor dem Prompt gestartet sind → nach Stop nichts', async () => {
    const { h, t, send } = await claudeTab();
    const tree = claudeTree(t);
    await h.probe(tree);
    await h.probe(tree);
    expect(t.status()).toBe('idle');

    await send('UserPromptSubmit');
    await h.probe(tree);
    await send('Stop');
    await h.probe(tree);
    await h.probe(tree);

    expect(t.status()).toBe('idle');
  });

  it('ein nach dem Prompt gestarteter Dev-Server, der weiterläuft → nach Stop blau, nach seinem Ende nichts', async () => {
    const { h, t, send } = await claudeTab();
    const tree = claudeTree(t);
    await h.probe(tree);

    await send('UserPromptSubmit');
    const promptAt = h.clock.now();
    const devServer: ProcessInfo[] = [
      { pid: 30100, ppid: CLAUDE, name: 'cmd.exe', startTime: promptAt + 300 },
      { pid: 30104, ppid: 30100, name: 'conhost.exe', startTime: promptAt + 310 },
      { pid: 30108, ppid: 30100, name: 'node.exe', startTime: promptAt + 400 },
      { pid: 30112, ppid: 30108, name: 'node.exe', startTime: promptAt + 900 },
    ];
    await h.probe([...tree, ...devServer]);
    await h.probe([...tree, ...devServer]);
    // Solange Claude arbeitet, zählen die Prozesse nicht; der Tab zeigt ohnehin violett.
    expect(t.status()).toBe('working');

    await send('Stop');
    await h.probe([...tree, ...devServer]);
    expect(t.status()).toBe('processes');

    await h.probe(tree);
    expect(t.status()).toBe('idle');
  });

  it('ein Prozess aus dem vorigen Prompt zählt nach dem nächsten Prompt nicht mehr', async () => {
    const { h, t, send } = await claudeTab();
    const tree = claudeTree(t);
    await send('UserPromptSubmit');
    const server = { pid: 30108, ppid: CLAUDE, name: 'node.exe', startTime: h.clock.now() + 400 };
    await send('Stop');
    await h.probe([...tree, server]);
    await h.probe([...tree, server]);
    expect(t.status()).toBe('processes');

    h.clock.advance(1000);
    await send('UserPromptSubmit');
    await send('Stop');
    await h.probe([...tree, server]);

    expect(t.status()).toBe('idle');
  });

  it('ohne Prompt zählt nichts, auch nicht ein später gestarteter Helfer', async () => {
    const { h, t } = await claudeTab();
    const helper = t.proc(30200, CLAUDE, 'node.exe', 5000);

    await h.probe([...claudeTree(t), helper]);
    await h.probe([...claudeTree(t), helper]);

    expect(t.status()).toBe('idle');
  });

  it('Start über claude.cmd: die gemeldete Prozess-ID ist cmd.exe, Claude dessen Kind node.exe', async () => {
    const { h, t, send } = await claudeTab({ claudePid: 31000 });
    const tree = [
      electron(t),
      t.proc(SHELL, ELECTRON_PID, 'pwsh.exe', 102),
      t.proc(31000, SHELL, 'cmd.exe', 200),
      t.proc(31004, 31000, 'node.exe', 250),
      t.proc(31008, 31004, 'uv.exe', 400),
    ];
    await h.probe(tree);
    await send('UserPromptSubmit');
    const devServer = { pid: 31100, ppid: 31004, name: 'node.exe', startTime: h.clock.now() + 300 };
    await send('Stop');

    await h.probe([...tree, devServer]);
    await h.probe([...tree, devServer]);

    expect(t.status()).toBe('processes');
  });

  it('ein Prozess mit der gemeldeten Prozess-ID, der kein Nachfahre der Shell ist, gilt nicht als Claude', async () => {
    const { h, t, send } = await claudeTab();
    await send('UserPromptSubmit');
    const promptAt = h.clock.now();
    await send('Stop');
    const tree = [
      electron(t),
      t.proc(SHELL, ELECTRON_PID, 'pwsh.exe', 102),
      { pid: CLAUDE, ppid: 5000, name: 'explorer.exe', startTime: promptAt - 100 },
      { pid: 30100, ppid: CLAUDE, name: 'notepad.exe', startTime: promptAt + 100 },
    ];

    await h.probe(tree);
    await h.probe(tree);

    expect(t.status()).toBe('idle');
  });

  it('Vorrang: grün plus blau → grün; nach dem Anzeigen blau', async () => {
    const { h, t, otherTabId, send } = await claudeTab({ otherTab: true });
    const tree = claudeTree(t);
    await send('UserPromptSubmit');
    const devServer = { pid: 30108, ppid: CLAUDE, name: 'node.exe', startTime: h.clock.now() + 400 };
    h.workspace.activateTab(otherTabId);
    await send('Stop');

    await h.probe([...tree, devServer]);
    await h.probe([...tree, devServer]);
    expect(t.status()).toBe('finished');

    h.workspace.activateTab(t.tabId);
    expect(t.status()).toBe('processes');
  });

  it('ein späteres Claude mit derselben Prozess-ID gilt als neuer Prozess', async () => {
    const { h, t } = await claudeTab();
    await h.probe(claudeTree(t));
    await h.api.exit(t.tabId, undefined, 0);
    await h.probe([electron(t), t.proc(SHELL, ELECTRON_PID, 'pwsh.exe', 102)]);

    // Windows vergibt die Prozess-ID 30000 neu, an das nächste Claude im selben Tab.
    const res = await h.api.launch({ tabId: t.tabId, case: 'new', cwd: 'C:\\proj' });
    const sessionId = JSON.parse(res.body).sessionId as string;
    await h.api.started(t.tabId, CLAUDE);
    const second = { pid: CLAUDE, ppid: SHELL, name: 'claude.exe', startTime: h.clock.now() };
    await h.api.hook(t.tabId, 'UserPromptSubmit', hookPayload('UserPromptSubmit', { session_id: sessionId }));
    const devServer = { pid: 30108, ppid: CLAUDE, name: 'node.exe', startTime: h.clock.now() + 400 };
    await h.api.hook(t.tabId, 'Stop', hookPayload('Stop', { session_id: sessionId }));
    const tree = [electron(t), t.proc(SHELL, ELECTRON_PID, 'pwsh.exe', 102), second, devServer];
    await h.probe(tree);
    await h.probe(tree);

    expect(t.status()).toBe('processes');
  });

  it('nach dem Ende von Claude zählen im normalen Terminal wieder alle Nachfahren der Shell', async () => {
    const { h, t } = await claudeTab();
    const tree = claudeTree(t);
    await h.probe(tree);
    await h.probe(tree);
    expect(t.status()).toBe('idle');

    await h.api.exit(t.tabId, undefined, 0);
    // Claude ist beendet, ein MCP-Server läuft verwaist weiter, ein neuer Befehl in der Shell auch.
    const after = [...tree.filter((p) => p.pid !== CLAUDE), t.proc(8120, SHELL, 'PING.EXE', 9000)];
    await h.probe(after);
    await h.probe(after);

    expect(t.status()).toBe('processes');
  });
});
