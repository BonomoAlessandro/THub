// Offene Punkte aus Claudes Antworten (Tickets 22 und 27): die Anweisung, die THub Claude bei jedem SessionStart als
// zusätzlichen Kontext mitgibt, und die Erkennung der offenen Punkte am Ende einer Antwort (`Stop`,
// `last_assistant_message`), als reine Regeln nach dem Abschnitt „Offene Punkte aus Claudes Antworten“ der
// Spezifikation. Ob ein Hinweis erscheint, entscheidet der Workspace-Kern.

/**
 * Wortlaut der Anweisung an Claude, genau wie in der Spezifikation. Offene Punkte sind die Ausnahme (Ticket 27): Claude
 * soll den Abschnitt nicht mit Angeboten, Vorschlägen oder Erfundenem füllen.
 */
export const OPEN_POINTS_INSTRUCTION =
  'Hinweis von THub: Nur wenn du für den nächsten Schritt eine Entscheidung, Antwort oder Handlung des Nutzers ' +
  'brauchst, die du nicht selbst treffen oder erledigen kannst, schreibe sie am Ende der Antwort unter der Überschrift ' +
  '‚Offene Punkte‘ als kurze Aufzählung, ein Punkt pro Zeile. Das ist die Ausnahme: Die meisten Antworten haben keine ' +
  'offenen Punkte, dann lass den Abschnitt weg. Keine Angebote für weitere Arbeit, keine Vorschläge, keine ' +
  'Zusammenfassung und nichts erfinden, nur um den Abschnitt zu füllen.';

/**
 * Antwort auf `SessionStart` bei eingeschalteter Einstellung: Claude Code liest die Ausgabe des Befehls-Hooks als JSON
 * und nimmt `additionalContext` in den Kontext der Session.
 */
export function openPointsContext(): object {
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: OPEN_POINTS_INSTRUCTION } };
}

/** Höchstens so viele Punkte werden übernommen und gespeichert. */
export const MAX_OPEN_POINTS = 20;
/** Längere Punkte werden mit „…“ gekürzt; der Hinweis zeigt ohnehin nur zwei Zeilen. */
export const MAX_POINT_LENGTH = 300;

/**
 * Überschriften offener Punkte, am Anfang der Überschrift und als ganze Wörter. Dazu „Noch offene Punkte/Fragen“, die
 * gebeugte Form von „Noch offen“.
 */
const HEADING = new RegExp(
  '^(?:(?:noch\\s+)?offene\\s+(?:punkte|fragen)|noch\\s+offen|fragen\\s+an\\s+dich|zu\\s+klären|open\\s+(?:points|questions))' +
    '(?![\\p{L}\\p{N}])',
  'iu',
);
/** Aufzählungspunkt: Einrückung, Zeichen (`-`, `*`, `+`, `•`, `1.`, `1)`), Text. */
const LIST_ITEM = /^(\s*)(?:[-*+•]|\d{1,3}[.)])\s+(.*)$/;
/** Trennlinie (`---`, `***`, `___`); beendet eine Aufzählung. */
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
/** Markdown-Überschrift (`#` bis `######`). */
const ATX_HEADING = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
/** Ganze Zeile fett, mit oder ohne Doppelpunkt (`**Offene Punkte**`, `**Offene Punkte:**`, `__…__:`). */
const BOLD_LINE = /^\s*(\*\*|__)(.+?)\1\s*[:：]?\s*$/;
/** Unterstreichung einer Setext-Überschrift (`===` bzw. `---` unter der Zeile). */
const SETEXT_UNDERLINE = /^\s{0,3}(?:=+|-+)\s*$/;

/** Eine Zeile der Antwort; `code`: gehört zu einem Code-Block (auch die Zäune selbst). */
interface Line {
  text: string;
  code: boolean;
}

/**
 * Die offenen Punkte am Ende einer Antwort von Claude, bereinigt (ohne Aufzählungszeichen und Markdown-Hervorhebung),
 * höchstens `MAX_OPEN_POINTS`; leer, wenn es keine gibt.
 *
 * Es zählt nur der ausdrückliche Abschnitt: eine Überschrift „Offene Punkte“, „Offene Fragen“, „Noch offen“, „Fragen an
 * dich“, „Zu klären“, „Open points“ oder „Open questions“ (Markdown-Überschrift, fette Zeile oder Zeile mit
 * Doppelpunkt), und die Aufzählungspunkte darunter sind die offenen Punkte. Unterpunkte gehören zu ihrem Punkt und
 * zählen nicht einzeln. Mehrere solche Abschnitte zählen zusammen. Eine Überschrift ohne Aufzählung darunter ergibt
 * keine Punkte, und eine Frage am Ende der Antwort („Soll ich auch noch …?“) zählt nicht (Ticket 27).
 *
 * Inhalt von Code-Blöcken zählt nie.
 */
export function findOpenPoints(message: string | undefined): string[] {
  if (!message) return [];
  return pointsUnderHeadings(splitLines(message))
    .map(cleanPoint)
    .filter((p) => p !== '')
    .slice(0, MAX_OPEN_POINTS);
}

/** Zeilen der Antwort mit der Angabe, welche zu einem umzäunten Code-Block gehören (```` ``` ```` oder `~~~`). */
function splitLines(message: string): Line[] {
  const lines: Line[] = [];
  let fence: { char: string; length: number } | null = null;
  for (const text of message.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text);
    if (fence) {
      lines.push({ text, code: true });
      // Ein Zaun schliesst mit denselben Zeichen, mindestens so vielen, und nichts dahinter.
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && text.trim() === marker[1]) {
        fence = null;
      }
    } else if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      lines.push({ text, code: true });
    } else lines.push({ text, code: false });
  }
  return lines;
}

/** Die Punkte unter allen Überschriften offener Punkte, in der Reihenfolge der Antwort. */
function pointsUnderHeadings(lines: Line[]): string[] {
  const points: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = openPointsHeading(lines, i);
    if (heading === 0) continue;
    const { items, end } = listAfter(lines, i + heading);
    points.push(...items);
    i = end - 1;
  }
  return points;
}

/** Wie viele Zeilen ab `i` eine Überschrift offener Punkte bilden: 0 (keine), 1, oder 2 bei einer Setext-Überschrift. */
function openPointsHeading(lines: Line[], i: number): number {
  const line = lines[i];
  const text = line.text.trim();
  if (line.code || text === '') return 0;
  const atx = ATX_HEADING.exec(line.text);
  if (atx) return isOpenPointsTitle(atx[1]) ? 1 : 0;
  const bold = BOLD_LINE.exec(line.text);
  if (bold) return isOpenPointsTitle(bold[2]) ? 1 : 0;
  const next = lines[i + 1];
  if (next && !next.code && SETEXT_UNDERLINE.test(next.text) && !LIST_ITEM.test(line.text)) {
    return isOpenPointsTitle(text) ? 2 : 0;
  }
  if (/[:：]$/.test(text)) return isOpenPointsTitle(text) ? 1 : 0;
  return 0;
}

/**
 * Ob der Text einer Überschrift eine der Überschriften offener Punkte ist. Hervorhebung, ein Doppelpunkt am Ende und
 * alles vor dem ersten Buchstaben (Emoji, Nummerierung wie „3.“, Aufzählungszeichen) zählen nicht.
 */
function isOpenPointsTitle(title: string): boolean {
  const plain = title
    .replace(/[*_`]/g, '')
    .trim()
    .replace(/[:：]$/, '')
    .replace(/^[^\p{L}]+/u, '');
  return HEADING.test(plain);
}

/**
 * Die Aufzählung, die direkt (nach Leerzeilen) ab Zeile `start` steht: ihre Punkte der obersten Ebene, mit
 * Fortsetzungszeilen, und die Zeile, an der sie endet. Unterpunkte und eingerückte Code-Blöcke gehören zum Punkt und
 * werden übergangen. Die Aufzählung endet an einem Absatz nach einer Leerzeile, an einer Überschrift, einer
 * Trennlinie oder einem nicht eingerückten Code-Block.
 */
function listAfter(lines: Line[], start: number): { items: string[]; end: number } {
  const items: string[][] = [];
  /** Einrückung der Punkte der obersten Ebene; steht mit dem ersten Punkt fest. */
  let base: number | undefined;
  /** Die letzte Zeile gehört zu einem Unterpunkt (oder einem Code-Block darin); Fortsetzungen zählen dann nicht. */
  let inSub = false;
  let blank = false;
  let i = start;
  for (; i < lines.length; i++) {
    const { text, code } = lines[i];
    if (code) {
      // Ein Code-Block unter einem Punkt (eingerückt) gehört zum Punkt; sonst endet die Aufzählung.
      if (base === undefined || indentOf(text) <= base) break;
      inSub = true;
      continue;
    }
    if (text.trim() === '') {
      blank = true;
      continue;
    }
    if (RULE.test(text) || openPointsHeading(lines, i) > 0 || isHeadingLine(lines[i])) break;
    const item = LIST_ITEM.exec(text);
    const indent = indentOf(text);
    if (item) {
      base ??= indent;
      if (indent <= base) {
        items.push([item[2]]);
        inSub = false;
      } else inSub = true;
      blank = false;
      continue;
    }
    // Keine Aufzählung direkt unter der Überschrift: Dann gibt es hier keine Punkte.
    if (base === undefined) break;
    // Ohne Leerzeile davor setzt die Zeile den Punkt fort. Nach einer Leerzeile beginnt ein Absatz: eingerückt ein
    // eigener Absatz im Punkt, der wie ein Unterpunkt nicht zählt, sonst das Ende der Aufzählung.
    if (blank) {
      if (indent <= base) break;
      inSub = true;
    } else if (!inSub) items[items.length - 1].push(text.trim());
    blank = false;
  }
  return { items: items.map((parts) => parts.join(' ')), end: i };
}

/** Markdown-Überschrift oder ganze Zeile fett: beendet eine Aufzählung. */
function isHeadingLine(line: Line): boolean {
  return ATX_HEADING.test(line.text) || BOLD_LINE.test(line.text);
}

/**
 * Text eines Punkts ohne Kästchen, Links, Hervorhebung und Code-Zeichen, auf einer Zeile und höchstens
 * `MAX_POINT_LENGTH` Zeichen. Code im Text (`` `__init__.py` ``) bleibt, wie er ist, nur ohne die Backticks.
 */
function cleanPoint(raw: string): string {
  const text = raw
    .replace(/^\s*\[[ xX]\]\s+/, '')
    .split(/(`+[^`]*?`+)/)
    .map((part, k) => (k % 2 === 1 ? part.replace(/^`+|`+$/g, '') : withoutEmphasis(part)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_POINT_LENGTH ? `${text.slice(0, MAX_POINT_LENGTH - 1).trimEnd()}…` : text;
}

/** Markdown ohne Hervorhebung: Links und Bilder nur mit ihrem Text, fett und kursiv ohne Zeichen. */
function withoutEmphasis(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '$1')
    .replace(/(^|\W)__(?=\S)(.+?)__(?!\w)/g, '$1$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1$2');
}

/** Einrückung einer Zeile in Zeichen; ein Tab zählt wie vier Leerzeichen. */
function indentOf(text: string): number {
  const ws = /^[ \t]*/.exec(text)?.[0] ?? '';
  return ws.replace(/\t/g, '    ').length;
}
