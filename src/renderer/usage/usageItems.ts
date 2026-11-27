// Verbrauchsbalken (Ticket 38): was die Zeile unten im Fenster und ihr Tooltip zeigen, als reine Funktionen ohne DOM.
// Die Zeit kommt von aussen (`now`, ms seit 1970); Uhrzeiten stehen in der Zeit dieses Rechners.

import { shownLimit } from '../../shared/usage';
import type { AccountLimits, TabUsage, UsageExtraLimit, UsageLimit } from '../../shared/types';

/** Segmente eines Mini-Balkens. */
export const SEGMENTS = 8;
/** Ab diesem Verbrauch ist ein Limit hervorgehoben (Farbe für Warnungen). */
export const WARN_PERCENT = 90;
/** Text ohne Angaben, gedämpft. */
export const NO_DATA_TEXT = 'Noch keine Angaben von Claude';
/** Hinweis im Tooltip, woher die Limits kommen. */
export const LIMITS_NOTE =
  'Die Limits stammen aus der letzten Antwort an Claude. Verbrauch an einem anderen Ort zeigt der Balken erst nach der nächsten Antwort.';

/**
 * Stufen für ein schmales Fenster, von voll bis knapp: Zuerst entfallen die Resets, dann die Mini-Balken, zuletzt die
 * Kosten („API“). Modell und Prozente bleiben immer. Reicht auch die letzte Stufe nicht, schneidet die Zeile ab, statt
 * umzubrechen.
 */
export const LEVELS = ['alles', 'ohne Resets', 'ohne Mini-Balken', 'ohne Kosten'] as const;
export type UsageBarLevel = 0 | 1 | 2 | 3;

/** Ein Eintrag der Zeile, von links nach rechts. */
export type UsageBarItem =
  /** Symbol des Claude-Tabs und, sobald bekannt, der Anzeigename des Modells. */
  | { kind: 'model'; name?: string }
  | {
      kind: 'limit';
      label: 'Session' | 'Woche';
      /** Gezeigter Verbrauch, gerundet, z.B. „38 %“; nach dem Reset „0 %“. */
      percent: string;
      /** Gefüllte Segmente des Mini-Balkens; fehlt, wenn die Stufe keine Mini-Balken zeigt. */
      segments?: number;
      /** „Reset 15:40“ bzw. „Reset Mo 09:00“; fehlt nach dem Reset, ohne bekannten Reset und auf knappen Stufen. */
      reset?: string;
      /** Hervorgehoben: ab 90 %. */
      warn: boolean;
      /** Gedämpft: Der Reset ist vorbei, bis Claude einen neuen Stand meldet. */
      expired: boolean;
    }
  /** Kosten der Session zum Listenpreis der API, z.B. „$4.12“. */
  | { kind: 'cost'; value: string }
  /** Gedämpfter Text ohne Angaben. */
  | { kind: 'note'; text: string };

/**
 * Die Zeile für den angezeigten Claude-Tab. Modell und Kosten kommen von ihm; hat er noch keine (frisch gestartet oder
 * pausiert), entfallen beide. Die Limits stehen da, sobald es irgendeinen Stand gibt; ohne Abo gibt es keinen, dann nur
 * Modell und Kosten. Ganz ohne Angaben der Stern und „Noch keine Angaben von Claude“.
 */
export function usageBarItems(
  tab: TabUsage | undefined,
  limits: AccountLimits | null,
  now: number,
  level: UsageBarLevel = 0,
): UsageBarItem[] {
  const items: UsageBarItem[] = [{ kind: 'model', name: tab?.modelName }];
  const session = limits?.session && limitItem('Session', limits.session, now, level);
  const week = limits?.week && limitItem('Woche', limits.week, now, level);
  const cost = tab?.costUsd !== undefined && level < 3 ? ({ kind: 'cost', value: formatCost(tab.costUsd) } as const) : undefined;
  if (!tab?.modelName && tab?.costUsd === undefined && !session && !week) {
    return [...items, { kind: 'note', text: NO_DATA_TEXT }];
  }
  if (session) items.push(session);
  if (cost) items.push(cost);
  if (week) items.push(week);
  return items;
}

function limitItem(label: 'Session' | 'Woche', limit: UsageLimit, now: number, level: UsageBarLevel): UsageBarItem {
  const shown = shownLimit(limit, now);
  const item: UsageBarItem = {
    kind: 'limit',
    label,
    percent: formatPercent(shown.percent),
    warn: !shown.expired && shown.percent >= WARN_PERCENT,
    expired: shown.expired,
  };
  if (level < 2) item.segments = filledSegments(shown.percent);
  if (level < 1 && !shown.expired && limit.resetsAt !== undefined) item.reset = `Reset ${formatTime(limit.resetsAt, now)}`;
  return item;
}

/**
 * Gefüllte Segmente eines Mini-Balkens mit 8 Segmenten: gerundet, aber mit Verbrauch über 0 % mindestens eines und unter
 * 100 % höchstens sieben, damit „etwas“ und „alles“ zu unterscheiden bleiben.
 */
export function filledSegments(percent: number): number {
  if (!(percent > 0)) return 0;
  if (percent >= 100) return SEGMENTS;
  return Math.min(SEGMENTS - 1, Math.max(1, Math.round((percent / 100) * SEGMENTS)));
}

/** Prozent gerundet, mit geschütztem Leerzeichen: „38 %“. */
export function formatPercent(percent: number): string {
  return `${Math.round(percent)} %`;
}

/** Kosten in US-Dollar mit zwei Nachkommastellen: „$4.12“. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Ein Zeitpunkt als Uhrzeit: „15:40“ am selben Tag wie `now`, sonst mit Wochentag („Mo 00:40“), auch über Mitternacht;
 * ab einer Woche Abstand mit Datum („3.12. 09:00“), damit kein Wochentag doppeldeutig ist.
 */
export function formatTime(at: number, now: number): string {
  const date = new Date(at);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const days = Math.abs(calendarDays(at, now));
  if (days === 0) return time;
  if (days < 7) return `${WEEKDAYS[date.getDay()]} ${time}`;
  return `${date.getDate()}.${date.getMonth() + 1}. ${time}`;
}

/** Tage zwischen den Kalendertagen von `now` und `at` (Zeit dieses Rechners), positiv, wenn `at` später ist. */
function calendarDays(at: number, now: number): number {
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((day(at) - day(now)) / 86_400_000);
}

/** Restzeit bis `at`: „noch 2 h 10 min“, „noch 45 min“, „noch 3 Tage 4 h“; vorbei „vorbei“. */
export function formatRemaining(at: number, now: number): string {
  const minutes = Math.ceil((at - now) / 60_000);
  if (minutes <= 0) return 'vorbei';
  if (minutes < 60) return `noch ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `noch ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  const days = Math.floor(hours / 24);
  return `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}${hours % 24 ? ` ${hours % 24} h` : ''}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Eine Zeile des Tooltips: Bezeichnung und Wert. */
export interface TooltipRow {
  label: string;
  value: string;
}

export interface UsageTooltip {
  rows: TooltipRow[];
  /** Hinweis unter den Zeilen, gedämpft. */
  note: string;
}

/** Bezeichnungen weiterer Limits, nach ihrem Schlüssel; unbekannte stehen mit ihrem Schlüssel da. */
const EXTRA_LABELS: Record<string, string> = {
  spend_limit: 'Ausgabenlimit',
  seven_day_opus: 'Woche Opus',
  seven_day_sonnet: 'Woche Sonnet',
  extra_usage: 'Zusatznutzung',
};

/**
 * Der Tooltip des Balkens: Modell-Kennung, Kosten, die Limits mit Restzeit bis zum Reset, weitere Limits, der Stand
 * („Stand 10:45 aus Tab „web““) und der Hinweis, woher die Limits kommen.
 * @param tabName Name des Tabs, aus dem der Stand kommt, wie er jetzt heisst; ohne ihn der gespeicherte
 */
export function usageTooltip(
  tab: TabUsage | undefined,
  limits: AccountLimits | null,
  now: number,
  tabName?: string,
): UsageTooltip {
  const rows: TooltipRow[] = [];
  if (tab?.modelId) rows.push({ label: 'Modell', value: tab.modelId });
  if (tab?.costUsd !== undefined) rows.push({ label: 'API', value: `${formatCost(tab.costUsd)} für diese Session` });
  if (!limits) {
    return { rows, note: rows.length > 0 ? 'Ohne Abo meldet Claude keine Limits.' : `${NO_DATA_TEXT}.` };
  }
  if (limits.session) rows.push({ label: 'Session', value: limitText(limits.session, now) });
  if (limits.week) rows.push({ label: 'Woche', value: limitText(limits.week, now) });
  for (const extra of limits.extra) rows.push({ label: EXTRA_LABELS[extra.key] ?? extra.key, value: extraText(extra, now) });
  const from = tabName || limits.tabName;
  rows.push({ label: 'Stand', value: `${formatTime(limits.reportedAt, now)}${from ? ` aus Tab „${from}“` : ''}` });
  return { rows, note: LIMITS_NOTE };
}

function limitText(limit: UsageLimit, now: number): string {
  const shown = shownLimit(limit, now);
  if (shown.expired) return `${formatPercent(0)} · zurückgesetzt, neuer Stand mit der nächsten Antwort`;
  if (limit.resetsAt === undefined) return formatPercent(shown.percent);
  return `${formatPercent(shown.percent)} · Reset ${formatTime(limit.resetsAt, now)}, ${formatRemaining(limit.resetsAt, now)}`;
}

function extraText(extra: UsageExtraLimit, now: number): string {
  const text = limitText(extra, now);
  if (extra.usedUsd === undefined || extra.limitUsd === undefined) return text;
  return `${text} (${formatCost(extra.usedUsd)} von ${formatCost(extra.limitUsd)})`;
}

/** Die erste Stufe, deren Zeile in die verfügbare Breite passt; passt keine, die knappste. */
export function fitLevel(widths: readonly number[], available: number): UsageBarLevel {
  const index = widths.findIndex((w) => w <= available);
  return Math.max(0, index < 0 ? widths.length - 1 : index) as UsageBarLevel;
}
