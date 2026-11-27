import { describe, expect, it } from 'vitest';
import {
  LIMITS_NOTE,
  NO_DATA_TEXT,
  filledSegments,
  fitLevel,
  formatCost,
  formatRemaining,
  formatTime,
  usageBarItems,
  usageTooltip,
  type UsageBarItem,
} from '../../src/renderer/usage/usageItems';
import type { AccountLimits, TabUsage } from '../../src/shared/types';

// Verbrauchsbalken (Ticket 38): was die Zeile und ihr Tooltip zeigen. Die Zeiten stehen in der Zeit des Rechners, auf
// dem die Tests laufen; deshalb entstehen sie hier aus lokalen Kalenderangaben.

/** Freitag, 27. November 2026, 13:30 Uhr (lokale Zeit). */
const NOW = new Date(2026, 10, 27, 13, 30).getTime();
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes).getTime();
const NBSP = ' ';

const OPUS: TabUsage = { modelId: 'claude-opus-5-5', modelName: 'Opus 5.5', costUsd: 4.1234 };
const LIMITS: AccountLimits = {
  session: { usedPercent: 38, resetsAt: at(27, 15, 40) },
  week: { usedPercent: 21.4, resetsAt: at(30, 9, 0) },
  extra: [],
  reportedAt: at(27, 13, 12),
  tabId: 'tab-1',
  tabName: 'api',
};

/** Die Zeile als Text, wie man sie liest; Mini-Balken als ▰▱. */
function line(items: UsageBarItem[]): string {
  return items
    .map((item) => {
      switch (item.kind) {
        case 'model':
          return `✱${item.name ? ` ${item.name}` : ''}`;
        case 'limit': {
          const bar = item.segments === undefined ? '' : ` ${'▰'.repeat(item.segments)}${'▱'.repeat(8 - item.segments)}`;
          const flags = `${item.warn ? ' [Warnung]' : ''}${item.expired ? ' [gedämpft]' : ''}`;
          return `${item.label}${bar} ${item.percent}${item.reset ? `  ${item.reset}` : ''}${flags}`;
        }
        case 'cost':
          return `API ${item.value}`;
        case 'note':
          return item.text;
      }
    })
    .join(' │ ')
    .replaceAll(NBSP, ' ');
}

describe('Verbrauchsbalken (Ticket 38): Zeile', () => {
  it('zeigt Modell, Session mit Reset, Kosten und Woche mit Reset, wie im Ticket', () => {
    expect(line(usageBarItems(OPUS, LIMITS, NOW))).toBe(
      '✱ Opus 5.5 │ Session ▰▰▰▱▱▱▱▱ 38 %  Reset 15:40 │ API $4.12 │ Woche ▰▰▱▱▱▱▱▱ 21 %  Reset Mo 09:00',
    );
  });

  describe('Reset als Uhrzeit', () => {
    it.each([
      ['am selben Tag', at(27, 15, 40), '15:40'],
      ['am selben Tag kurz vor Mitternacht', at(27, 23, 59), '23:59'],
      ['über Mitternacht am nächsten Tag', at(28, 0, 40), 'Sa 00:40'],
      ['an einem anderen Tag', at(30, 9, 0), 'Mo 09:00'],
      ['in sechs Tagen', at(3 + 30, 8, 5), 'Do 08:05'],
      ['ab einer Woche mit Datum', at(4 + 30, 9, 0), '4.12. 09:00'],
    ])('%s', (_label, time, text) => {
      expect(formatTime(time, NOW)).toBe(text);
    });

    it('über Mitternacht gesehen: kurz vor Mitternacht steht der Wochentag, danach nur noch die Uhrzeit', () => {
      const reset = at(28, 0, 40);

      expect(formatTime(reset, at(27, 23, 50))).toBe('Sa 00:40');
      expect(formatTime(reset, at(28, 0, 1))).toBe('00:40');
    });
  });

  describe('Mini-Balken mit 8 Segmenten', () => {
    it.each([
      [0, 0],
      [0.4, 1],
      [21, 2],
      [38, 3],
      [50, 4],
      [90, 7],
      [99.6, 7],
      [100, 8],
    ])('%s %% füllt %s Segmente', (percent, filled) => {
      expect(filledSegments(percent)).toBe(filled);
    });

    it('ab 90 % ist das Limit hervorgehoben', () => {
      const items = usageBarItems(OPUS, { ...LIMITS, session: { usedPercent: 90, resetsAt: at(27, 15, 40) } }, NOW);

      expect(line(items)).toContain('Session ▰▰▰▰▰▰▰▱ 90 %  Reset 15:40 [Warnung]');
      expect(line(usageBarItems(OPUS, { ...LIMITS, week: { usedPercent: 100 } }, NOW))).toContain(
        'Woche ▰▰▰▰▰▰▰▰ 100 % [Warnung]',
      );
      expect(line(usageBarItems(OPUS, { ...LIMITS, session: { usedPercent: 89.4 } }, NOW))).not.toContain('[Warnung]');
    });

    it('nach dem Reset 0 %, gedämpft und ohne Reset, nicht hervorgehoben', () => {
      const expired = { ...LIMITS, session: { usedPercent: 97, resetsAt: at(27, 13, 0) } };

      expect(line(usageBarItems(OPUS, expired, NOW))).toContain('Session ▱▱▱▱▱▱▱▱ 0 % [gedämpft]');
    });
  });

  it('Kosten mit zwei Nachkommastellen', () => {
    expect(formatCost(4.1234)).toBe('$4.12');
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(0.015)).toBe('$0.01');
    expect(formatCost(12.5)).toBe('$12.50');
    expect(formatCost(1234.567)).toBe('$1234.57');
  });

  describe('schmales Fenster', () => {
    it('zuerst entfallen die Resets, dann die Mini-Balken, zuletzt die Kosten; Modell und Prozente bleiben', () => {
      expect([1, 2, 3].map((level) => line(usageBarItems(OPUS, LIMITS, NOW, level as 1 | 2 | 3)))).toEqual([
        '✱ Opus 5.5 │ Session ▰▰▰▱▱▱▱▱ 38 % │ API $4.12 │ Woche ▰▰▱▱▱▱▱▱ 21 %',
        '✱ Opus 5.5 │ Session 38 % │ API $4.12 │ Woche 21 %',
        '✱ Opus 5.5 │ Session 38 % │ Woche 21 %',
      ]);
    });

    it('nimmt die erste Stufe, die passt; passt keine, die knappste', () => {
      const widths = [620, 520, 430, 360];

      expect(fitLevel(widths, 900)).toBe(0);
      expect(fitLevel(widths, 620)).toBe(0);
      expect(fitLevel(widths, 619)).toBe(1);
      expect(fitLevel(widths, 450)).toBe(2);
      expect(fitLevel(widths, 400)).toBe(3);
      expect(fitLevel(widths, 100)).toBe(3);
    });
  });

  describe('ohne Daten', () => {
    it('ganz ohne Angaben: gedämpft „Noch keine Angaben von Claude“', () => {
      expect(usageBarItems(undefined, null, NOW)).toEqual([{ kind: 'model' }, { kind: 'note', text: NO_DATA_TEXT }]);
      expect(line(usageBarItems(undefined, null, NOW))).toBe('✱ │ Noch keine Angaben von Claude');
    });

    it('ohne Abo (keine Limits): nur Modell und Kosten', () => {
      expect(line(usageBarItems(OPUS, null, NOW))).toBe('✱ Opus 5.5 │ API $4.12');
    });

    it('ein Claude-Tab ohne eigene Meldung (frisch gestartet, pausiert): die Limits, aber weder Modell noch Kosten', () => {
      expect(line(usageBarItems(undefined, LIMITS, NOW))).toBe(
        '✱ │ Session ▰▰▰▱▱▱▱▱ 38 %  Reset 15:40 │ Woche ▰▰▱▱▱▱▱▱ 21 %  Reset Mo 09:00',
      );
    });
  });
});

describe('Verbrauchsbalken (Ticket 38): Tooltip', () => {
  it('nennt Modell-Kennung, Restzeit bis zu jedem Reset, den Stand und woher die Limits kommen', () => {
    const tooltip = usageTooltip(OPUS, LIMITS, NOW, 'api neu');

    expect(tooltip.rows.map((r) => `${r.label}: ${r.value}`.replaceAll(NBSP, ' '))).toEqual([
      'Modell: claude-opus-5-5',
      'API: $4.12 für diese Session',
      'Session: 38 % · Reset 15:40, noch 2 h 10 min',
      'Woche: 21 % · Reset Mo 09:00, noch 2 Tage 19 h',
      'Stand: 13:12 aus Tab „api neu“',
    ]);
    expect(tooltip.note).toBe(LIMITS_NOTE);
  });

  it('weitere Limits und ein Ausgabenlimit, ein abgelaufener Reset, der gespeicherte Name des Tabs', () => {
    const limits: AccountLimits = {
      ...LIMITS,
      session: { usedPercent: 97, resetsAt: at(27, 13, 0) },
      extra: [
        { key: 'seven_day_opus', usedPercent: 12, resetsAt: at(30, 9, 0) },
        { key: 'spend_limit', usedPercent: 42, usedUsd: 21, limitUsd: 50 },
        { key: 'neu_unbekannt', usedPercent: 5 },
      ],
    };

    const rows = usageTooltip(undefined, limits, NOW).rows.map((r) => `${r.label}: ${r.value}`.replaceAll(NBSP, ' '));

    expect(rows).toEqual([
      'Session: 0 % · zurückgesetzt, neuer Stand mit der nächsten Antwort',
      'Woche: 21 % · Reset Mo 09:00, noch 2 Tage 19 h',
      'Woche Opus: 12 % · Reset Mo 09:00, noch 2 Tage 19 h',
      'Ausgabenlimit: 42 % ($21.00 von $50.00)',
      'neu_unbekannt: 5 %',
      'Stand: 13:12 aus Tab „api“',
    ]);
  });

  it('ohne Angaben bzw. ohne Abo erklärt er, was fehlt', () => {
    expect(usageTooltip(undefined, null, NOW)).toEqual({ rows: [], note: 'Noch keine Angaben von Claude.' });
    expect(usageTooltip(OPUS, null, NOW).note).toBe('Ohne Abo meldet Claude keine Limits.');
  });

  it.each([
    [at(27, 13, 30) + 30_000, 'noch 1 min'],
    [at(27, 14, 15), 'noch 45 min'],
    [at(27, 15, 30), 'noch 2 h'],
    [at(28, 14, 0), 'noch 1 Tag'],
    [at(27, 13, 30), 'vorbei'],
  ])('Restzeit bis %s: %s', (time, text) => {
    expect(formatRemaining(time, NOW)).toBe(text);
  });
});
