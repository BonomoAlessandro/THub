import { describe, expect, it } from 'vitest';
import {
  SAME_WINDOW_MS,
  mergeLimits,
  newerLimit,
  normalizeAccountLimits,
  readStatusLine,
  type ReportedLimits,
} from '../../src/main/workspace/usage';
import { shownLimit } from '../../src/shared/usage';
import type { AccountLimits, UsageSnapshot } from '../../src/shared/types';
import { statusLinePayload } from '../support/apiClient';
import { ClaudeTab } from '../support/claudeTab';
import { startWorkspace, startWorkspaceWithApi, type TestWorkspace } from '../support/harness';
import { readPersistedState as readStateLikeThub031 } from './fixtures/schema-0.3.1';

// Verbrauchsbalken (Ticket 38): Modell und Kosten pro Claude-Tab, Limits des Kontos, tolerantes Lesen, Reset nach der
// Uhr, Speichern. Die Meldungen kommen wie im Betrieb über die echte lokale Schnittstelle, als JSON der Statuszeile in
// der Form, die Claude Code 2.1.332 im Spike geschickt hat (spikes/claude-hooks/samples/StatusLine.json).

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Sekunden seit 1970, wie Claude `resets_at` meldet. */
const seconds = (ms: number) => Math.round(ms / 1000);

/** `rate_limits` mit Session und Woche, Resets relativ zur Uhr des Tests. */
function rateLimits(h: TestWorkspace, session: number, week: number, sessionResetIn = 2 * HOUR, weekResetIn = 50 * HOUR) {
  const now = h.clock.now();
  return {
    five_hour: { used_percentage: session, resets_at: seconds(now + sessionResetIn) },
    seven_day: { used_percentage: week, resets_at: seconds(now + weekResetIn) },
  };
}

function usage(h: TestWorkspace): UsageSnapshot {
  return h.snapshot().usage;
}

/** Ein Claude-Tab, gestartet über den Starter, mit SessionStart. */
async function claudeTab(h: TestWorkspace, tabId = h.activeTab()!.id): Promise<ClaudeTab> {
  return ClaudeTab.launch(h, tabId);
}

describe('Verbrauchsbalken im Kern (Ticket 38)', () => {
  describe('Modell und Kosten pro Claude-Tab', () => {
    it('kommen aus der letzten Meldung des Tabs, jeder Tab für sich', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      const b = await claudeTab(h, h.workspace.createTab());

      await h.api.statusLine(a.id, statusLinePayload({ model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' } }));
      await h.api.statusLine(b.id, statusLinePayload({ cost: { total_cost_usd: 0.5 } }));
      await h.api.statusLine(a.id, statusLinePayload({ model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, cost: { total_cost_usd: 4.123 } }));

      expect(usage(h).tabs).toEqual({
        [a.id]: { modelId: 'claude-opus-5-5', modelName: 'Opus 5.5', costUsd: 4.123 },
        [b.id]: { modelId: 'claude-haiku-5-5', modelName: 'Haiku 5.5', costUsd: 0.5 },
      });
      expect(h.eventsOfType('usage').at(-1)?.usage.tabs[a.id]).toMatchObject({ costUsd: 4.123 });
    });

    it('entfallen mit der Claude-Zuordnung; die Limits bleiben', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      await h.api.statusLine(a.id, statusLinePayload());
      expect(usage(h).tabs[a.id]).toBeDefined();

      await a.send('SessionEnd-prompt_input_exit');

      expect(h.activeTab()?.kind).toBe('terminal');
      expect(usage(h).tabs).toEqual({});
      expect(h.eventsOfType('usage').at(-1)?.usage.tabs).toEqual({});
      expect(usage(h).limits?.session).toBeDefined();
    });

    it('entfallen, wenn der Tab geschlossen wird', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      h.workspace.createTab();
      await h.api.statusLine(a.id, statusLinePayload());

      h.workspace.closeTab(a.id);

      expect(h.eventsOfType('usage').at(-1)?.usage.tabs).toEqual({});
    });

    it('gibt es für einen normalen Tab nicht, seine Limits zählen aber', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;

      await h.api.statusLine(tabId, statusLinePayload({ rate_limits: rateLimits(h, 12, 34) }));

      expect(usage(h).tabs).toEqual({});
      expect(usage(h).limits).toMatchObject({ session: { usedPercent: 12 }, week: { usedPercent: 34 } });
    });

    it('nach /clear: die neue Session meldet ihre eigenen Kosten', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      await h.api.statusLine(a.id, statusLinePayload({ cost: { total_cost_usd: 1.25 } }));

      await a.send('SessionEnd-clear');
      await h.api.statusLine(a.id, statusLinePayload({ session_id: 'neu', cost: { total_cost_usd: 0 } }));

      expect(usage(h).tabs[a.id]).toMatchObject({ costUsd: 0 });
    });
  });

  describe('Limits des Kontos', () => {
    it('der neueste Stand aus zwei Tabs gewinnt, mit Zeitpunkt und Tab', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      const b = await claudeTab(h, h.workspace.createTab());
      h.workspace.renameTab(b.id, 'web');

      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 40, 20) }));
      const first = h.clock.now();
      h.clock.advance(5 * MINUTE);
      await h.api.statusLine(b.id, statusLinePayload({ rate_limits: rateLimits(h, 45, 21, 2 * HOUR - 5 * MINUTE, 50 * HOUR - 5 * MINUTE) }));

      expect(usage(h).limits).toMatchObject({
        session: { usedPercent: 45, resetsAt: (seconds(first + 2 * HOUR)) * 1000 },
        week: { usedPercent: 21 },
        reportedAt: first + 5 * MINUTE,
        tabId: b.id,
        tabName: 'web',
      });
    });

    it('ein älterer Stand aus einem anderen Tab ändert nichts, etwa nach einer neuen Grösse des Terminals', async () => {
      // Claude schickt die Limits aus seiner letzten Antwort bei jeder Meldung mit (im Spike: nach einer neuen Grösse
      // des Terminals). Ein Tab, der lange nichts gemacht hat, meldet so einen älteren Stand.
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      const b = await claudeTab(h, h.workspace.createTab());
      const limitsA = rateLimits(h, 40, 20);
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: limitsA }));
      h.clock.advance(HOUR);
      await h.api.statusLine(b.id, statusLinePayload({ rate_limits: { five_hour: { ...limitsA.five_hour, used_percentage: 70 }, seven_day: { ...limitsA.seven_day, used_percentage: 30 } } }));
      const stored = usage(h).limits;

      h.clock.advance(MINUTE);
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: limitsA }));

      expect(usage(h).limits).toEqual(stored);
      expect(stored).toMatchObject({ session: { usedPercent: 70 }, week: { usedPercent: 30 }, tabId: b.id });
    });

    it('ein neues Fenster (späterer Reset) gilt, auch mit weniger Verbrauch', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 90, 50, 10 * MINUTE) }));

      h.clock.advance(20 * MINUTE);
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 3, 51, 5 * HOUR) }));

      expect(usage(h).limits).toMatchObject({ session: { usedPercent: 3 }, week: { usedPercent: 51 } });
    });

    it('ein vorbeigegangener Reset ergibt 0 %, gedämpft, bis eine neue Meldung kommt', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 88, 40, 30 * MINUTE) }));
      const { session, week } = usage(h).limits!;
      expect(shownLimit(session!, h.clock.now())).toEqual({ percent: 88, expired: false });

      h.clock.advance(30 * MINUTE);
      expect(shownLimit(session!, h.clock.now())).toEqual({ percent: 0, expired: true });
      expect(shownLimit(week!, h.clock.now())).toEqual({ percent: 40, expired: false });

      // Claude lässt das abgelaufene Fenster weg, bis die API es wieder meldet: Die Session bleibt gedämpft.
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: { seven_day: rateLimits(h, 0, 41).seven_day } }));
      expect(shownLimit(usage(h).limits!.session!, h.clock.now())).toEqual({ percent: 0, expired: true });
      expect(usage(h).limits!.week).toMatchObject({ usedPercent: 41 });

      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 2, 41, 5 * HOUR) }));
      expect(shownLimit(usage(h).limits!.session!, h.clock.now())).toEqual({ percent: 2, expired: false });
    });

    it('ohne rate_limits (ohne Abo, vor der ersten Antwort, nach dem Fortsetzen) bleibt der bisherige Stand', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: undefined }));
      expect(usage(h).limits).toBeNull();
      expect(usage(h).tabs[a.id]).toBeDefined();

      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 10, 20) }));
      const stored = usage(h).limits;
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: undefined }));

      expect(usage(h).limits).toEqual(stored);
    });

    it('werden gespeichert und nach einem Neustart wieder gezeigt, auch solange alle Claude-Tabs pausiert sind', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      await a.answer();
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 38, 21) }));
      const limits = usage(h).limits;
      h.workspace.createTab();
      expect(h.storedState().usageLimits).toEqual(limits);

      await h.restart();

      expect(h.tabs().find((t) => t.id === a.id)).toMatchObject({ kind: 'claude', paused: true });
      // Modell und Kosten werden nicht gespeichert; die Limits schon.
      expect(usage(h)).toEqual({ tabs: {}, limits });
    });

    it('eine ältere THub liest den Zustand weiter und lässt die Limits weg', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      await h.api.statusLine(a.id, statusLinePayload({ rate_limits: rateLimits(h, 38, 21) }));
      const stored = h.storedState();
      expect(stored.usageLimits).toBeDefined();
      expect(stored.settings.usageBar).toBe(true);

      const old = readStateLikeThub031(JSON.parse(JSON.stringify(stored)), { homeDir: 'C:\\Users\\anna', defaultShellId: 'pwsh' });

      expect(old.migrated).toBe(false);
      expect(old.state.tabs.map((t) => t.id)).toEqual([a.id]);
      expect(old.state.tabs[0].claude).toMatchObject({ sessionId: a.sessionId });
      expect(old.state).not.toHaveProperty('usageLimits');
      expect(old.state.settings).not.toHaveProperty('usageBar');
    });

    it('liest einen beschädigten gespeicherten Stand tolerant', () => {
      const h = startWorkspace({
        state: {
          version: 2,
          tabs: [],
          usageLimits: { session: { usedPercent: 'viel' }, week: { usedPercent: 140, resetsAt: -5 }, extra: 'x' },
        },
      });

      expect(usage(h).limits).toEqual({ extra: [], reportedAt: 0, tabId: '', tabName: '', week: { usedPercent: 100 } });
      expect(startWorkspace({ state: { version: 2, tabs: [], usageLimits: [1, 2] } }).snapshot().usage.limits).toBeNull();
    });
  });

  describe('Unbrauchbares', () => {
    it.each([
      ['kein JSON', 'gar kein JSON {'],
      ['leer', ''],
      ['eine Liste', [1, 2, 3]],
      ['null', null],
      ['falsche Typen', { model: 'Opus', cost: { total_cost_usd: 'teuer' }, rate_limits: { five_hour: { used_percentage: null } } }],
    ])('%s ändert nichts und gibt keinen Fehler', async (_label, body) => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      const before = h.storedState();

      const res = await h.api.post('/claude/statusline', body, { 'X-THub-Tab': a.id });

      expect(res.status).toBe(200);
      expect(res.body).toBe('');
      expect(usage(h)).toEqual({ tabs: {}, limits: null });
      expect(h.storedState()).toEqual(before);
    });

    it('nach dem Einfrieren beim Beenden zählt keine Meldung mehr', async () => {
      const h = await startWorkspaceWithApi();
      const a = await claudeTab(h);
      h.workspace.freeze();

      await h.api.statusLine(a.id, statusLinePayload());

      expect(usage(h)).toEqual({ tabs: {}, limits: null });
    });
  });

  describe('Einstellung „Verbrauchsbalken anzeigen“', () => {
    it('ist standardmässig an; Claude startet mit der Hook-Datei mit statusLine', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;

      expect(h.snapshot().settings.usageBar).toBe(true);
      const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });

      expect(JSON.parse(res.body).hookFile).toBe(h.localApi.hookFile);
    });

    it('aus: Claude startet mit der Hook-Datei ohne statusLine und zeigt wieder seine eigene Statuszeile', async () => {
      const h = await startWorkspaceWithApi();
      const tabId = h.activeTab()!.id;

      h.workspace.updateSettings({ usageBar: false });
      const res = await h.api.launch({ tabId, case: 'new', cwd: 'C:\\proj' });

      expect(JSON.parse(res.body).hookFile).toBe(h.localApi.hookFileWithoutStatusLine);
      expect(h.storedState().settings.usageBar).toBe(false);
      expect(h.eventsOfType('settings').at(-1)?.settings.usageBar).toBe(false);
    });

    it('fehlt sie im gespeicherten Zustand (von vor Ticket 38), ist sie an', () => {
      const h = startWorkspace({ state: { version: 2, settings: { theme: 'dark' }, tabs: [] } });

      expect(h.snapshot().settings).toMatchObject({ theme: 'dark', usageBar: true });
    });
  });
});

describe('Regeln zum JSON der Statuszeile (Ticket 38)', () => {
  describe('tolerantes Lesen', () => {
    it('liest die Beispiel-Nutzdaten aus dem Spike', () => {
      expect(readStatusLine(statusLinePayload())).toEqual({
        modelId: 'claude-haiku-5-5',
        modelName: 'Haiku 5.5',
        costUsd: 0.014391390000000002,
        limits: {
          session: { usedPercent: 56, resetsAt: 1795780800_000 },
          week: { usedPercent: 26, resetsAt: 1795834800_000 },
          extra: [],
        },
      });
    });

    it('nimmt utilization statt used_percentage, Zahlen als Zeichenkette und begrenzt auf 0 bis 100', () => {
      const report = readStatusLine({
        rate_limits: {
          five_hour: { utilization: '38.5', resets_at: '1795780800' },
          seven_day: { used_percentage: 130, resets_at: 1795834800 },
          seven_day_opus: { used_percentage: -4 },
        },
      });

      expect(report.limits).toEqual({
        session: { usedPercent: 38.5, resetsAt: 1795780800_000 },
        week: { usedPercent: 100, resetsAt: 1795834800_000 },
        extra: [{ key: 'seven_day_opus', usedPercent: 0 }],
      });
    });

    it('übergeht null, fehlende und unbrauchbare Werte', () => {
      expect(
        readStatusLine({
          model: { id: null, display_name: '  ' },
          cost: { total_cost_usd: null },
          rate_limits: { five_hour: { used_percentage: null, resets_at: 1 }, seven_day: null, extra_usage: 'an' },
        }),
      ).toEqual({});
      expect(readStatusLine({ model: { id: 'claude-x' }, rate_limits: { five_hour: { used_percentage: 5, resets_at: 'bald' } } })).toEqual({
        modelId: 'claude-x',
        modelName: 'claude-x',
        limits: { session: { usedPercent: 5 }, extra: [] },
      });
      expect(readStatusLine(undefined)).toEqual({});
      expect(readStatusLine('Opus')).toEqual({});
    });

    it('liest ein Ausgabenlimit hinter einem Gateway mit Dollarbeträgen', () => {
      const report = readStatusLine({
        rate_limits: { spend_limit: { used_percentage: 42, resets_at: 1795834800, used_usd: 21, limit_usd: 50, period: 'monthly' } },
      });

      expect(report.limits).toEqual({
        extra: [{ key: 'spend_limit', usedPercent: 42, resetsAt: 1795834800_000, usedUsd: 21, limitUsd: 50 }],
      });
    });
  });

  describe('neuerer Stand eines Limits', () => {
    const at = 1_800_000_000_000;

    it.each([
      ['kein bisheriger', undefined, { usedPercent: 5, resetsAt: at }, 'gemeldet'],
      ['im selben Fenster mehr', { usedPercent: 40, resetsAt: at }, { usedPercent: 41, resetsAt: at + 1000 }, 'gemeldet'],
      ['im selben Fenster gleich viel', { usedPercent: 40, resetsAt: at }, { usedPercent: 40, resetsAt: at }, 'gemeldet'],
      ['im selben Fenster weniger (älterer Stand)', { usedPercent: 40, resetsAt: at }, { usedPercent: 30, resetsAt: at }, 'bisher'],
      ['späteres Fenster', { usedPercent: 90, resetsAt: at }, { usedPercent: 1, resetsAt: at + SAME_WINDOW_MS + 1 }, 'gemeldet'],
      ['früheres Fenster', { usedPercent: 10, resetsAt: at }, { usedPercent: 99, resetsAt: at - SAME_WINDOW_MS - 1 }, 'bisher'],
      ['ohne Reset', { usedPercent: 10, resetsAt: at }, { usedPercent: 5 }, 'gemeldet'],
    ] as const)('%s', (_label, stored, reported, winner) => {
      const result = newerLimit(stored, reported);
      expect(result).toBe(winner === 'gemeldet' ? reported : stored);
    });

    it('eine Meldung mit lauter älteren Ständen ändert nichts, eine mit einem neueren gilt mit allem', () => {
      const stored: AccountLimits = {
        session: { usedPercent: 40, resetsAt: at },
        week: { usedPercent: 20, resetsAt: at + 50 * HOUR },
        extra: [{ key: 'spend_limit', usedPercent: 5 }],
        reportedAt: 1,
        tabId: 'a',
        tabName: 'a',
      };
      const older: ReportedLimits = { session: { usedPercent: 30, resetsAt: at }, extra: [] };
      expect(mergeLimits(stored, older, { at: 2, tabId: 'b', tabName: 'b' })).toBeUndefined();

      const newer: ReportedLimits = { week: { usedPercent: 21, resetsAt: at + 50 * HOUR }, extra: [] };
      expect(mergeLimits(stored, newer, { at: 3, tabId: 'b', tabName: 'web' })).toEqual({
        session: { usedPercent: 40, resetsAt: at },
        week: { usedPercent: 21, resetsAt: at + 50 * HOUR },
        extra: [],
        reportedAt: 3,
        tabId: 'b',
        tabName: 'web',
      });
    });

    it('der gespeicherte Stand wird geprüft gelesen', () => {
      expect(normalizeAccountLimits(null)).toBeNull();
      expect(normalizeAccountLimits({ session: { usedPercent: 12, resetsAt: at }, reportedAt: 5, tabId: 't', tabName: 'n' })).toEqual({
        session: { usedPercent: 12, resetsAt: at },
        extra: [],
        reportedAt: 5,
        tabId: 't',
        tabName: 'n',
      });
    });
  });
});
