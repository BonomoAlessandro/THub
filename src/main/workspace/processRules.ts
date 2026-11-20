// Prozess-Regeln (Ticket 13): ob in einem Tab Prozesse laufen („Prozesse laufen“, blau). Nach dem Abschnitt
// „Prozesse laufen“ der Spezifikation und den Regeln aus docs/spikes/prozess-sonde.md. Die Sonde liefert pro
// Abfrage alle Prozesse des Systems; hier wird daraus pro Tab ein Ja oder Nein.
//
// - Identität: (Prozess-ID, Startzeit). Eine Eltern-Kante gilt nur, wenn das Kind nicht vor dem Eltern-Prozess
//   gestartet ist; Windows vergibt Prozess-IDs wieder.
// - Innerste Shell: die Prozess-ID von node-pty; bei Git Bash genau eine Ebene tiefer das bash.exe-Kind des
//   Starters, einmal bestimmt und dann fest. Die Kette bis dorthin zählt nie.
// - Ein Prozess zählt erst, wenn er in zwei aufeinanderfolgenden Abfragen vorkommt; Konsolen-Hosts nie.
// - Git Bash: verwaiste MSYS-Programme (sleep, ssh, vim, less …) zählen als Nachfahren, wenn ihr Konsolen-Host
//   der Host des Tabs ist.
// - Normale Tabs: jeder Nachfahre der innersten Shell. Claude-Tabs: nur Nachfahren des Claude-Prozesses, die nach
//   dem letzten Prompt gestartet sind, und nur, solange Claude ruht. WSL: nie.
// Dazu meldet jede Abfrage für offene Antworten auf Rückfragen, ob Claude seit der Antwort einen Prozess gestartet hat.
// Für das Beenden (Ticket 15): alle Prozesse der Shell eines Tabs und der Konsolen-Host ihrer Pseudokonsole.

import type { ProcessInfo } from './ports';

/** Wie der Prozessbaum eines Tabs aussieht, je nach Shell. */
export type ShellTree =
  /** PowerShell 7 (auch über den WindowsApps-Alias), Windows PowerShell, cmd: node-pty startet die Shell selbst. */
  | 'direct'
  /** Git Bash: node-pty startet den Starter `bin\bash.exe`; die Shell ist dessen `bash.exe`-Kind. */
  | 'gitbash'
  /** WSL: Die Linux-Prozesse sind für Windows unsichtbar; nie „Prozesse laufen“. */
  | 'wsl';

/** Ein Tab mit laufender Shell, so wie die Regeln ihn brauchen. */
export interface ProcessTab {
  id: string;
  /** Prozess-ID, die node-pty für die Shell gemeldet hat. */
  rootPid: number;
  /** Wann die Shell gestartet wurde (Uhr des Kerns); ein älterer Prozess mit dieser ID ist nicht die Shell. */
  startedAt: number;
  tree: ShellTree;
  /** Nur bei Claude-Tabs. */
  claude?: ClaudeProcess;
}

export interface ClaudeProcess {
  /** Prozess-ID von Claude aus der Meldung `started`; fehlt sie, zählt nichts. */
  pid?: number;
  /** Zeitpunkt des letzten `UserPromptSubmit`; es zählen nur Prozesse, die danach gestartet sind. */
  promptAt?: number;
  /** Claude ruht; nur dann zählen Prozesse. */
  idle: boolean;
  /**
   * Zeitpunkt einer Antwort auf eine Rückfrage (Enter oder Ziffer), solange offen ist, ob Claude danach weiterarbeitet:
   * Die Abfrage meldet dann, ob der Claude-Prozess seither einen Nachfahren gestartet hat (`ProcessReport.answers`).
   */
  answeredAt?: number;
}

/** Ergebnis einer Abfrage. */
export interface ProcessReport {
  /** Tabs, in denen Prozesse laufen. */
  running: Set<string>;
  /**
   * Claude-Tabs mit offener Antwort (`answeredAt`), deren Claude-Prozess in der Abfrage zu sehen war: `true`, wenn er
   * seit der Antwort einen Nachfahren gestartet hat (ausser Konsolen-Hosts), sonst `false`. Fehlt ein Tab, liess sich
   * sein Claude-Prozess nicht finden.
   */
  answers: Map<string, boolean>;
}

/** Konsolen-Host eines Prozesses (Port „Prozess-Sonde“); `null`, wenn nicht lesbar. */
export type ConsoleHostLookup = (pid: number) => number | null;

/**
 * Die Wurzel darf etwas vor dem Zeitpunkt liegen, den der Kern beim Start notiert: Beide Uhren gehen nach der
 * Systemzeit, aber nicht auf die Millisekunde gleich.
 */
const ROOT_START_SLACK_MS = 2000;

const CONSOLE_HOSTS = new Set(['conhost.exe', 'openconsole.exe']);

/** Ob der Prozess ein Konsolen-Host ist (`conhost.exe`, `OpenConsole.exe`). */
export function isConsoleHost(p: ProcessInfo): boolean {
  return CONSOLE_HOSTS.has(p.name.toLowerCase());
}

/** Die Wurzel des Prozessbaums eines Tabs: die Prozess-ID von node-pty und wann der Kern die Shell gestartet hat. */
export interface ShellRoot {
  pid: number;
  startedAt: number;
}

/**
 * Alle Prozesse der Shell eines Tabs in dieser Abfrage, zum Beenden (Ticket 15): die Wurzel und ihre Nachfahren in jeder
 * Tiefe, auch Prozesse mit eigener Konsole und deren Konsolen-Hosts. Eltern kommen vor ihren Kindern, damit ein
 * Prozess, der seine Kinder neu startet, zuerst endet. Ohne Wurzel in der Abfrage (beendet, oder ein anderer Prozess
 * mit ihrer Prozess-ID) keine: Die Nachfahren einer beendeten Shell sind über ihre Eltern nicht mehr sicher zu finden.
 */
export function shellProcesses(snapshot: ProcessInfo[], root: ShellRoot): ProcessInfo[] {
  const tree = new ProcessTree(snapshot);
  const shell = tree.byPid.get(root.pid);
  if (!shell || shell.startTime < root.startedAt - ROOT_START_SLACK_MS) return [];
  return [shell, ...tree.descendants([shell])];
}

/**
 * Der Konsolen-Host der Pseudokonsole, in der eine Shell läuft (Ticket 15): ConPTY startet ihn unmittelbar vor der
 * Shell als Kind desselben Prozesses (THub), node-pty beides im selben Aufruf. Er gilt nur, wenn direkt vor der Shell
 * ein Konsolen-Host als Kind von `ownPid` gestartet ist; sonst keiner. `shellPid` ist die Prozess-ID von node-pty.
 */
export function ptyConsoleHost(snapshot: ProcessInfo[], ownPid: number, shellPid: number): ProcessInfo | undefined {
  const tree = new ProcessTree(snapshot);
  const owner = tree.byPid.get(ownPid);
  const shell = tree.byPid.get(shellPid);
  if (!owner || !shell || shell.ppid !== ownPid || !tree.hasParent(shell)) return undefined;
  const before = tree
    .childrenOf(owner)
    .filter((p) => p !== shell && p.startTime <= shell.startTime)
    .sort((a, b) => b.startTime - a.startTime);
  return before[0] && isConsoleHost(before[0]) ? before[0] : undefined;
}

interface Identity {
  pid: number;
  startTime: number;
}

/** Was über einen Tab von Abfrage zu Abfrage feststeht. */
interface TabTrack {
  rootPid: number;
  root?: Identity;
  /** Innerste Shell; einmal bestimmt, dann fest. */
  shell?: Identity;
  /** Konsolen-Host der innersten Shell (nur Git Bash), sobald bekannt. */
  host?: number;
  claudePid?: number;
  /** Festgehalten bei der ersten Abfrage, in der der Claude-Prozess als Nachfahre der Shell vorkommt. */
  claude?: Identity;
}

/**
 * Wertet die Abfragen der Prozess-Sonde aus. Merkt sich dazu die vorige Abfrage (zwei aufeinanderfolgende
 * Abfragen), die innerste Shell jedes Tabs und die Konsolen-Hosts von Waisen.
 */
export class ProcessTracker {
  private readonly tracks = new Map<string, TabTrack>();
  /** Prozesse der vorigen Abfrage. */
  private previous = new Set<string>();
  /** Konsolen-Hosts verwaister Prozesse, pro Identität einmal abgefragt. */
  private hosts = new Map<string, number | null>();

  /** Vergisst die vorige Abfrage, etwa wenn eine Weile nicht abgefragt wurde. */
  forgetPrevious(): void {
    this.previous = new Set();
  }

  /**
   * Wertet eine Abfrage aus: in welchen Tabs Prozesse laufen und, für offene Antworten auf Rückfragen, ob Claude seither
   * einen Prozess gestartet hat. Tabs, die nicht übergeben werden, vergisst der Tracker.
   */
  update(snapshot: ProcessInfo[], tabs: ProcessTab[], consoleHost: ConsoleHostLookup): ProcessReport {
    const tree = new ProcessTree(snapshot);
    for (const id of [...this.tracks.keys()]) {
      if (!tabs.some((t) => t.id === id)) this.tracks.delete(id);
    }

    // Zuerst die innerste Shell jedes Tabs, dann die Waisen für alle Git-Bash-Tabs zusammen.
    const shells = new Map<string, ProcessInfo>();
    for (const tab of tabs) {
      if (tab.tree === 'wsl') continue;
      const track = this.track(tab);
      const shell = this.innermostShell(track, tab, tree);
      if (!shell) continue;
      shells.set(tab.id, shell);
      if (tab.tree === 'gitbash' && track.host === undefined) track.host = consoleHost(shell.pid) ?? undefined;
    }
    const orphans = this.orphansByHost(tabs, shells, tree, consoleHost);

    const running = new Set<string>();
    const answers = new Map<string, boolean>();
    for (const tab of tabs) {
      const shell = shells.get(tab.id);
      const track = this.tracks.get(tab.id);
      if (!shell || !track) continue;
      // Ein normales Terminal vergisst den Claude-Prozess; ein späteres Claude kann dieselbe Prozess-ID haben.
      if (!tab.claude) {
        track.claudePid = track.claude = undefined;
        if (this.shellCandidates(track, tab, shell, tree, orphans).some((p) => this.counts(p))) running.add(tab.id);
        continue;
      }
      const claude = this.claudeProcess(track, tab.claude, shell, tree);
      if (!claude) continue;
      if (this.claudeCandidates(tab.claude, claude, tree).some((p) => this.counts(p))) running.add(tab.id);
      const { answeredAt } = tab.claude;
      if (answeredAt !== undefined) {
        // Ein Nachfahre, der nach der Antwort gestartet ist, zeigt schon in einer einzigen Abfrage, dass Claude
        // weiterarbeitet (etwa ein bestätigter Befehl).
        const spawned = tree.descendants([claude]).some(
          (p) => p.startTime >= answeredAt && !isConsoleHost(p),
        );
        answers.set(tab.id, spawned);
      }
    }

    this.previous = new Set(snapshot.map(key));
    return { running, answers };
  }

  /** Ein Prozess zählt, wenn er schon in der vorigen Abfrage vorkam und kein Konsolen-Host ist. */
  private counts(p: ProcessInfo): boolean {
    return this.previous.has(key(p)) && !isConsoleHost(p);
  }

  private track(tab: ProcessTab): TabTrack {
    let track = this.tracks.get(tab.id);
    // Eine neu gestartete Shell (andere Prozess-ID) beginnt von vorn.
    if (!track || track.rootPid !== tab.rootPid) {
      track = { rootPid: tab.rootPid };
      this.tracks.set(tab.id, track);
    }
    return track;
  }

  /** Die innerste Shell des Tabs in dieser Abfrage; keine, solange sie (noch) nicht da ist oder beendet ist. */
  private innermostShell(track: TabTrack, tab: ProcessTab, tree: ProcessTree): ProcessInfo | undefined {
    if (!track.root) {
      const root = tree.byPid.get(tab.rootPid);
      if (!root || root.startTime < tab.startedAt - ROOT_START_SLACK_MS) return undefined;
      track.root = identity(root);
    }
    if (tab.tree !== 'gitbash') return tree.find(track.root);

    if (!track.shell) {
      const root = tree.find(track.root);
      if (!root) return undefined;
      // Genau eine Ebene: das erste bash.exe-Kind des Starters. Tiefere bash.exe sind Fork-Kinder von Befehlen.
      const shell = tree
        .childrenOf(root)
        .filter((p) => p.name.toLowerCase() === 'bash.exe')
        .sort((a, b) => a.startTime - b.startTime)[0];
      if (!shell) return undefined;
      track.shell = identity(shell);
    }
    return tree.find(track.shell);
  }

  /**
   * Verwaiste Prozesse (Eltern beendet oder Prozess-ID neu vergeben), gruppiert nach Konsolen-Host. Abgefragt
   * werden nur Waisen, die nach einer Git-Bash-Shell gestartet sind, und jede nur einmal.
   */
  private orphansByHost(
    tabs: ProcessTab[],
    shells: Map<string, ProcessInfo>,
    tree: ProcessTree,
    consoleHost: ConsoleHostLookup,
  ): Map<number, ProcessInfo[]> {
    const byHost = new Map<number, ProcessInfo[]>();
    const starts = tabs
      .filter((t) => t.tree === 'gitbash' && this.tracks.get(t.id)?.host !== undefined && shells.has(t.id))
      .map((t) => shells.get(t.id)!.startTime);
    if (starts.length === 0) {
      this.hosts.clear();
      return byHost;
    }
    const earliest = Math.min(...starts);
    const known = new Map<string, number | null>();
    for (const p of tree.all) {
      if (p.pid === 0 || p.pid === 4 || p.startTime < earliest || tree.hasParent(p)) continue;
      const k = key(p);
      const host = this.hosts.has(k) ? this.hosts.get(k)! : consoleHost(p.pid);
      known.set(k, host);
      if (host === null) continue;
      const list = byHost.get(host);
      if (list) list.push(p);
      else byHost.set(host, [p]);
    }
    // Nur behalten, was es noch gibt.
    this.hosts = known;
    return byHost;
  }

  /** Normale Tabs: alle Nachfahren der innersten Shell, bei Git Bash auch die Waisen mit dem Host des Tabs. */
  private shellCandidates(
    track: TabTrack,
    tab: ProcessTab,
    shell: ProcessInfo,
    tree: ProcessTree,
    orphans: Map<number, ProcessInfo[]>,
  ): ProcessInfo[] {
    const roots = [shell];
    const adopted =
      tab.tree === 'gitbash' && track.host !== undefined
        ? (orphans.get(track.host) ?? []).filter((p) => p.startTime >= shell.startTime && p !== shell)
        : [];
    return [...adopted, ...tree.descendants([...roots, ...adopted])];
  }

  /**
   * Der Claude-Prozess in dieser Abfrage. Seine Startzeit wird bei der ersten Abfrage festgehalten, in der er als
   * Nachfahre der Shell vorkommt; keiner, solange die Prozess-ID fehlt oder er nicht (mehr) da ist.
   */
  private claudeProcess(track: TabTrack, claude: ClaudeProcess, shell: ProcessInfo, tree: ProcessTree): ProcessInfo | undefined {
    if (track.claudePid !== claude.pid) {
      track.claudePid = claude.pid;
      track.claude = undefined;
    }
    if (claude.pid === undefined) return undefined;
    if (!track.claude) {
      const candidate = tree.byPid.get(claude.pid);
      if (!candidate || !tree.isDescendant(candidate, shell)) return undefined;
      track.claude = identity(candidate);
    }
    return tree.find(track.claude);
  }

  /** Claude-Tabs: Nachfahren des Claude-Prozesses, die nach dem letzten Prompt gestartet sind, solange Claude ruht. */
  private claudeCandidates(claude: ClaudeProcess, process: ProcessInfo, tree: ProcessTree): ProcessInfo[] {
    const { promptAt } = claude;
    if (!claude.idle || promptAt === undefined) return [];
    return tree.descendants([process]).filter((p) => p.startTime >= promptAt);
  }
}

/** Eine Abfrage als Baum: Kinder nur über gültige Eltern-Kanten (Kind nicht älter als der Eltern-Prozess). */
class ProcessTree {
  readonly byPid = new Map<number, ProcessInfo>();
  private readonly byParent = new Map<number, ProcessInfo[]>();

  constructor(readonly all: ProcessInfo[]) {
    for (const p of all) {
      this.byPid.set(p.pid, p);
      const siblings = this.byParent.get(p.ppid);
      if (siblings) siblings.push(p);
      else this.byParent.set(p.ppid, [p]);
    }
  }

  find(id: Identity): ProcessInfo | undefined {
    const p = this.byPid.get(id.pid);
    return p && p.startTime === id.startTime ? p : undefined;
  }

  childrenOf(parent: ProcessInfo): ProcessInfo[] {
    return (this.byParent.get(parent.pid) ?? []).filter((c) => c !== parent && c.startTime >= parent.startTime);
  }

  /** Der Eltern-Prozess lebt noch und ist nicht jünger als das Kind. */
  hasParent(p: ProcessInfo): boolean {
    const parent = this.byPid.get(p.ppid);
    return parent !== undefined && parent !== p && parent.startTime <= p.startTime;
  }

  isDescendant(p: ProcessInfo, ancestor: ProcessInfo): boolean {
    const seen = new Set<number>();
    let current = p;
    while (this.hasParent(current) && !seen.has(current.pid)) {
      seen.add(current.pid);
      current = this.byPid.get(current.ppid)!;
      if (current === ancestor) return true;
    }
    return false;
  }

  /** Alle Nachfahren der Wurzeln, ohne die Wurzeln selbst. */
  descendants(roots: ProcessInfo[]): ProcessInfo[] {
    const seen = new Set<ProcessInfo>(roots);
    const result: ProcessInfo[] = [];
    const queue = [...roots];
    for (let p = queue.shift(); p; p = queue.shift()) {
      for (const child of this.childrenOf(p)) {
        if (seen.has(child)) continue;
        seen.add(child);
        result.push(child);
        queue.push(child);
      }
    }
    return result;
  }
}

function identity(p: ProcessInfo): Identity {
  return { pid: p.pid, startTime: p.startTime };
}

function key(p: ProcessInfo): string {
  return `${p.pid}:${p.startTime}`;
}
