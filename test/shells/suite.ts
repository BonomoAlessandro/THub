// Gemeinsame Tests fuer alle vier Windows-Shells (Teststelle 2, Tickets 07, 11, 12 und 15).
// Jede Shell hat eine eigene Testdatei, damit Vitest die Shells parallel laufen laesst.
// Alle Shells starten ueber das echte Terminal-Backend von THub (PtyManager) mit der Integration; THUB_STARTER
// setzt das Backend. Die Tests "Ende zu Ende" laufen dazu mit dem echten Kern und der echten lokalen Schnittstelle.
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkExecutionPolicy, type ExecutionPolicyCheck } from '../../src/main/executionPolicy';
import { createProcessProbe } from '../../src/main/processProbe';
import { resumeCommand } from '../../src/main/workspace/resume';
import type { WorkspaceEvent } from '../../src/shared/types';
import { MemoryStorage } from '../support/fakes';
import {
  CoreShell,
  FakeTHub,
  SHELLS,
  SYSTEM_ROOT,
  ShellSession,
  type ShellId,
  type Variant,
  type Workspace,
  clearStubRecords,
  closedPort,
  configureStub,
  createWorkspace,
  executionPolicyFromGroupPolicy,
  fakePowerShell7Modules,
  readStubRecords,
  removeWorkspace,
  sleep,
  visibleText,
} from './harness';

const TAB_ID = 'tab-1';
const TAB_NAME = 'Mein Tab äöü';
const NEW_ID = '11111111-2222-4333-8444-555555555555';
/** Kennung einer Session, die THub nach einem Neustart fortsetzt. */
const RESUME_ID = '8c74988d-a942-4021-a698-4b97d7977f8b';

type Flavor = 'ps' | 'cmd' | 'bash';

/**
 * Testaufrufe: der Text hinter `claude ` bzw. hinter dem direkt aufgerufenen Programm, in der
 * Schreibweise der jeweiligen Shell. Verglichen wird immer derselbe Text in derselben Shell.
 */
const CASES: Record<string, Record<Flavor, string>> = {
  'eingebettete Anführungszeichen': { ps: `'say "hi"' x`, cmd: `"say \\"hi\\"" x`, bash: `'say "hi"' x` },
  'leeres Argument': { ps: `a '' b`, cmd: `a "" b`, bash: `a '' b` },
  '%PATH%': { ps: `'%PATH%' x%PATH%`, cmd: `%PATH^% "%PATH%"`, bash: `'%PATH%' x%PATH%` },
  '^': { ps: `'a^b' c^d`, cmd: `a^^b "c^d"`, bash: `'a^b' c^d` },
  '&': { ps: `'a&b' "c & d"`, cmd: `a^&b "c & d"`, bash: `'a&b' "c & d"` },
  '!': { ps: `'a!b' "c!"`, cmd: `a!b "c!d"`, bash: `'a!b' c\\!` },
  Umlaute: { ps: `'Grüsse äöü ÄÖÜ' é`, cmd: `"Grüsse äöü ÄÖÜ" é`, bash: `'Grüsse äöü ÄÖÜ' é` },
  'führender /': { ps: `/review /x/y`, cmd: `/review /x/y`, bash: `/review /x/y` },
  'Prompt mit Leerzeichen': { ps: `"fix the bug in main.ts"`, cmd: `"fix the bug in main.ts"`, bash: `"fix the bug in main.ts"` },
  'Backslash am Ende': {
    ps: `'C:\\Ordner mit Leerzeichen\\' 'x\\"y'`,
    // gerade Anzahl ", sonst haelt cmd den Rest der Zeile fuer gequotet (auch beim direkten Aufruf)
    cmd: `"C:\\Ordner mit Leerzeichen\\\\" "x\\\\\\"y\\"z"`,
    bash: `'C:\\Ordner mit Leerzeichen\\' 'x\\"y'`,
  },
};

function flavorOf(id: ShellId): Flavor {
  return id === 'cmd' ? 'cmd' : id === 'gitbash' ? 'bash' : 'ps';
}

/** Ordnerwechsel, wie ihn ein Nutzer in der jeweiligen Shell tippt. */
function cdLine(flavor: Flavor, dir: string): string {
  if (flavor === 'ps') return `Set-Location -LiteralPath '${dir}'`;
  if (flavor === 'cmd') return `cd /d "${dir}"`;
  return `cd '${dir.replace(/\\/g, '/')}'`;
}

export function shellSuite(id: ShellId): void {
  const def = SHELLS[id];
  const flavor = flavorOf(id);

  describe.skipIf(!def.exe)(`${id}`, () => {
    let ws: Workspace;
    let hub: FakeTHub;
    const sessions: ShellSession[] = [];

    const start = async (opts: {
      variant?: Variant | null;
      api?: string | null;
      startCommand?: string;
      inherited?: Record<string, string>;
      /** Ob das Terminal-Backend THUB_STARTER setzt; Standard ja. */
      claudeStarter?: () => boolean;
      /** Zusätzliche Zeilen am Ende des Testprofils (PowerShell, Git Bash). */
      profileExtra?: string[];
    }): Promise<ShellSession> => {
      const variant = opts.variant === undefined ? 'exe' : opts.variant;
      const claudeDir = variant === 'exe' ? ws.stubExeDir : variant === 'cmd' ? ws.stubCmdDir : null;
      const s = await ShellSession.start(def, ws, {
        claudeDir,
        api: opts.api === undefined ? hub.url : opts.api,
        token: hub.token,
        tabId: TAB_ID,
        startCommand: opts.startCommand,
        inherited: opts.inherited,
        claudeStarter: opts.claudeStarter,
        profileExtra: opts.profileExtra,
      });
      sessions.push(s);
      return s;
    };

    /** Tippt eine Zeile und liefert Exit-Code, Aufzeichnungen des Stubs und Anfragen an THub. */
    const call = async (s: ShellSession, line: string, timeoutMs?: number) => {
      clearStubRecords(ws);
      hub.clear();
      const exitCode = await s.run(line, timeoutMs);
      // Meldungen kommen kurz nach dem Ende des Starters; warten, bis exit da ist oder klar keiner kommt
      if (hub.paths().includes('/claude/launch')) await hub.waitFor('/claude/exit', 5000);
      return { exitCode, records: readStubRecords(ws), requests: [...hub.requests] };
    };

    beforeAll(async () => {
      ws = createWorkspace(id);
      ws.root = realpathSync.native(ws.root);
      configureStub(ws);
      hub = new FakeTHub({ tabName: TAB_NAME, sessionId: NEW_ID, hookFile: ws.hookFile });
      await hub.start();
    });

    afterAll(async () => {
      for (const s of sessions) await s.close();
      await hub?.close();
      if (ws) removeWorkspace(ws);
    });

    describe('Integration laden', () => {
      it.skipIf(id === 'cmd')('lädt das Profil des Nutzers vor der Integration', async () => {
        const s = await start({});
        expect(existsSync(ws.profileLoaded)).toBe(true);
        // claude ist der Ersatz, nicht das Programm: der Starter fragt THub an
        const r = await call(s, 'claude');
        expect(r.requests.map((x) => x.path)).toEqual(['/claude/launch', '/claude/started', '/claude/exit']);
      });

      it('Windows PowerShell lädt seine Module, auch wenn THub aus PowerShell 7 gestartet wurde', async () => {
        // THub erbt dann den PSModulePath von PowerShell 7, mit dessen Modulordnern vorne.
        const pwshModules = fakePowerShell7Modules(ws);
        const s = await start({ inherited: { PSModulePath: [pwshModules, process.env.PSModulePath ?? ''].join(';') } });
        if (flavor === 'ps') {
          // In der Shell selbst (in Windows PowerShell lädt das Microsoft.PowerShell.Security)
          const inShell = await s.run(
            'try { $null = Get-ExecutionPolicy -ErrorAction Stop; $global:LASTEXITCODE = 0 } catch { $global:LASTEXITCODE = 9 }',
          );
          expect(inShell).toBe(0);
        }
        // Ein Windows PowerShell, das aus der Shell startet, wie der Starter
        expect(await s.run('powershell.exe -NoProfile -NonInteractive -Command Get-ExecutionPolicy')).toBe(0);
        const r = await call(s, 'claude');
        expect(r.records).toHaveLength(1);
        expect(r.requests.map((x) => x.path)).toEqual(['/claude/launch', '/claude/started', '/claude/exit']);
      });

      it.runIf(flavor === 'ps')('schaltet die Befehlsvorschau von PSReadLine aus, auch wenn das Profil sie einschaltet', async () => {
        // Wie ein Profil, das die Vorhersage samt Listenansicht einschaltet. PredictionSource gibt es ab PSReadLine 2.1,
        // PredictionViewStyle ab 2.2; Windows PowerShell bringt 2.0 mit, ohne beides.
        const hasOption = (name: string) => `(Get-Command Set-PSReadLineOption -ParameterName ${name} -ErrorAction SilentlyContinue)`;
        const s = await start({
          profileExtra: [
            `if (${hasOption('PredictionSource')}) { Set-PSReadLineOption -PredictionSource History }`,
            `if (${hasOption('PredictionViewStyle')}) { Set-PSReadLineOption -PredictionViewStyle ListView }`,
          ],
        });
        const startOutput = s.plainOutput();
        const file = path.join(ws.root, `prediction-${id}.txt`);
        await s.run(
          `Set-Content -LiteralPath '${file}' -Value ('{0}|{1}' -f [bool]${hasOption('PredictionSource')}, (Get-PSReadLineOption).PredictionSource)`,
        );
        const [supported, source] = readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split('|');
        if (supported === 'True') expect(source).toBe('None');
        else expect(source).toBe('');
        // Ohne die Option (PSReadLine 2.0) bleibt die Integration still.
        expect(startOutput).not.toMatch(/PredictionSource|Set-PSReadLineOption/);
      });
    });

    describe.runIf(flavor === 'ps')('Pfeiltasten im Befehlsverlauf (Ticket 24)', () => {
      /** Pfeil nach oben und unten, wie xterm.js sie schickt. */
      const UP = '\x1b[A';
      const DOWN = '\x1b[B';
      const PRESSES = 15;

      it('zeichnet die Zeile aus dem Verlauf in wenigen Millisekunden, nicht erst im nächsten Bild von ConPTY', async () => {
        const s = await start({});
        // Ohne Markierung, damit die Zeile im Verlauf kurz bleibt; die Markierung danach zeigt, dass sie gelaufen ist.
        s.write('echo verlauf-abcdefghijklmnopqrstuvwxyz\r');
        await s.mark();
        const times: number[] = [];
        for (let n = 0; n < PRESSES; n++) {
          // Zweimal hoch, an der Markierung vorbei. Gemessen wird der zweite Schritt: Dann schickt jede ConPTY die
          // ganze Zeile, weil sie sich ab dem Anfang ändert, nicht nur einzelne geänderte Zeichen.
          await s.writeAndTime(UP, /TH_MARK/);
          // `\s*`: Die ConPTY von Windows überspringt ein unverändertes Leerzeichen per Cursorbewegung.
          times.push(await s.writeAndTime(UP, /echo\s*verlauf-abcdefghijklmnopqrstuvwxyz/));
          // Zurück auf die leere Zeile; danach soll nichts mehr unterwegs sein.
          s.write(DOWN + DOWN);
          await sleep(150);
        }
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)];
        // Die ConPTY von Windows schickt die Zeile erst mit ihrem nächsten Bild, rund 16 ms nach der Taste; die
        // mitgelieferte (wie im Windows Terminal) nach 1 bis 5 ms.
        expect(median, `Zeiten in ms: ${times.map((t) => t.toFixed(1)).join(', ')}`).toBeLessThan(10);
      });
    });

    for (const variant of ['exe', 'cmd'] as Variant[]) {
      const direct = variant === 'exe' ? 'claude.exe' : 'claude-impl.exe';

      describe(`Gleichheit der Argumente (claude.${variant})`, () => {
        let s: ShellSession;
        beforeAll(async () => {
          s = await start({ variant });
        });

        it.each(Object.keys(CASES))('%s', async (name) => {
          const args = CASES[name][flavor];
          const viaWrapper = await call(s, `claude ${args}`);
          const viaDirect = await call(s, `${direct} ${args}`);
          expect(viaWrapper.records).toHaveLength(1);
          expect(viaDirect.records).toHaveLength(1);
          const w = viaWrapper.records[0];
          const d = viaDirect.records[0];
          const added = ['--settings', ws.hookFile, '--session-id', NEW_ID, '-n', TAB_NAME];
          expect(w.argv.slice(0, added.length)).toEqual(added);
          expect(w.argv.slice(added.length)).toEqual(d.argv);
          expect(w.argvCrt2008.slice(added.length)).toEqual(d.argvCrt2008);
          if (variant === 'exe') {
            // Der Rest der Befehlszeile kommt Zeichen fuer Zeichen gleich an.
            expect(w.rawArgs.endsWith(d.rawArgs.trimStart())).toBe(true);
          }
          expect(viaWrapper.exitCode).toBe(0);
        });
      });

      describe(`Ergänzen (claude.${variant})`, () => {
        let s: ShellSession;
        beforeAll(async () => {
          s = await start({ variant });
        });

        const cases: [string, string, string, string | null, string[]][] = [
          // Name, getippt, Fall, angegebene Kennung, erwartete argv
          ['neu', 'claude', 'new', null, ['--settings', '@hook', '--session-id', NEW_ID, '-n', TAB_NAME]],
          ['--resume x', 'claude --resume x', 'withId', 'x', ['--settings', '@hook', '--resume', 'x']],
          ['-r x', 'claude -r x', 'withId', 'x', ['--settings', '@hook', '-r', 'x']],
          ['--session-id', `claude --session-id ${NEW_ID.replace(/1/g, '9')}`, 'withId', NEW_ID.replace(/1/g, '9'), ['--settings', '@hook', '--session-id', NEW_ID.replace(/1/g, '9')]],
          ['-c', 'claude -c', 'withoutId', null, ['--settings', '@hook', '-c']],
          ['--resume ohne Wert', 'claude --resume', 'withoutId', null, ['--settings', '@hook', '--resume']],
          ['--resume vor Option', 'claude --resume --verbose', 'withoutId', null, ['--settings', '@hook', '--resume', '--verbose']],
          ['-n eigener', 'claude -n eigener', 'new', null, ['--settings', '@hook', '--session-id', NEW_ID, '-n', 'eigener']],
          ['--name=eigener', 'claude --name=eigener', 'new', null, ['--settings', '@hook', '--session-id', NEW_ID, '--name=eigener']],
          ['eigenes --settings', 'claude --settings eigene.json', 'new', null, ['--session-id', NEW_ID, '-n', TAB_NAME, '--settings', 'eigene.json']],
          ['--resume x mit eigenem --settings', 'claude --resume x --settings eigene.json', 'withId', 'x', ['--resume', 'x', '--settings', 'eigene.json']],
          ['Optionswert sieht aus wie Unterbefehl', 'claude --model mcp', 'new', null, ['--settings', '@hook', '--session-id', NEW_ID, '-n', TAB_NAME, '--model', 'mcp']],
        ];

        it.each(cases)('%s', async (_name, line, fall, givenId, expected) => {
          const r = await call(s, line);
          expect(r.records).toHaveLength(1);
          expect(r.records[0].argv).toEqual(expected.map((x) => (x === '@hook' ? ws.hookFile : x)));
          const launch = r.requests.find((x) => x.path === '/claude/launch');
          expect(launch?.body).toEqual({ tabId: TAB_ID, case: fall, sessionId: givenId, cwd: expect.any(String) });
          expect(launch!.body.cwd.toLowerCase()).toBe(ws.root.toLowerCase());
          for (const req of r.requests) expect(req.token).toBe(hub.token);
        });
      });

      describe(`Durchreichen (claude.${variant})`, () => {
        let s: ShellSession;
        beforeAll(async () => {
          s = await start({ variant });
        });

        const cases: [string, string[]][] = [
          [flavor === 'ps' ? `-p 'hello world'` : `-p "hello world"`, ['-p', 'hello world']],
          ['--print x', ['--print', 'x']],
          ['mcp list', ['mcp', 'list']],
          ['--version', ['--version']],
          ['-v', ['-v']],
          ['--help', ['--help']],
          ['--model opus mcp list', ['--model', 'opus', 'mcp', 'list']],
        ];

        it.each(cases)('claude %s', async (args, expected) => {
          const r = await call(s, `claude ${args}`);
          expect(r.requests).toEqual([]);
          expect(r.records).toHaveLength(1);
          expect(r.records[0].argv).toEqual(expected);
        });

        it('variadische Option verschluckt einen Unterbefehl (wie commander): interaktiv', async () => {
          const r = await call(s, 'claude --allowed-tools Read mcp');
          expect(r.requests.map((x) => x.path)).toEqual(['/claude/launch', '/claude/started', '/claude/exit']);
        });
      });

      describe(`Meldungen (claude.${variant})`, () => {
        let s: ShellSession;
        beforeAll(async () => {
          s = await start({ variant });
        });

        it('meldet launch, started mit Prozess-ID und exit', async () => {
          const r = await call(s, 'claude');
          expect(r.requests.map((x) => x.path)).toEqual(['/claude/launch', '/claude/started', '/claude/exit']);
          const started = r.requests[1].body;
          expect(started.tabId).toBe(TAB_ID);
          expect(Number.isInteger(started.pid)).toBe(true);
          if (variant === 'exe') expect(started.pid).toBe(r.records[0].pid);
          expect(r.requests[2].body).toEqual({ tabId: TAB_ID, sessionId: NEW_ID, exitCode: 0 });
        });

        it('meldet die Kennung bei --resume x und keine bei -c', async () => {
          const a = await call(s, 'claude --resume x');
          expect(a.requests[2].body).toEqual({ tabId: TAB_ID, sessionId: 'x', exitCode: 0 });
          const b = await call(s, 'claude -c');
          expect(b.requests[2].body).toEqual({ tabId: TAB_ID, sessionId: null, exitCode: 0 });
        });

        it('gibt einen Exit-Code ungleich 0 weiter und meldet ihn', async () => {
          configureStub(ws, { exit: 3 });
          try {
            const r = await call(s, 'claude');
            expect(r.exitCode).toBe(3);
            expect(r.requests[2].body.exitCode).toBe(3);
          } finally {
            configureStub(ws);
          }
        });

        it('meldet exit auch nach Ctrl+C, ohne Rückfrage "Batchvorgang abbrechen"', async () => {
          configureStub(ws, { wait: true, ctrlcExit: 130 });
          try {
            clearStubRecords(ws);
            hub.clear();
            const before = s.output.length;
            s.write('claude\r');
            await hub.waitFor('/claude/started');
            await s.waitForOutput(/STUB-WAITING/);
            await sleep(200);
            const atCtrlC = s.output.length;
            s.write('\x03');
            const exit = await hub.waitFor('/claude/exit');
            expect(exit.body).toEqual({ tabId: TAB_ID, sessionId: NEW_ID, exitCode: 130 });
            // Nach Ctrl+C verwerfen cmd und PowerShell vorab getippte Zeichen: erst den Prompt abwarten.
            await s.waitForOutputAfter(atCtrlC, /TH-PROMPT>/);
            await sleep(300);
            const code = await s.mark();
            expect(code).toBe(130);
            const after = s.output.slice(before);
            expect(after).not.toMatch(/Batchvorgang abbrechen|Terminate batch job/);
            // Die Shell ist weiter benutzbar
            configureStub(ws);
            const again = await call(s, 'claude --version');
            expect(again.records).toHaveLength(1);
          } finally {
            configureStub(ws);
          }
        });
      });
    }

    // Nur Bericht (TH_REPORT=1): Was kommt an, wenn man claude.cmd direkt aufruft? Der Ersatz liefert
    // bei claude.cmd die Argumente, die ein direkt aufgerufenes .exe bekaeme (siehe docs/spikes/starter.md).
    describe.runIf(process.env.TH_REPORT)('Bericht: direkter Aufruf von claude.cmd', () => {
      it('vergleicht claude.cmd direkt mit claude-impl.exe direkt', async () => {
        const s = await start({ variant: 'cmd' });
        const rows: string[] = [];
        for (const name of Object.keys(CASES)) {
          const args = CASES[name][flavor];
          const viaCmd = await call(s, `claude.cmd ${args}`);
          const viaExe = await call(s, `claude-impl.exe ${args}`);
          const a = viaCmd.records[0]?.argv;
          const b = viaExe.records[0]?.argv;
          const same = JSON.stringify(a) === JSON.stringify(b);
          rows.push(`${id} | ${name} | ${same ? 'gleich' : 'ANDERS'} | cmd=${JSON.stringify(a)} | exe=${JSON.stringify(b)}`);
        }
        console.log('BERICHT\n' + rows.join('\n'));
      });
    });

    describe('Ohne THub', () => {
      /** Zeitlimit des Starters fuer die Anfrage `launch`. */
      const LAUNCH_TIMEOUT_MS = 1000;
      /** Spielraum fuer Schwankungen, wenn die anderen Shells parallel laufen. */
      const SLACK_MS = 4000;

      /**
       * Wie lange ein Aufruf in dieser Shell gerade ohne jede Anfrage an THub dauert (durchgereicht): Start von
       * Windows PowerShell und dem nachgemachten claude, unter der aktuellen Last. Gemessen kurz vor und kurz
       * nach dem eigentlichen Aufruf; es zaehlt der laengere.
       */
      const withoutRequest = async (s: ShellSession): Promise<number> => {
        const t0 = Date.now();
        await s.run('claude --version');
        return Date.now() - t0;
      };

      /** Dauer von `line` und die Vergleichsdauer ohne Anfrage. */
      const timed = async <T>(s: ShellSession, line: () => Promise<T>): Promise<{ result: T; ms: number; baseline: number }> => {
        const before = await withoutRequest(s);
        const t0 = Date.now();
        const result = await line();
        const ms = Date.now() - t0;
        const after = await withoutRequest(s);
        return { result, ms, baseline: Math.max(before, after) };
      };

      it('startet claude unverändert, wenn die Schnittstelle nicht erreichbar ist', async () => {
        const s = await start({ api: `http://127.0.0.1:${await closedPort()}` });
        const { result: r, ms, baseline } = await timed(s, () => call(s, `claude ${CASES['Prompt mit Leerzeichen'][flavor]}`));
        // Die vergebliche Anfrage kostet hoechstens das Zeitlimit des Starters, kein Haengen.
        expect(ms).toBeLessThan(baseline + LAUNCH_TIMEOUT_MS + SLACK_MS);
        expect(r.records).toHaveLength(1);
        expect(r.records[0].argv).toEqual(['fix the bug in main.ts']);
        configureStub(ws, { exit: 4 });
        try {
          expect((await call(s, 'claude')).exitCode).toBe(4);
        } finally {
          configureStub(ws);
        }
      });

      it('startet claude unverändert nach etwa 1 s, wenn die Schnittstelle nicht antwortet', async () => {
        const hang = new FakeTHub({ tabName: TAB_NAME, sessionId: NEW_ID, hookFile: ws.hookFile });
        hang.mode = 'hang';
        await hang.start();
        try {
          const s = await start({ api: hang.url });
          const { result: records, ms, baseline } = await timed(s, async () => {
            clearStubRecords(ws);
            await s.run('claude');
            return readStubRecords(ws);
          });
          expect(records).toHaveLength(1);
          expect(records[0].argv).toEqual([]);
          expect(hang.paths()).toEqual(['/claude/launch']);
          expect(ms).toBeLessThan(baseline + LAUNCH_TIMEOUT_MS + SLACK_MS);
        } finally {
          await hang.close();
        }
      });

      it('meldet "claude wurde nicht gefunden" mit Exit-Code 1, wenn claude fehlt', async () => {
        const s = await start({ variant: null });
        const before = s.output.length;
        const r = await call(s, 'claude');
        expect(r.exitCode).toBe(1);
        expect(r.records).toEqual([]);
        expect(r.requests).toEqual([]);
        await s.waitForOutput(/claude wurde nicht gefunden/);
        expect(s.plainOutput().length).toBeGreaterThan(0);
        expect(s.output.slice(before)).toMatch(/claude wurde nicht gefunden/);
      });
    });

    describe('Ordner melden (Workspace-Kern mit echtem Terminal-Backend)', () => {
      let spaces: string;
      let second: string;
      const cores: CoreShell[] = [];
      const startCore = (storage?: CoreShell['storage'], extra?: Parameters<typeof CoreShell.start>[3]): CoreShell => {
        const core = CoreShell.start(def, ws, storage, extra);
        cores.push(core);
        return core;
      };
      const gitUsrBin = (): string => path.join(path.dirname(path.dirname(def.exe!)), 'usr', 'bin');

      beforeAll(() => {
        spaces = path.join(ws.root, 'Ordner mit Leerzeichen äöü');
        second = path.join(ws.root, 'Zweiter Ordner 100%');
        mkdirSync(spaces, { recursive: true });
        mkdirSync(second, { recursive: true });
      });

      afterAll(async () => {
        for (const core of cores) await core.shutdown();
      });

      it('lädt das Testprofil und meldet den Startordner, nach cd genau den neuen Ordner', async () => {
        rmSync(ws.profileLoaded, { force: true });
        const core = startCore();
        expect(core.orders).toMatchObject([{ cwd: ws.root, integration: def.integration }]);
        await core.waitForCwd(ws.root);
        if (id !== 'cmd') expect(existsSync(ws.profileLoaded)).toBe(true);

        core.write(cdLine(flavor, spaces) + '\r');
        await core.waitForCwd(spaces);
        core.write(cdLine(flavor, second) + '\r');
        await core.waitForCwd(second);
        // Der Tooltip zeigt den angezeigten Ordner des Tabs.
        expect(core.core.snapshot().tabs[0].cwd).toBe(second);
        expect(core.shownCwds.slice(-2)).toEqual([spaces, second]);
      });

      it('erweitert den eigenen Prompt; die Escape-Sequenzen erscheinen nicht als Text', async () => {
        await cores[0].waitForVisible(/TH-PROMPT>/);
        const raw = cores[0].output;
        // Die Sequenzen bleiben im Strom ...
        expect(raw).toMatch(flavor === 'bash' ? /\x1b\]7;file:\/\// : /\x1b\]9;9;/);
        // ... sichtbar bleibt der Prompt des Testprofils, ohne Reste einer Sequenz.
        const visible = visibleText(raw);
        expect(visible).toContain('TH-PROMPT>');
        expect(visible).not.toMatch(/[\x07\x1b]/);
        expect(visible).not.toMatch(/\]9;9;|\]7;|file:\/\//);
      });

      it.runIf(flavor === 'ps')('meldet Orte ausserhalb des Dateisystems nicht', async () => {
        const core = cores[0];
        core.write(cdLine(flavor, spaces) + '\r');
        await core.waitForCwd(spaces);
        core.write('Set-Location HKLM:\\\r');
        core.write(cdLine(flavor, second) + '\r');
        await core.waitForCwd(second);
        expect(core.shownCwds.slice(-2)).toEqual([spaces, second]);
      });

      it.runIf(flavor === 'bash')('rechnet Laufwerks- und Mount-Pfade um, virtuelle Orte zählen nicht', async () => {
        const core = cores[0];
        // Laufwerkspfad wie /c/Windows: meldet die Shell unverändert, der Kern macht C:\Windows daraus.
        const drivePath = `/${SYSTEM_ROOT[0].toLowerCase()}${SYSTEM_ROOT.slice(2).replace(/\\/g, '/')}`;
        core.write(`cd ${drivePath}\r`);
        await core.waitForCwd(SYSTEM_ROOT);
        // Mount-Punkt /usr/bin: liegt im Installationsordner von Git.
        core.write('cd /usr/bin\r');
        await core.waitForCwd(gitUsrBin());
        // /proc gibt es nur in MSYS, nicht im Dateisystem.
        core.write('cd /proc\r');
        core.write(cdLine(flavor, spaces) + '\r');
        await core.waitForCwd(spaces);
        expect(core.shownCwds.slice(-2)).toEqual([gitUsrBin(), spaces]);
      });

      describe.runIf(flavor === 'ps')('Robust laden', () => {
        it('funktioniert auch, wenn die Shell im Constrained Language Mode läuft', async () => {
          // Das Testprofil schaltet den Verlauf ab und danach die Sitzung in den Constrained Language Mode,
          // wie es WDAC/AppLocker für die ganze Sitzung tun.
          const core = startCore(undefined, {
            profileExtra: ["$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'"],
          });
          await core.waitForCwd(ws.root);
          core.write(cdLine(flavor, spaces) + '\r');
          await core.waitForCwd(spaces);
          await core.waitForVisible(/TH-PROMPT>/);
          await core.shutdown();
        });

        // Nur Windows PowerShell: PowerShell 7 fragt mit AllSigned beim Start, ob es den Herausgeber
        // Microsoft (PSReadLine) zulassen soll, ausserhalb von THub genauso; das lässt sich nicht ohne
        // Eingabe prüfen.
        it.runIf(id === 'powershell' && !executionPolicyFromGroupPolicy())(
          'startet mit Execution Policy AllSigned: Das unsignierte Profil fehlt, die Integration läuft',
          async () => {
            rmSync(ws.profileLoaded, { force: true });
            // Richtlinie nur für diesen Prozess, ohne Systemeinstellung.
            const core = startCore(undefined, { env: { PSExecutionPolicyPreference: 'AllSigned' } });
            try {
              await core.waitForCwd(ws.root);
              // Ohne Profil der Standard-Prompt von PowerShell, ebenfalls mit Ordner-Meldung
              await core.waitForVisible(/PS [A-Z]:\\[^\r\n]*>/);
              expect(existsSync(ws.profileLoaded)).toBe(false);
              // Die Meldung zum Profil steht da wie bei PowerShell selbst, ohne den Code der Integration.
              expect(visibleText(core.output)).toMatch(/test-profile\.ps1/);
              expect(visibleText(core.output)).not.toMatch(/THub-Integration/);
            } finally {
              // Nichts tippen: Ohne Testprofil schriebe PSReadLine in den echten Verlauf des Nutzers.
              await core.shutdown(false);
            }
          },
        );
      });

      it('startet nach einem Neustart im zuletzt aktiven Ordner', async () => {
        const before = cores[0];
        before.write(cdLine(flavor, spaces) + '\r');
        await before.waitForCwd(spaces);
        await before.shutdown();

        const after = startCore(before.storage);
        expect(after.orders).toMatchObject([{ cwd: spaces, integration: def.integration }]);
        // Die Shell steht wirklich dort: cd .. führt in den Arbeitsordner.
        after.write('cd ..\r');
        await after.waitForCwd(ws.root);
      });

      it('fällt beim Neustart auf den Startordner zurück, wenn der zuletzt aktive Ordner fehlt', async () => {
        const before = cores[cores.length - 1];
        const gone = path.join(ws.root, 'gleich weg');
        mkdirSync(gone);
        before.write(cdLine(flavor, gone) + '\r');
        await before.waitForCwd(gone);
        await before.shutdown();
        rmSync(gone, { recursive: true, force: true });

        const after = startCore(before.storage);
        expect(after.orders).toMatchObject([{ cwd: ws.root }]);
        await after.waitForCwd(ws.root);
      });
    });

    describe('Startbefehl', () => {
      it('"Starter mit --resume x" erreicht claude mit --settings, genau einmal', async () => {
        clearStubRecords(ws);
        hub.clear();
        const s = await start({ startCommand: def.startCommand('--resume x') });
        // Die erste Markierung ist durch: der Startbefehl ist gelaufen. Noch ein paar Prompts.
        await s.mark();
        await s.mark();
        await sleep(500);
        const records = readStubRecords(ws);
        expect(records).toHaveLength(1);
        expect(records[0].argv).toEqual(['--settings', ws.hookFile, '--resume', 'x']);
        expect(hub.paths()).toEqual(['/claude/launch', '/claude/started', '/claude/exit']);
        expect(hub.requests[0].body.case).toBe('withId');
        expect(records[0].env.THUB_TAB_ID).toBe(TAB_ID);
        // Die Integration entfernt THUB_START_CMD vor dem Ausführen; NO_PROXY und THUB_STARTER setzt das
        // Terminal-Backend.
        expect(records[0].env.THUB_START_CMD).toBeUndefined();
        expect(records[0].env.NO_PROXY?.split(',')).toEqual(expect.arrayContaining(['127.0.0.1', 'localhost']));
        expect(records[0].env.THUB_STARTER).toBe(ws.starter);
      });

      it('Fortsetzen: der Startbefehl des Kerns erreicht claude über den Starter mit --settings und --resume <Kennung>', async () => {
        clearStubRecords(ws);
        hub.clear();
        const s = await start({ startCommand: resumeCommand(def.integration, RESUME_ID) });
        await s.mark();
        await s.mark();
        await sleep(500);

        const records = readStubRecords(ws);
        expect(records.map((r) => r.argv)).toEqual([['--settings', ws.hookFile, '--resume', RESUME_ID]]);
        expect(records[0].env.THUB_STARTER).toBe(ws.starter);
        expect(records[0].env.THUB_START_CMD).toBeUndefined();
        expect(hub.paths()).toEqual(['/claude/launch', '/claude/started', '/claude/exit']);
        expect(hub.requests[0].body).toMatchObject({ tabId: TAB_ID, case: 'withId', sessionId: RESUME_ID });
        expect(hub.requests[2].body).toEqual({ tabId: TAB_ID, sessionId: RESUME_ID, exitCode: 0 });
      });

      it('Fortsetzen ohne THUB_STARTER (Gruppenrichtlinie): der Startbefehl ruft claude direkt mit --resume <Kennung> auf', async () => {
        clearStubRecords(ws);
        hub.clear();
        const s = await start({ startCommand: resumeCommand(def.integration, RESUME_ID), claudeStarter: () => false });
        await s.mark();
        await s.mark();
        await sleep(500);

        const records = readStubRecords(ws);
        expect(records.map((r) => r.argv)).toEqual([['--resume', RESUME_ID]]);
        expect(records[0].env.THUB_STARTER).toBeUndefined();
        expect(hub.requests).toEqual([]);
      });
    });

    describe('Ende zu Ende: Kern, echte lokale Schnittstelle, Terminal-Backend, Shell', () => {
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      let project: string;
      let policy: ExecutionPolicyCheck;
      let exeCore: CoreShell | null = null;
      const cores: CoreShell[] = [];

      beforeAll(async () => {
        project = path.join(ws.root, 'Projekt äöü');
        mkdirSync(project, { recursive: true });
        // Wie main.ts: Die echte Prüfung der Execution Policy entscheidet, ob die Shells den Ersatz bekommen.
        policy = checkExecutionPolicy();
        await policy.done;
      });

      afterAll(async () => {
        for (const core of cores) await core.shutdown();
      });

      /** THub wie nach dem Start: ein Tab „Mein Tab äöü“, dessen Shell im Projektordner (mit Umlauten) steht. */
      const startTHub = async (variant: Variant, claudeStarter = () => policy.starterAllowed()): Promise<CoreShell> => {
        const core = await CoreShell.startWithApi(def, ws, {
          claudeDir: variant === 'exe' ? ws.stubExeDir : ws.stubCmdDir,
          claudeStarter,
        });
        cores.push(core);
        core.core.renameTab(core.tabId, TAB_NAME);
        await core.waitForCwd(ws.root);
        core.write(cdLine(flavor, project) + '\r');
        await core.waitForCwd(project);
        return core;
      };

      /** Claude-Tab, noch nicht per Hook bestätigt, im Projektordner. */
      const unconfirmed = (sessionId: string) => ({
        sessionId,
        cwd: expect.toSatisfy((cwd: string) => cwd.toLowerCase() === project.toLowerCase()),
        confirmed: false,
        hadPrompt: false,
      });

      it('claude macht den Tab zum Claude-Tab mit der Kennung des Kerns; das Ende macht ihn wieder normal', async (ctx) => {
        ctx.skip(!policy.starterAllowed(), 'Eine Gruppenrichtlinie blockiert den Starter auf diesem Rechner');
        exeCore = await startTHub('exe');
        const core = exeCore;
        expect(core.claudeLink()).toBeUndefined();
        configureStub(ws, { wait: true, ctrlcExit: 130 });
        try {
          clearStubRecords(ws);
          core.write('claude\r');
          const link = await core.waitForClaudeLink((l) => l !== undefined);
          await core.waitForVisible(/STUB-WAITING/);

          // claude bekommt die Hook-Datei dieses Starts, die Kennung des Kerns und den Tab-Namen mit Umlauten.
          const records = readStubRecords(ws);
          expect(records).toHaveLength(1);
          const argv = records[0].argv;
          expect(argv).toEqual(['--settings', core.localApi.hookFile, '--session-id', expect.stringMatching(UUID), '-n', TAB_NAME]);
          expect(records[0].env.THUB_TAB_ID).toBe(core.tabId);
          // Während claude läuft, ist der Tab ein unbestätigter Claude-Tab mit genau dieser Kennung.
          expect(link).toEqual(unconfirmed(argv[3]));

          // Ctrl+C beendet claude; die Ende-Meldung macht den Tab wieder zum normalen Terminal.
          const atCtrlC = core.output.length;
          core.write('\x03');
          await core.waitForClaudeLink((l) => l === undefined);
          expect(core.claudeLinks).toEqual([link, undefined]);
          // Nach Ctrl+C verwerfen cmd und PowerShell vorab getippte Zeichen: erst den Prompt abwarten.
          await core.waitForVisibleAfter(atCtrlC, /TH-PROMPT>/);
          await sleep(300);
          expect(await core.mark()).toBe(130);
        } finally {
          configureStub(ws);
        }
      });

      it('claude --resume <Kennung>: Claude-Tab mit dieser Kennung, nur --settings ergänzt', async (ctx) => {
        ctx.skip(!policy.starterAllowed(), 'Eine Gruppenrichtlinie blockiert den Starter auf diesem Rechner');
        const core = exeCore ?? (await startTHub('exe'));
        const id = '0f54d6f0-5e3c-45e6-aabf-d76021219bad';
        const before = core.claudeLinks.length;
        clearStubRecords(ws);

        expect(await core.run(`claude --resume ${id}`)).toBe(0);

        expect(readStubRecords(ws).map((r) => r.argv)).toEqual([['--settings', core.localApi.hookFile, '--resume', id]]);
        expect(core.claudeLinks.slice(before)).toEqual([unconfirmed(id), undefined]);
        expect(core.claudeLink()).toBeUndefined();
      });

      it('über claude.cmd (npm-Shim) ebenso; ein Exit-Code ungleich 0 kommt in der Shell an', async (ctx) => {
        ctx.skip(!policy.starterAllowed(), 'Eine Gruppenrichtlinie blockiert den Starter auf diesem Rechner');
        const core = await startTHub('cmd');
        configureStub(ws, { exit: 3 });
        try {
          clearStubRecords(ws);

          expect(await core.run('claude')).toBe(3);

          const records = readStubRecords(ws);
          expect(records).toHaveLength(1);
          const argv = records[0].argv;
          expect(argv).toEqual(['--settings', core.localApi.hookFile, '--session-id', expect.stringMatching(UUID), '-n', TAB_NAME]);
          expect(core.claudeLinks).toEqual([unconfirmed(argv[3]), undefined]);
        } finally {
          configureStub(ws);
        }
      });

      it('Gruppenrichtlinie AllSigned (nachgemacht): kein Ersatz, claude läuft direkt, der Tab bleibt normal', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const allSigned = checkExecutionPolicy(() => Promise.resolve({ kind: 'output', stdout: 'AllSigned\r\nUndefined\r\n' }));
        try {
          expect(await allSigned.done).toBe(false);
        } finally {
          vi.restoreAllMocks();
        }
        const core = await startTHub('exe', () => allSigned.starterAllowed());
        clearStubRecords(ws);

        expect(await core.run(`claude ${CASES['Prompt mit Leerzeichen'][flavor]}`)).toBe(0);

        const records = readStubRecords(ws);
        expect(records).toHaveLength(1);
        expect(records[0].argv).toEqual(['fix the bug in main.ts']);
        expect(records[0].env.THUB_STARTER).toBeUndefined();
        expect(records[0].env.THUB_TAB_ID).toBe(core.tabId);
        expect(core.claudeLinks).toEqual([]);
      });

      describe('Claude-Session nach einem Neustart fortsetzen', () => {
        /**
         * THub nach einem Neustart: Der zuletzt aktive Tab ist ein Claude-Tab, dessen Session im Projektordner
         * fortgesetzt wird; zuletzt stand seine Shell im Arbeitsordner. Hält die Hinweise des Kerns fest.
         */
        const restartWithClaudeTab = async (
          claudeStarter = () => policy.starterAllowed(),
        ): Promise<{ core: CoreShell; notices: string[] }> => {
          clearStubRecords(ws);
          const storage = new MemoryStorage({
            version: 2,
            tabs: [
              {
                id: 'claude-tab',
                name: TAB_NAME,
                nameIsManual: true,
                shellId: def.id,
                startCwd: ws.root,
                lastCwd: ws.root,
                claude: { sessionId: RESUME_ID, cwd: project, confirmed: true, hadPrompt: true },
              },
            ],
            activeTabId: 'claude-tab',
          });
          const core = await CoreShell.startWithApi(def, ws, { claudeDir: ws.stubExeDir, claudeStarter }, storage);
          cores.push(core);
          const notices: string[] = [];
          core.core.subscribe((event: WorkspaceEvent) => {
            if (event.type === 'notice') notices.push(event.text);
          });
          return { core, notices };
        };

        /** Wartet, bis das nachgemachte claude aufgerufen wurde, und liefert die Aufzeichnungen. */
        const stubCalled = async (core: CoreShell): Promise<ReturnType<typeof readStubRecords>> => {
          const end = Date.now() + 20000;
          while (Date.now() < end) {
            const records = readStubRecords(ws);
            if (records.length > 0) return records;
            await sleep(50);
          }
          throw new Error(`claude wurde nicht aufgerufen in ${def.id}. Ausgabe:\n${visibleText(core.output).slice(-3000)}`);
        };

        it('Shell im Ordner der Session, claude bekommt --settings und --resume <Kennung>; das Ende macht den Tab normal', async (ctx) => {
          ctx.skip(!policy.starterAllowed(), 'Eine Gruppenrichtlinie blockiert den Starter auf diesem Rechner');
          const { core, notices } = await restartWithClaudeTab();

          const records = await stubCalled(core);
          await core.waitForClaudeLink((l) => l === undefined);

          expect(core.orders).toMatchObject([{ cwd: project, startCommand: resumeCommand(def.integration, RESUME_ID) }]);
          expect(records.map((r) => r.argv)).toEqual([['--settings', core.localApi.hookFile, '--resume', RESUME_ID]]);
          // claude setzt die Session im aktuellen Ordner fort: Das muss der Ordner der Session sein.
          expect(records[0].cwd.toLowerCase()).toBe(project.toLowerCase());
          expect(records[0].env.THUB_TAB_ID).toBe('claude-tab');
          // Der Starter meldet das Fortsetzen („hatte Prompt“ bleibt), sein Ende macht den Tab wieder normal.
          expect(core.claudeLinks).toEqual([{ ...unconfirmed(RESUME_ID), hadPrompt: true }, undefined]);
          expect(notices).toEqual([]);
          expect(await core.mark()).toBe(0);
        });

        it('schlägt es fehl (Exit-Code 1, keine Hooks), kommt ein Hinweis, und der Tab bleibt als normales Terminal benutzbar', async (ctx) => {
          ctx.skip(!policy.starterAllowed(), 'Eine Gruppenrichtlinie blockiert den Starter auf diesem Rechner');
          configureStub(ws, { exit: 1 });
          try {
            const { core, notices } = await restartWithClaudeTab();

            await stubCalled(core);
            await core.waitForClaudeLink((l) => l === undefined);

            expect(notices).toEqual(['Claude-Session konnte nicht fortgesetzt werden']);
            await core.mark();
          } finally {
            configureStub(ws);
          }
        });

        it('ohne THUB_STARTER (Gruppenrichtlinie) läuft claude direkt mit --resume <Kennung>, im Ordner der Session', async () => {
          const { core } = await restartWithClaudeTab(() => false);

          const records = await stubCalled(core);

          expect(records.map((r) => r.argv)).toEqual([['--resume', RESUME_ID]]);
          expect(records[0].env.THUB_STARTER).toBeUndefined();
          expect(records[0].cwd.toLowerCase()).toBe(project.toLowerCase());
          await core.mark();
        });
      });
    });

    describe('Schliessen: Shell samt Nachfahren beenden, Konsolen-Host aufräumen (Kern mit echter Prozess-Sonde)', () => {
      const probe = createProcessProbe();
      const cores: CoreShell[] = [];
      const powershell = path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

      afterAll(async () => {
        // Geschlossene oder beendete Tabs: nichts mehr tippen, nur noch den Kern beenden.
        for (const core of cores) await core.shutdown(false);
      });

      /** Konsolen-Hosts, die dieser Testprozess wie THub für Pseudokonsolen gestartet hat. */
      const ownHosts = async (): Promise<number[]> =>
        (await probe.snapshot())
          .filter((p) => p.ppid === process.pid && /^(conhost|openconsole)\.exe$/i.test(p.name))
          .map((p) => p.pid);

      const alive = (pid: number): boolean => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };

      async function waitUntil(ok: () => boolean | Promise<boolean>, what: string, timeoutMs = 15000): Promise<void> {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
          if (await ok()) return;
          await sleep(100);
        }
        throw new Error(`${what} in ${id}`);
      }

      /** Windows PowerShell mit einem Befehl, ohne Profil und ohne Quoting-Fragen (Base64), in der Sprache der Shell. */
      function powershellLine(script: string): string {
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        const args = `-NoProfile -NonInteractive -EncodedCommand ${encoded}`;
        if (flavor === 'ps') return `& '${powershell}' ${args}`;
        if (flavor === 'cmd') return `"${powershell}" ${args}`;
        return `'${powershell.replace(/\\/g, '/')}' ${args}`;
      }

      it('ein Prozess mit eigener Konsole (Start-Process), den pty.kill() nicht erreicht, endet mit seinem Tab', async () => {
        const core = CoreShell.start(def, ws, undefined, { realProcesses: true });
        cores.push(core);
        await core.mark();
        const pidFile = path.join(ws.root, `start-process-${id}.pid`);
        rmSync(pidFile, { force: true });
        // Versteckt, ohne Fenster; das wartende powershell.exe hält die Eltern-Kette bis zur Shell.
        core.write(
          powershellLine(
            `$p = Start-Process -FilePath ping.exe -ArgumentList '-t','127.0.0.1' -WindowStyle Hidden -PassThru; ` +
              `Set-Content -LiteralPath '${pidFile}' -Value $p.Id -Encoding Ascii; Wait-Process -Id $p.Id`,
          ) + '\r',
        );
        await waitUntil(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim() !== '', 'ping.exe startete nicht');
        const pid = Number(readFileSync(pidFile, 'utf8').trim());
        expect(alive(pid)).toBe(true);

        core.core.closeTab(core.tabId);

        await waitUntil(() => !alive(pid), 'ping.exe lief nach dem Schliessen weiter');
      });

      it('läuft über die mitgelieferte ConPTY: Konsolen-Host ist OpenConsole.exe wie im Windows Terminal (Ticket 24)', async () => {
        const before = new Set(await ownHosts());
        const core = CoreShell.start(def, ws, undefined, { realProcesses: true });
        cores.push(core);
        await core.mark();
        const hosts = (await probe.snapshot()).filter(
          (p) => p.ppid === process.pid && !before.has(p.pid) && /^(conhost|openconsole)\.exe$/i.test(p.name),
        );
        expect(hosts.map((p) => p.name)).toEqual(['OpenConsole.exe']);
        core.write('exit\r');
      });

      it('endet die Shell mit exit, endet auch ihr Konsolen-Host (node-pty 1.1.0 liesse ihn stehen)', async () => {
        const before = new Set(await ownHosts());
        const core = CoreShell.start(def, ws, undefined, { realProcesses: true });
        cores.push(core);
        await core.mark();
        const hosts = (await ownHosts()).filter((pid) => !before.has(pid));
        expect(hosts).toHaveLength(1);

        core.write('exit\r');

        await waitUntil(async () => !(await ownHosts()).includes(hosts[0]), 'Der Konsolen-Host blieb nach exit bestehen');
      });
    });
  });
}
