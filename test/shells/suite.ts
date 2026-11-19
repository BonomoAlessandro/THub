// Gemeinsame Tests fuer alle vier Windows-Shells (Teststelle 2, Ticket 11).
// Jede Shell hat eine eigene Testdatei, damit Vitest die Shells parallel laufen laesst.
import { existsSync, realpathSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FakeTermHub,
  SHELLS,
  ShellSession,
  type ShellId,
  type Variant,
  type Workspace,
  clearStubRecords,
  closedPort,
  configureStub,
  createWorkspace,
  readStubRecords,
  removeWorkspace,
  sleep,
} from './harness';

const TAB_ID = 'tab-1';
const TAB_NAME = 'Mein Tab äöü';
const NEW_ID = '11111111-2222-4333-8444-555555555555';

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

export function shellSuite(id: ShellId): void {
  const def = SHELLS[id];
  const flavor = flavorOf(id);

  describe.skipIf(!def.exe)(`${id}`, () => {
    let ws: Workspace;
    let hub: FakeTermHub;
    const sessions: ShellSession[] = [];

    const start = async (opts: {
      variant?: Variant | null;
      api?: string | null;
      startCommand?: string;
    }): Promise<ShellSession> => {
      const variant = opts.variant === undefined ? 'exe' : opts.variant;
      const claudeDir = variant === 'exe' ? ws.stubExeDir : variant === 'cmd' ? ws.stubCmdDir : null;
      const s = await ShellSession.start(def, ws, {
        claudeDir,
        api: opts.api === undefined ? hub.url : opts.api,
        token: hub.token,
        tabId: TAB_ID,
        startCommand: opts.startCommand,
      });
      sessions.push(s);
      return s;
    };

    /** Tippt eine Zeile und liefert Exit-Code, Aufzeichnungen des Stubs und Anfragen an TermHub. */
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
      hub = new FakeTermHub({ tabName: TAB_NAME, sessionId: NEW_ID, hookFile: ws.hookFile });
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
        // claude ist der Ersatz, nicht das Programm: der Starter fragt TermHub an
        const r = await call(s, 'claude');
        expect(r.requests.map((x) => x.path)).toEqual(['/claude/launch', '/claude/started', '/claude/exit']);
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

    describe('Ohne TermHub', () => {
      it('startet claude unverändert, wenn die Schnittstelle nicht erreichbar ist', async () => {
        const s = await start({ api: `http://127.0.0.1:${await closedPort()}` });
        const t0 = Date.now();
        const r = await call(s, `claude ${CASES['Prompt mit Leerzeichen'][flavor]}`);
        expect(Date.now() - t0).toBeLessThan(6000);
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
        const hang = new FakeTermHub({ tabName: TAB_NAME, sessionId: NEW_ID, hookFile: ws.hookFile });
        hang.mode = 'hang';
        await hang.start();
        try {
          const s = await start({ api: hang.url });
          clearStubRecords(ws);
          const t0 = Date.now();
          await s.run('claude');
          const elapsed = Date.now() - t0;
          const records = readStubRecords(ws);
          expect(records).toHaveLength(1);
          expect(records[0].argv).toEqual([]);
          expect(hang.paths()).toEqual(['/claude/launch']);
          expect(elapsed).toBeLessThan(5000);
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
        expect(records[0].env.TERMHUB_TAB_ID).toBe(TAB_ID);
      });
    });
  });
}
