// Verbrauchsbalken (Ticket 38): reine Regeln zum JSON der Statuszeile von Claude Code. Der Kern wendet sie an.
// Befunde der Messung in docs/spikes/claude-hooks.md, Abschnitt „Statuszeile (Ticket 38)“.
//
// - Pro Claude-Tab: Modell und Kosten der Session aus der letzten Meldung.
// - Für das Konto: Session- und Wochenlimit samt Reset, weitere Limits für den Tooltip. Claude kennt sie aus der letzten
//   Antwort der API und schickt sie bei jeder Meldung mit, auch nach einer neuen Grösse des Terminals Stunden später.
//   Darum gewinnt nicht einfach die zuletzt angekommene Meldung, sondern pro Limit der neuere Stand: ein späterer Reset
//   (neues Fenster), im selben Fenster der höhere Verbrauch.
// - Gelesen wird tolerant: Unbrauchbares fällt weg, nie ein Fehler.

import type { AccountLimits, TabUsage, UsageExtraLimit, UsageLimit } from '../../shared/types';

/** Was eine Meldung der Statuszeile über die Limits des Kontos sagt. */
export interface ReportedLimits {
  session?: UsageLimit;
  week?: UsageLimit;
  extra: UsageExtraLimit[];
}

/** Was in einer Meldung der Statuszeile für den Balken zählt. */
export interface StatusLineReport {
  modelId?: string;
  modelName?: string;
  costUsd?: number;
  /** Fehlt ohne `rate_limits` (ohne Abo, oder vor der ersten Antwort der API) und wenn kein Limit brauchbar ist. */
  limits?: ReportedLimits;
}

/** Woher ein Stand der Limits kommt. */
export interface LimitsSource {
  /** Zeitpunkt der Meldung (Uhr des Kerns), ms seit 1970. */
  at: number;
  tabId: string;
  tabName: string;
}

/**
 * Zwei Resets, die so nahe beieinander liegen, gehören zum selben Fenster. Gemessen meldet Claude für ein Fenster
 * immer denselben Zeitpunkt (volle Stunde); ein neues Fenster beginnt frühestens mit dem Ende des alten.
 */
export const SAME_WINDOW_MS = 10 * 60_000;

/** Schlüssel des Session- und des Wochenlimits in `rate_limits`. */
const SESSION_KEY = 'five_hour';
const WEEK_KEY = 'seven_day';

/** Liest eine Meldung der Statuszeile. */
export function readStatusLine(payload: unknown): StatusLineReport {
  const p = isRecord(payload) ? payload : {};
  const report: StatusLineReport = {};
  const model = isRecord(p.model) ? p.model : {};
  const modelId = text(model.id);
  const modelName = text(model.display_name) ?? modelId;
  if (modelId !== undefined) report.modelId = modelId;
  if (modelName !== undefined) report.modelName = modelName;
  const cost = isRecord(p.cost) ? number(p.cost.total_cost_usd) : undefined;
  if (cost !== undefined && cost >= 0) report.costUsd = cost;
  const limits = readLimits(p.rate_limits);
  if (limits) report.limits = limits;
  return report;
}

/** Die Limits aus `rate_limits`; `undefined`, wenn keines brauchbar ist. */
function readLimits(raw: unknown): ReportedLimits | undefined {
  if (!isRecord(raw)) return undefined;
  const limits: ReportedLimits = { extra: [] };
  for (const [key, value] of Object.entries(raw)) {
    const limit = readLimit(value);
    if (!limit) continue;
    if (key === SESSION_KEY) limits.session = limit;
    else if (key === WEEK_KEY) limits.week = limit;
    else limits.extra.push(readExtra(key, value as Record<string, unknown>, limit));
  }
  return limits.session || limits.week || limits.extra.length > 0 ? limits : undefined;
}

/**
 * Ein Limit: `used_percentage` (in manchen Versionen `utilization`), als Zahl oder Zeichenkette, auf 0 bis 100
 * begrenzt; `resets_at` in Sekunden seit 1970. Ohne brauchbaren Anteil keines.
 */
function readLimit(raw: unknown): UsageLimit | undefined {
  if (!isRecord(raw)) return undefined;
  const percent = number(raw.used_percentage) ?? number(raw.utilization);
  if (percent === undefined) return undefined;
  const limit: UsageLimit = { usedPercent: Math.min(100, Math.max(0, percent)) };
  const resetsAt = number(raw.resets_at);
  if (resetsAt !== undefined && resetsAt > 0) limit.resetsAt = Math.round(resetsAt * 1000);
  return limit;
}

function readExtra(key: string, raw: Record<string, unknown>, limit: UsageLimit): UsageExtraLimit {
  const extra: UsageExtraLimit = { key, ...limit };
  const usedUsd = number(raw.used_usd);
  const limitUsd = number(raw.limit_usd);
  if (usedUsd !== undefined && limitUsd !== undefined) {
    extra.usedUsd = usedUsd;
    extra.limitUsd = limitUsd;
  }
  return extra;
}

/**
 * Modell und Kosten eines Claude-Tabs nach einer Meldung: Was sie brauchbar mitbringt, ersetzt den bisherigen Wert; was
 * fehlt, bleibt. Liefert den bisherigen Stand (dasselbe Objekt), wenn sich nichts ändert.
 */
export function nextTabUsage(previous: TabUsage | undefined, report: StatusLineReport): TabUsage | undefined {
  const next: TabUsage = { ...previous };
  if (report.modelId !== undefined) next.modelId = report.modelId;
  if (report.modelName !== undefined) next.modelName = report.modelName;
  if (report.costUsd !== undefined) next.costUsd = report.costUsd;
  if (Object.keys(next).length === 0) return previous;
  if (
    previous &&
    previous.modelId === next.modelId &&
    previous.modelName === next.modelName &&
    previous.costUsd === next.costUsd
  ) {
    return previous;
  }
  return next;
}

/**
 * Der Stand der Limits nach einer Meldung; `undefined`, wenn die Meldung nichts Neueres bringt und der bisherige Stand
 * bleibt. Pro Limit gilt der neuere Stand (`newerLimit`). Bringt die Meldung bei mindestens einem Limit den neueren oder
 * einen gleichen Stand, gilt sie: Zeitpunkt und Tab des Stands sind dann ihre, ihre weiteren Limits ersetzen die
 * bisherigen, und ein Limit, das ihr fehlt, bleibt (etwa die Session nach ihrem Reset, die Claude bis zur nächsten
 * Antwort weglässt). Eine Meldung mit lauter älteren Ständen (aus einem Tab, dessen letzte Antwort länger zurückliegt)
 * ändert nichts.
 */
export function mergeLimits(
  stored: AccountLimits | undefined,
  reported: ReportedLimits,
  source: LimitsSource,
): AccountLimits | undefined {
  const session = newerLimit(stored?.session, reported.session);
  const week = newerLimit(stored?.week, reported.week);
  const accepted =
    !stored ||
    (reported.session !== undefined && session === reported.session) ||
    (reported.week !== undefined && week === reported.week) ||
    (reported.session === undefined && reported.week === undefined && reported.extra.length > 0);
  if (!accepted) return undefined;
  const next: AccountLimits = {
    extra: reported.extra.map((e) => ({ ...e })),
    reportedAt: source.at,
    tabId: source.tabId,
    tabName: source.tabName,
  };
  if (session) next.session = { ...session };
  if (week) next.week = { ...week };
  return next;
}

/**
 * Welcher von zwei Ständen eines Limits der neuere ist; bei Gleichstand der gemeldete (`reported`, dasselbe Objekt).
 * - Ein späterer Reset ist ein neues Fenster: Er gewinnt.
 * - Im selben Fenster (Resets höchstens `SAME_WINDOW_MS` auseinander) gewinnt der höhere Verbrauch; er sinkt in einem
 *   Fenster nie.
 * - Fehlt einem der beiden der Reset, gewinnt der gemeldete.
 */
export function newerLimit(stored: UsageLimit | undefined, reported: UsageLimit | undefined): UsageLimit | undefined {
  if (!reported) return stored;
  if (!stored || stored.resetsAt === undefined || reported.resetsAt === undefined) return reported;
  if (Math.abs(reported.resetsAt - stored.resetsAt) <= SAME_WINDOW_MS) {
    return reported.usedPercent >= stored.usedPercent ? reported : stored;
  }
  return reported.resetsAt > stored.resetsAt ? reported : stored;
}

/** Der gespeicherte Stand der Limits, tolerant gelesen; ohne brauchbares Limit keiner (`null`). */
export function normalizeAccountLimits(raw: unknown): AccountLimits | null {
  if (!isRecord(raw)) return null;
  const session = normalizeLimit(raw.session);
  const week = normalizeLimit(raw.week);
  const extra: UsageExtraLimit[] = [];
  for (const item of Array.isArray(raw.extra) ? raw.extra : []) {
    if (!isRecord(item) || text(item.key) === undefined) continue;
    const limit = normalizeLimit(item);
    if (!limit) continue;
    const entry: UsageExtraLimit = { key: item.key as string, ...limit };
    if (isFiniteNumber(item.usedUsd) && isFiniteNumber(item.limitUsd)) {
      entry.usedUsd = item.usedUsd;
      entry.limitUsd = item.limitUsd;
    }
    extra.push(entry);
  }
  if (!session && !week && extra.length === 0) return null;
  const limits: AccountLimits = {
    extra,
    reportedAt: isFiniteNumber(raw.reportedAt) ? raw.reportedAt : 0,
    tabId: typeof raw.tabId === 'string' ? raw.tabId : '',
    tabName: typeof raw.tabName === 'string' ? raw.tabName : '',
  };
  if (session) limits.session = session;
  if (week) limits.week = week;
  return limits;
}

function normalizeLimit(raw: unknown): UsageLimit | undefined {
  if (!isRecord(raw) || !isFiniteNumber(raw.usedPercent)) return undefined;
  const limit: UsageLimit = { usedPercent: Math.min(100, Math.max(0, raw.usedPercent)) };
  if (isFiniteNumber(raw.resetsAt) && raw.resetsAt > 0) limit.resetsAt = raw.resetsAt;
  return limit;
}

/** Eine endliche Zahl, auch aus einer Zeichenkette wie "38" oder "38.5"; sonst `undefined`. */
function number(value: unknown): number | undefined {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
