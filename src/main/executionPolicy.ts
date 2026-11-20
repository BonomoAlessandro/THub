// Prüfung der Execution Policy beim Start (Ticket 11). Lädt nie Electron.
//
// Der claude-Ersatz ruft den Starter per `powershell.exe -ExecutionPolicy Bypass -File starter.ps1` auf. Bypass gilt
// nur im Prozessbereich: Legt eine Gruppenrichtlinie (MachinePolicy oder UserPolicy) AllSigned oder Restricted fest,
// führt Windows PowerShell die Skriptdatei trotzdem nicht aus, und `claude` liefe in keinem Tab. THub prüft das darum
// einmal beim Start und lässt THUB_STARTER dann weg: `claude` läuft direkt, ohne Erfassung, aber ohne Fehler
// (docs/specs/termhub-v2.md, „Umgebung jedes Terminals“).
//
// Die Prüfung läuft parallel zum Start der App; die Shells fragen das Ergebnis erst ab, wenn sie starten. Weggelassen
// wird THUB_STARTER nur, wenn feststeht, dass der Starter nicht laufen kann:
//
//   Ergebnis der Abfrage                          Ersatz (THUB_STARTER)
//   AllSigned oder Restricted auf einer Ebene     nein
//   andere Richtlinien (meist Undefined)          ja
//   Prüfung läuft noch                            ja
//   keine Antwort innerhalb des Zeitlimits        ja
//   PowerShell endet mit einem Fehler             ja (unklar; der Starter braucht das Cmdlet nicht)
//   powershell.exe lässt sich nicht starten       nein (der Starter ist selbst ein powershell.exe)

import { execFile } from 'node:child_process';
import * as path from 'node:path';

/** Richtlinien, unter denen Windows PowerShell den Starter nicht ausführt. */
const BLOCKING_POLICIES = ['allsigned', 'restricted'];

/** So lange darf die Abfrage höchstens dauern. Windows PowerShell antwortet meist nach rund 0,5 s. */
export const POLICY_CHECK_TIMEOUT_MS = 10_000;

/** Startargumente der Abfrage: beide Richtlinien-Ebenen, eine Zeile pro Ebene, nicht gesetzt heisst `Undefined`. */
export const POLICY_CHECK_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  'Get-ExecutionPolicy -Scope MachinePolicy; Get-ExecutionPolicy -Scope UserPolicy',
];

/** Wie ein versteckter Lauf von Windows PowerShell ausging. */
export type PowerShellAnswer =
  /** mit Exit-Code 0 beendet, mit dieser Standardausgabe */
  | { kind: 'output'; stdout: string }
  /** gestartet, aber mit einem Fehler beendet */
  | { kind: 'failed' }
  /** keine Antwort innerhalb des Zeitlimits; der Prozess wurde beendet */
  | { kind: 'timeout' }
  /** liess sich nicht starten, etwa weil powershell.exe fehlt oder gesperrt ist */
  | { kind: 'unavailable' };

/** Führt Windows PowerShell versteckt mit diesen Argumenten aus, höchstens `timeoutMs` lang. */
export type RunPowerShell = (args: string[], timeoutMs: number) => Promise<PowerShellAnswer>;

/** Die laufende oder abgeschlossene Prüfung. */
export interface ExecutionPolicyCheck {
  /**
   * Ob die Shells den claude-Ersatz bekommen (THUB_STARTER). Solange die Prüfung läuft und wenn sie nicht
   * rechtzeitig fertig wird: ja.
   */
  starterAllowed(): boolean;
  /** Erfüllt, sobald das Ergebnis feststeht, mit demselben Wert wie danach `starterAllowed()`. */
  readonly done: Promise<boolean>;
}

/**
 * Startet die Prüfung im Hintergrund und kehrt sofort zurück.
 * @param run führt Windows PowerShell aus; im Betrieb `runWindowsPowerShell`, im Test nachgemacht
 */
export function checkExecutionPolicy(
  run: RunPowerShell = runWindowsPowerShell,
  timeoutMs = POLICY_CHECK_TIMEOUT_MS,
): ExecutionPolicyCheck {
  let allowed = true;
  const done = run(POLICY_CHECK_ARGS, timeoutMs)
    .then(verdict, (err: unknown) => {
      console.error('Execution Policy konnte nicht geprüft werden:', err);
      return true;
    })
    .then((result) => {
      allowed = result;
      return result;
    });
  return { starterAllowed: () => allowed, done };
}

/** Ob der Starter nach dieser Antwort laufen darf; siehe Tabelle oben. */
function verdict(answer: PowerShellAnswer): boolean {
  switch (answer.kind) {
    case 'output': {
      const blocking = answer.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => BLOCKING_POLICIES.includes(line.toLowerCase()));
      if (blocking === undefined) return true;
      console.log(`Eine Gruppenrichtlinie setzt die Execution Policy auf ${blocking}: claude wird in den Terminals nicht erfasst.`);
      return false;
    }
    case 'unavailable':
      console.log('Windows PowerShell lässt sich nicht starten: claude wird in den Terminals nicht erfasst.');
      return false;
    case 'failed':
    case 'timeout':
      console.error(`Execution Policy konnte nicht geprüft werden (${answer.kind}); der claude-Ersatz bleibt eingeschaltet.`);
      return true;
  }
}

/**
 * Führt das Windows PowerShell des Systems versteckt aus. Ohne `PSModulePath`: Wurde THub aus PowerShell 7
 * gestartet, stehen dort dessen Modulordner, und Windows PowerShell könnte `Get-ExecutionPolicy` (Modul
 * Microsoft.PowerShell.Security) nicht laden. Ohne die Variable nimmt es seine eigenen Standardordner.
 */
export function runWindowsPowerShell(args: string[], timeoutMs: number): Promise<PowerShellAnswer> {
  const exe = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() !== 'PSMODULEPATH') env[key] = value;
  }
  return new Promise((resolve) => {
    execFile(exe, args, { windowsHide: true, timeout: timeoutMs, env, encoding: 'utf8' }, (err, stdout) => {
      if (!err) resolve({ kind: 'output', stdout });
      // Startfehler haben einen Text als Code (ENOENT, EACCES …), ein Fehler beim Beenden den Exit-Code.
      else if (typeof err.code === 'string') resolve({ kind: 'unavailable' });
      else if (err.killed) resolve({ kind: 'timeout' });
      else resolve({ kind: 'failed' });
    });
  });
}
