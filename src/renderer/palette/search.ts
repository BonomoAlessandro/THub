// Unscharfe Suche der Befehlspalette. Rein rechnerisch, ohne DOM, damit sie sich prüfen lässt.

/** Punkte je gefundenem Zeichen der Suche. */
const CHAR_POINTS = 1;
/** Zusatz, wenn das Zeichen direkt auf das vorherige gefundene folgt: „term“ in „Terminal“ schlägt „t…e…r…m“. */
const RUN_BONUS = 2;
/** Zusatz, wenn das Zeichen ein Wort beginnt: „nt“ passt besser zu „Neues Terminal“ als zu „Konto“. */
const WORD_START_BONUS = 2;
/** Abzug je Zeichen des Textes: Bei sonst gleichem Treffer geht der kürzere Text vor. */
const LENGTH_PENALTY = 0.02;
/** Abzug, wenn erst der Zusatz (etwa der Ordner eines Tabs) den Treffer bringt: Ein Treffer im Namen geht vor. */
const DETAIL_PENALTY = 2;
/** Vom Zusatz zählen nur so viele letzte Teile eines Pfads: Ein langer Pfad passte sonst zu fast jeder kurzen Suche. */
const DETAIL_SEGMENTS = 2;

/** Zeichen, nach denen ein neues Wort beginnt, z.B. in „api-gateway“ oder „C:\dev\web“. */
const WORD_SEPARATOR = /[\s\-_\\/.:,]/;

/**
 * Wie gut die Suche zum Text passt; `null`, wenn sie nicht passt. Die Zeichen der Suche müssen in dieser Reihenfolge
 * im Text vorkommen, nicht unbedingt nebeneinander; Gross- und Kleinschreibung und Leerzeichen der Suche zählen nicht.
 * So findet „termhb“ „termhub“ und „neu term“ „Neues Terminal“. Je mehr Zeichen nebeneinander und an Wortanfängen
 * liegen, desto besser. Eine leere Suche passt zu allem gleich gut.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return 0;
  const lower = text.toLowerCase();
  let best: number | null = null;
  // Jeder Fundort des ersten Zeichens ist ein möglicher Anfang; von dort aus wird gierig weitergesucht.
  for (let start = lower.indexOf(q[0]); start >= 0; start = lower.indexOf(q[0], start + 1)) {
    const score = scoreFrom(q, text, lower, start);
    // Passt die Suche ab hier nicht mehr, dann auch ab keinem späteren Anfang.
    if (score === null) break;
    if (best === null || score > best) best = score;
  }
  return best === null ? null : best - text.length * LENGTH_PENALTY;
}

/** Punkte, wenn die Suche ab `start` gierig im Text gefunden wird; `null`, wenn nicht alle Zeichen vorkommen. */
function scoreFrom(q: string, text: string, lower: string, start: number): number | null {
  let score = 0;
  let previous = -2;
  let at = start;
  for (const ch of q) {
    const i = lower.indexOf(ch, at);
    if (i < 0) return null;
    score += CHAR_POINTS + (i === previous + 1 ? RUN_BONUS : 0) + (isWordStart(text, i) ? WORD_START_BONUS : 0);
    previous = i;
    at = i + 1;
  }
  return score;
}

/** Ob an dieser Stelle ein Wort beginnt: am Anfang, nach einem Trennzeichen oder als Grossbuchstabe nach einem kleinen. */
function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const before = text[i - 1];
  if (WORD_SEPARATOR.test(before)) return true;
  const ch = text[i];
  return ch !== ch.toLowerCase() && before === before.toLowerCase() && before !== before.toUpperCase();
}

/** Ein Eintrag, den die Suche findet: Name und, bei einem Tab, sein Ordner. */
export interface Searchable {
  label: string;
  /** Zusatz, der auch gefunden wird, aber weniger zählt als der Name; bei einem Pfad nur seine letzten zwei Teile. */
  detail?: string;
}

/** Eine Gruppe von Einträgen, z.B. „Tabs“ oder „Befehle“. */
export interface SearchGroup<T extends Searchable> {
  title: string;
  items: T[];
}

/** Wie gut die Suche zu einem Eintrag passt: zum Namen, oder schwächer zu Name und Zusatz zusammen. */
export function itemScore(query: string, item: Searchable): number | null {
  const label = fuzzyScore(query, item.label);
  if (!item.detail) return label;
  const tail = item.detail.split(/[\\/]+/).filter(Boolean).slice(-DETAIL_SEGMENTS).join('\\');
  const withDetail = fuzzyScore(query, `${item.label} ${tail}`);
  if (withDetail === null) return label;
  return Math.max(label ?? -Infinity, withDetail - DETAIL_PENALTY);
}

/**
 * Filtert und ordnet die Gruppen nach der Suche. Ohne Suche bleibt alles, wie es ist. Mit Suche bleiben nur die
 * passenden Einträge, der beste zuerst; die Gruppe mit dem besten Treffer steht oben, damit Enter ihn ausführt. Bei
 * gleich gutem Treffer bleibt die ursprüngliche Reihenfolge, bei der Palette also Tabs vor Befehlen. Leere Gruppen fallen
 * weg.
 */
export function searchGroups<T extends Searchable>(query: string, groups: SearchGroup<T>[]): SearchGroup<T>[] {
  if (!query.trim()) return groups.filter((g) => g.items.length > 0);
  return groups
    .map((group, order) => {
      const items = group.items
        .map((item, index) => ({ item, index, score: itemScore(query, item) }))
        .filter((x): x is { item: T; index: number; score: number } => x.score !== null)
        .sort((a, b) => b.score - a.score || a.index - b.index);
      return { group, order, items, best: items.length > 0 ? items[0].score : -Infinity };
    })
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.best - a.best || a.order - b.order)
    .map(({ group, items }) => ({ ...group, items: items.map((x) => x.item) }));
}
