import { describe, expect, it } from 'vitest';
import { findInput, type InputRows, type TerminalLine } from '../../src/renderer/terminal/inputArea';
import {
  EDGE_TOP,
  RULE_TOP,
  SETTLE_MS,
  SteadyPlacement,
  freePlacement,
  placeStack,
  samePlacement,
  type StackBand,
  type StackMeasures,
  type StackPlacement,
} from '../../src/renderer/toasts/stackPlacement';
import { fullscreenClaude, inlineClaude, type ClaudeScreen } from '../support/claudeScreens';

// Lage des Stapels der Hinweise: Wahl des Bands aus den Massen und Ruhe beim Neuzeichnen (Ticket 32); Abstand wie zum
// rechten Rand, Zeilen unter der Eingabe frei, kein Springen zwischen den Bändern (Ticket 35).

/** Abstand der Karten zum rechten und unteren Fensterrand (`--toast-edge`), derselbe zur Eingabe. */
const EDGE = 18;
/** Ein Fenster von 700 px Höhe: Titelleiste 44 px, Terminal ab 57 px mit 39 Zeilen à 16 px (bis 681 px). */
const WINDOW = { windowHeight: 700, titlebarHeight: 44, edge: EDGE, terminalTop: 57, rowHeight: 16 };
const ROWS = 39;
const COLS = 120;
/** Zwei Karten mit Abstand. */
const STACK = 170;
/** Eine Karte mit einem offenen Punkt, wie in der App gemessen. */
const ONE_CARD = 117;

function measures(input: StackMeasures['input'], stackHeight = STACK): StackMeasures {
  return { ...WINDOW, input, stackHeight };
}

/** Die Eingabe von `start` bis `cursor`; ohne `end` ist unter der Cursorzeile alles leer. */
function rows(start: number, cursor = start, { rule = false, end = cursor } = {}): InputRows {
  return { startRow: start, startIsRule: rule, cursorRow: cursor, endRow: end };
}

/** Oberkante einer Terminalzeile im Fenster. */
const rowTop = (row: number) => WINDOW.terminalTop + row * WINDOW.rowHeight;
/** Wo Claudes Linie in ihrer Zeile sichtbar beginnt. */
const ruleTop = (row: number) => rowTop(row) + RULE_TOP * WINDOW.rowHeight;

/** Der heutige Platz: Karten unten, 18 px über dem Fensterrand. */
const TODAY = freePlacement(WINDOW.windowHeight, WINDOW.titlebarHeight, EDGE);

/** Ein Claude-Bildschirm: Antwort oben, Linie, Eingabe über drei Zeilen, Linie, Modus in der letzten Zeile. */
function claudeLines(): TerminalLine[] {
  const rule = '─'.repeat(COLS);
  const lines: TerminalLine[] = Array.from({ length: ROWS }, (_, i) => ({ text: i < 30 ? `● Zeile ${i}` : '', isWrapped: false }));
  lines[31] = { text: '✻ Brewing… (12s · esc to interrupt)', isWrapped: false };
  lines[33] = { text: rule, isWrapped: false };
  lines[34] = { text: '> Bitte die Hinweise über die Eingabe', isWrapped: false };
  lines[35] = { text: '  legen, auch bei mehreren Zeilen', isWrapped: false };
  lines[36] = { text: '  und langem Text', isWrapped: false };
  lines[37] = { text: rule, isWrapped: false };
  lines[38] = { text: '  ⏵⏵ accept edits on (shift+tab to cycle)', isWrapped: false };
  return lines;
}

/** Lage des Stapels für einen Bildschirm mit dem Cursor in `cursorRow`, so wie die Oberfläche sie auswertet. */
function placementFor(lines: TerminalLine[], cursorRow: number, stackHeight = STACK, standing: StackBand | null = null): StackPlacement {
  const input = findInput({ cursorRow, rows: ROWS, cols: COLS, lineAt: (row) => lines[row] });
  return placeStack(measures(input, stackHeight), standing);
}

function placementOf(claude: ClaudeScreen, stackHeight: number, standing: StackBand | null = null): StackPlacement {
  return placementFor(claude.lines, claude.cursorRow, stackHeight, standing);
}

/** Wo die unterste Karte endet: Die Karten stehen unten im Bereich. */
const cardBottom = (p: StackPlacement) => p.areaBottom;

describe('Wahl des Bands', () => {
  it('Prompt in der letzten Zeile → über der Eingabe, Unterkante 18 px über ihrem Anfang', () => {
    const p = placeStack(measures(rows(38)));

    expect(p.band).toBe('above');
    expect(cardBottom(p)).toBe(rowTop(38) - 18);
    // Zur Titelleiste derselbe Abstand wie heute.
    expect(p.areaTop).toBe(TODAY.areaTop);
    expect(p.padTop).toBe(EDGE_TOP);
  });

  it('Claude-Eingabe mit drei Zeilen, Rahmen und Modus darunter → über der Linie', () => {
    const p = placementFor(claudeLines(), 36);

    expect(p.band).toBe('above');
    // Die Linie (Zeile 33) bleibt frei, ebenso alles darunter.
    expect(cardBottom(p)).toBe(ruleTop(33) - 18);
    // Der Cursor kann irgendwo in der Eingabe stehen.
    expect(samePlacement(placementFor(claudeLines(), 34), p)).toBe(true);
  });

  it('Prompt oben → unten wie heute', () => {
    const p = placeStack(measures(rows(3)));

    expect(p.band).toBe('below');
    expect(p.areaBottom).toBe(TODAY.areaBottom);
    expect(p.padBottom).toBe(EDGE);
    expect(p.areaTop).toBe(rowTop(4) + 18);
  });

  it('passt der Stapel genau unter die Eingabe, bleibt er unten', () => {
    const roomBelow = TODAY.areaBottom - (rowTop(21) + 18);
    expect(placeStack(measures(rows(20), roomBelow)).band).toBe('below');
    expect(placeStack(measures(rows(20), roomBelow + 1)).band).toBe('above');
  });

  it('lange Shell-Zeile: über ihrer ersten Zeile, nicht nur über der Cursorzeile', () => {
    const p = placeStack(measures(rows(36, 38)));

    expect(p.band).toBe('above');
    expect(cardBottom(p)).toBe(rowTop(36) - 18);
  });

  it('Stapel zu hoch für beide Bänder → das grössere, auf der Seite der Eingabe ohne Überstand', () => {
    const tall = 600;
    // Prompt in Zeile 10: darunter ist mehr Platz.
    const low = placeStack(measures(rows(10), tall));
    expect(low.band).toBe('below');
    expect(low.areaTop).toBe(rowTop(11) + 18);
    // Gescrollte Karten streifen die Eingabe nicht: Die Spalte beginnt genau unter der Cursorzeile.
    expect(low.areaTop - low.padTop).toBe(rowTop(11));
    expect(low.padBottom).toBe(EDGE);

    // Prompt in Zeile 30: darüber ist mehr Platz.
    const high = placeStack(measures(rows(30), tall));
    expect(high.band).toBe('above');
    expect(high.areaBottom + high.padBottom).toBe(rowTop(30));
    expect(high.padTop).toBe(EDGE_TOP);
  });

  it('Eingabe nicht im Bild → unten wie heute', () => {
    expect(placeStack(measures(null))).toEqual(TODAY);
    expect(TODAY).toEqual({ band: 'free', areaTop: 44 + 10, areaBottom: 700 - 18, padTop: 10, padBottom: 18 });
  });

  it('ohne Zeilenhöhe (Terminal noch ohne Grösse) → wie heute', () => {
    expect(placeStack({ ...measures(rows(0)), rowHeight: 0 })).toEqual(TODAY);
  });
});

describe('Abstand zur Eingabe wie zum rechten Rand (Ticket 35)', () => {
  it('Prompt in der letzten Zeile → die Unterkante der Karte liegt 18 px über der Oberkante der Prompt-Zeile', () => {
    expect(rowTop(38) - cardBottom(placeStack(measures(rows(38), ONE_CARD)))).toBe(18);
  });

  it('Claude-Eingabe unter einer Linie → die Unterkante liegt 18 px über der Linie, nicht über dem Rand ihrer Zeile', () => {
    const claude = fullscreenClaude({ rows: ROWS, cols: COLS });
    const p = placementOf(claude, ONE_CARD);

    expect(p.band).toBe('above');
    expect(ruleTop(claude.ruleRow) - cardBottom(p)).toBeCloseTo(18, 9);
    // Die Linie steht etwa in der Mitte ihrer Zeile.
    expect(ruleTop(claude.ruleRow) - rowTop(claude.ruleRow)).toBeCloseTo(6.88, 9);
  });

  it('Prompt oben → Stapel unten wie heute, 18 px über dem Fensterrand', () => {
    const p = placeStack(measures(rows(2), ONE_CARD));

    expect(p.band).toBe('below');
    expect(WINDOW.windowHeight - cardBottom(p)).toBe(18);
  });

  it('unter der Eingabe gilt derselbe Abstand nach unten, zur letzten geschützten Zeile', () => {
    const p = placeStack(measures(rows(5, 6, { end: 12 }), ONE_CARD));

    expect(p.band).toBe('below');
    expect(p.areaTop - rowTop(13)).toBe(18);
  });

  it('der Abstand zur Eingabe folgt dem Abstand zum Fensterrand', () => {
    const wide = { ...measures(rows(38), ONE_CARD), edge: 24 };
    const p = placeStack(wide);

    expect(rowTop(38) - cardBottom(p)).toBe(24);
    expect(placeStack({ ...wide, input: null })).toMatchObject({ areaBottom: 700 - 24, padBottom: 24 });
  });
});

describe('Zeilen unter der Eingabe bleiben frei (Ticket 35)', () => {
  it('Claude mit Linie, Statuszeile mit fünf Zeilen und Modus darunter: eine Karte, die darunter Platz hätte, steht über der Linie', () => {
    const claude = fullscreenClaude({ rows: ROWS, cols: COLS, status: 5 });
    // Eine Karte, die unter der Cursorzeile gerade Platz hätte (Ticket 32 stellte sie dorthin, über die Statuszeile).
    const card = TODAY.areaBottom - (rowTop(claude.cursorRow + 1) + 18);
    expect(card).toBeGreaterThan(80);

    const p = placementOf(claude, card);

    expect(p.band).toBe('above');
    expect(p.areaBottom + p.padBottom).toBeLessThanOrEqual(rowTop(claude.ruleRow) + WINDOW.rowHeight);
    expect(cardBottom(p)).toBeLessThan(ruleTop(claude.ruleRow));
  });

  it('Shell mit leeren Zeilen unter dem Prompt → unten wie heute', () => {
    const lines: TerminalLine[] = Array.from({ length: ROWS }, (_, i) => ({ text: i < 4 ? `Ausgabe ${i}` : '', isWrapped: false }));
    lines[4] = { text: 'C:\\Temp>', isWrapped: false };

    const p = placementFor(lines, 4);

    expect(p.band).toBe('below');
    expect(p.areaBottom).toBe(TODAY.areaBottom);
  });

  it('Vorschlagsliste unter dem Prompt → sie bleibt frei', () => {
    const lines: TerminalLine[] = Array.from({ length: ROWS }, () => ({ text: '', isWrapped: false }));
    lines[10] = { text: 'PS C:\\Temp> git st', isWrapped: false };
    for (let i = 11; i <= 20; i++) lines[i] = { text: `> git status ${i}                                   [History]`, isWrapped: false };

    // Unter der Liste ist Platz: Der Stapel steht darunter, nicht auf ihr.
    const p = placementFor(lines, 10, ONE_CARD);
    expect(p.band).toBe('below');
    expect(p.areaTop - p.padTop).toBe(rowTop(21));

    // Reicht die Liste weiter hinunter, steht er über dem Prompt.
    for (let i = 21; i <= 30; i++) lines[i] = { text: `> git stash ${i}                                    [History]`, isWrapped: false };
    const q = placementFor(lines, 10, ONE_CARD);
    expect(q.band).toBe('above');
    expect(cardBottom(q)).toBe(rowTop(10) - 18);
  });

  it('Claude ohne Vollbild mit dem Eingabefeld weit oben: unter dem Modus, wenn dort ganz Platz ist', () => {
    const claude = inlineClaude({ rows: ROWS, cols: COLS, status: 5, ruleRow: 6 });
    const p = placementOf(claude, STACK);

    expect(p.band).toBe('below');
    expect(p.areaTop - p.padTop).toBe(rowTop(claude.lastRow + 1));
  });
});

/** Spielt Auswertungen zu Zeitpunkten ab und liefert nach jeder die angezeigte Lage. */
function play(steady: SteadyPlacement, frames: [number, StackPlacement][]): StackPlacement[] {
  return frames.map(([now, target]) => {
    steady.propose(target, now);
    steady.settle(now);
    return steady.shown;
  });
}

/**
 * Wie die Oberfläche: Nach jedem Bild wird mit dem Band ausgewertet, in dem der Stapel gerade steht, und die Lage ruhig
 * gehalten. Liefert die angezeigten Lagen, je eine pro Bild, nachdem es lange genug stand.
 */
function settleThrough(screens: { claude: ClaudeScreen; stackHeight: number }[]): StackPlacement[] {
  const first = screens[0];
  const steady = new SteadyPlacement(placementOf(first.claude, first.stackHeight));
  let now = 0;
  return screens.map(({ claude, stackHeight }) => {
    steady.propose(placementOf(claude, stackHeight, steady.shown.band), now);
    now += SETTLE_MS;
    steady.settle(now);
    now += 1000;
    return steady.shown;
  });
}

describe('Kein Springen zwischen den Bändern (Ticket 35)', () => {
  it('Claude im Vollbild: Die Statuszeile wechselt zwischen zwei und sechs Zeilen, der Stapel bleibt über der Eingabe', () => {
    const counts = [5, 6, 4, 6, 2, 6, 3, 5];
    const shown = settleThrough(counts.map((status) => ({ claude: fullscreenClaude({ rows: ROWS, cols: COLS, status }), stackHeight: ONE_CARD })));

    for (const [i, p] of shown.entries()) {
      const claude = fullscreenClaude({ rows: ROWS, cols: COLS, status: counts[i] });
      expect(p.band).toBe('above');
      // Das Eingabefeld rückt mit der Statuszeile hoch und runter; der Stapel bleibt 18 px über der Linie.
      expect(ruleTop(claude.ruleRow) - cardBottom(p)).toBeCloseTo(18, 9);
    }
  });

  it('Claude ohne Vollbild: Die Statuszeile wechselt zwischen zwei und sechs Zeilen, der Stapel bleibt stehen', () => {
    const counts = [5, 2, 6, 3, 6, 2];
    const shown = settleThrough(
      counts.map((status) => ({ claude: inlineClaude({ rows: ROWS, cols: COLS, status, ruleRow: 8 }), stackHeight: ONE_CARD })),
    );

    // Die Karten stehen unten und rühren sich nicht; nur der unsichtbare obere Rand der Spalte folgt der Statuszeile.
    for (const p of shown) {
      expect(p.band).toBe('below');
      expect(cardBottom(p)).toBe(TODAY.areaBottom);
    }
  });

  it('die Höhe des Stapels ändert sich: Er wechselt das Band nur, wenn er im bisherigen keinen Platz mehr hat', () => {
    // Claude ohne Vollbild, Eingabefeld in der Mitte: Unter dem Modus ist Platz für eine Karte, nicht für zwei.
    const claude = inlineClaude({ rows: ROWS, cols: COLS, status: 5, ruleRow: 16 });
    const two = 2 * ONE_CARD + 10;
    const roomBelow = TODAY.areaBottom - (rowTop(claude.lastRow + 1) + 18);
    expect(roomBelow).toBeGreaterThanOrEqual(ONE_CARD);
    expect(roomBelow).toBeLessThan(two);

    const heights = [ONE_CARD, two, 3 * ONE_CARD + 20, two, ONE_CARD];
    const shown = settleThrough(heights.map((stackHeight) => ({ claude, stackHeight })));

    // Erst unten; die zweite Karte passt dort nicht mehr: dann oben, und dort bleibt er, auch mit weniger Karten.
    expect(shown.map((p) => p.band)).toEqual(['below', 'above', 'above', 'above', 'above']);
    // Ohne das bisherige Band ginge eine einzelne Karte wieder nach unten.
    expect(placementOf(claude, ONE_CARD).band).toBe('below');

    // Passt der grössere Stapel weiter in sein Band, bleibt er dort.
    const high = inlineClaude({ rows: ROWS, cols: COLS, status: 5, ruleRow: 6 });
    const grown = settleThrough([
      { claude: high, stackHeight: ONE_CARD },
      { claude: high, stackHeight: two },
    ]);
    expect(grown.map((p) => [p.band, cardBottom(p)])).toEqual([
      ['below', TODAY.areaBottom],
      ['below', TODAY.areaBottom],
    ]);
  });

  it('steht er über der Eingabe und passt dort nicht mehr (nach cls), geht er nach unten', () => {
    const p = placeStack(measures(rows(0), ONE_CARD), 'above');

    expect(p.band).toBe('below');
    expect(p.areaBottom).toBe(TODAY.areaBottom);
  });

  it('steht er unten und die Eingabe wandert bis zum Rand, geht er über die Eingabe', () => {
    expect(placeStack(measures(rows(38), ONE_CARD), 'below').band).toBe('above');
  });

  it('stand er frei (keine Eingabe im Bild), gilt die bisherige Reihenfolge', () => {
    // Prompt in der Mitte: unten und oben wäre Platz; zuerst kommt unten.
    expect(placeStack(measures(rows(15), ONE_CARD), 'free').band).toBe('below');
    expect(placeStack(measures(rows(15), ONE_CARD), 'above').band).toBe('above');
  });
});

describe('Ruhe beim Neuzeichnen', () => {
  const lines = claudeLines();
  const atInput = placementFor(lines, 36);

  it('Claude setzt den Cursor beim Neuzeichnen kurz hoch und dann zurück an die Eingabe: Der Stapel bleibt stehen', () => {
    // Cursorstände einer Folge von Bildern, je 16 ms: Spinner (Zeile 31), Antwort (Zeile 12), zurück an die Eingabe.
    const cursorRows = [36, 31, 36, 12, 36, 31, 31, 36, 38, 36, 31, 36];
    const placements = cursorRows.map((row) => placementFor(lines, row));
    // Die Zwischenstände ergäben wirklich eine andere Lage.
    expect(placements.some((p) => !samePlacement(p, atInput))).toBe(true);

    const steady = new SteadyPlacement(atInput);
    const shown = play(
      steady,
      placements.map((p, i) => [i * 16, p]),
    );

    for (const p of shown) expect(p).toBe(atInput);
  });

  it('eine neue Lage übernimmt er erst, wenn sie 100 ms unverändert war', () => {
    const steady = new SteadyPlacement(TODAY);
    const target = placeStack(measures(rows(38)));

    steady.propose(target, 1000);
    expect(steady.dueAt()).toBe(1000 + SETTLE_MS);
    expect(steady.settle(1000 + SETTLE_MS - 1)).toBe(false);
    expect(steady.shown).toBe(TODAY);
    // Dieselbe Lage erneut ausgewertet: Die Wartezeit läuft weiter, sie beginnt nicht von vorn.
    steady.propose({ ...target }, 1050);
    expect(steady.settle(1000 + SETTLE_MS)).toBe(true);
    expect(steady.shown).toBe(target);
    expect(steady.dueAt()).toBeNull();
  });

  it('wechselt die Wunschlage weiter, beginnt die Wartezeit neu', () => {
    const steady = new SteadyPlacement(TODAY);
    const first = placeStack(measures(rows(38)));
    const second = placeStack(measures(rows(37, 38)));

    steady.propose(first, 0);
    steady.propose(second, 80);
    expect(steady.settle(120)).toBe(false);
    expect(steady.settle(180)).toBe(true);
    expect(steady.shown).toBe(second);
  });

  it('unter der Maus bleibt der Stapel stehen und rückt danach nach', () => {
    const steady = new SteadyPlacement(TODAY);
    const target = placeStack(measures(rows(38)));

    steady.hold(true);
    steady.propose(target, 0);
    expect(steady.dueAt()).toBeNull();
    expect(steady.settle(500)).toBe(false);
    expect(steady.shown).toBe(TODAY);

    steady.hold(false);
    // Die Lage war längst ruhig: Er rückt sofort nach.
    expect(steady.dueAt()).toBe(SETTLE_MS);
    expect(steady.settle(501)).toBe(true);
    expect(steady.shown).toBe(target);
  });

  it('kehrt die Lage unter der Maus zur alten zurück, rückt nach dem Verlassen nichts', () => {
    const steady = new SteadyPlacement(TODAY);
    steady.hold(true);
    steady.propose(placeStack(measures(rows(38))), 0);
    steady.propose(placeStack(measures(null)), 200);
    steady.hold(false);

    expect(steady.dueAt()).toBeNull();
    expect(steady.settle(1000)).toBe(false);
    expect(steady.shown).toBe(TODAY);
  });

  it('springt sofort, wenn keine Karte steht', () => {
    const steady = new SteadyPlacement(TODAY);
    const target = placeStack(measures(rows(38), 0));
    steady.propose(placeStack(measures(rows(20))), 0);

    steady.jump(target);

    expect(steady.shown).toBe(target);
    expect(steady.dueAt()).toBeNull();
  });
});
