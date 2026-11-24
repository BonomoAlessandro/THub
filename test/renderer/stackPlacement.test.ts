import { describe, expect, it } from 'vitest';
import { findInput, type TerminalLine } from '../../src/renderer/terminal/inputArea';
import {
  EDGE_BOTTOM,
  EDGE_TOP,
  SETTLE_MS,
  SteadyPlacement,
  freePlacement,
  placeStack,
  samePlacement,
  type StackMeasures,
  type StackPlacement,
} from '../../src/renderer/toasts/stackPlacement';

// Lage des Stapels der Hinweise (Ticket 32): Wahl des Bands aus den Massen und Ruhe beim Neuzeichnen.

/** Ein Fenster von 700 px Höhe: Titelleiste 44 px, Terminal ab 57 px mit 39 Zeilen à 16 px (bis 681 px). */
const WINDOW = { windowHeight: 700, titlebarHeight: 44, terminalTop: 57, rowHeight: 16 };
const ROWS = 39;
const COLS = 120;
/** Zwei Karten mit Abstand. */
const STACK = 170;

function measures(input: StackMeasures['input'], stackHeight = STACK): StackMeasures {
  return { ...WINDOW, input, stackHeight };
}

/** Oberkante einer Terminalzeile im Fenster. */
const rowTop = (row: number) => WINDOW.terminalTop + row * WINDOW.rowHeight;

/** Der heutige Platz: Karten unten, 18 px über dem Fensterrand. */
const TODAY = freePlacement(WINDOW.windowHeight, WINDOW.titlebarHeight);

/** Ein Claude-Bildschirm: Antwort oben, Linie, Eingabe über drei Zeilen, Linie, Statuszeile in der letzten Zeile. */
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
function placementFor(lines: TerminalLine[], cursorRow: number, stackHeight = STACK): StackPlacement {
  const input = findInput({ cursorRow, rows: ROWS, cols: COLS, lineAt: (row) => lines[row] });
  return placeStack(measures(input, stackHeight));
}

describe('Wahl des Bands', () => {
  it('Prompt in der letzten Zeile → über der Eingabe, Unterkante mit Abstand über ihrem Anfang', () => {
    const p = placeStack(measures({ startRow: 38, cursorRow: 38 }));

    expect(p.band).toBe('above');
    expect(p.areaBottom).toBe(rowTop(38) - WINDOW.rowHeight / 2);
    expect(p.areaBottom).toBeLessThan(rowTop(38));
    // Zur Titelleiste derselbe Abstand wie heute.
    expect(p.areaTop).toBe(TODAY.areaTop);
    expect(p.padTop).toBe(EDGE_TOP);
  });

  it('Claude-Eingabe mit drei Zeilen, Rahmen und Statuszeile darunter → über der Linie', () => {
    const p = placementFor(claudeLines(), 36);

    expect(p.band).toBe('above');
    // Die Linie (Zeile 33) bleibt frei, ebenso alles darunter.
    expect(p.areaBottom).toBe(rowTop(33) - WINDOW.rowHeight / 2);
    // Der Cursor kann irgendwo in der Eingabe stehen.
    expect(samePlacement(placementFor(claudeLines(), 34), p)).toBe(true);
  });

  it('Prompt oben → unten wie heute', () => {
    const p = placeStack(measures({ startRow: 3, cursorRow: 3 }));

    expect(p.band).toBe('below');
    expect(p.areaBottom).toBe(TODAY.areaBottom);
    expect(p.padBottom).toBe(EDGE_BOTTOM);
    expect(p.areaTop).toBe(rowTop(4) + WINDOW.rowHeight / 2);
  });

  it('passt der Stapel genau unter die Eingabe, bleibt er unten', () => {
    const roomBelow = TODAY.areaBottom - (rowTop(21) + WINDOW.rowHeight / 2);
    expect(placeStack(measures({ startRow: 20, cursorRow: 20 }, roomBelow)).band).toBe('below');
    expect(placeStack(measures({ startRow: 20, cursorRow: 20 }, roomBelow + 1)).band).toBe('above');
  });

  it('lange Shell-Zeile: über ihrer ersten Zeile, nicht nur über der Cursorzeile', () => {
    const p = placeStack(measures({ startRow: 36, cursorRow: 38 }));

    expect(p.band).toBe('above');
    expect(p.areaBottom).toBe(rowTop(36) - WINDOW.rowHeight / 2);
  });

  it('Stapel zu hoch für beide Bänder → das grössere, auf der Seite der Eingabe ohne Überstand', () => {
    const tall = 600;
    // Prompt in Zeile 10: darunter ist mehr Platz.
    const low = placeStack(measures({ startRow: 10, cursorRow: 10 }, tall));
    expect(low.band).toBe('below');
    expect(low.areaTop).toBe(rowTop(11) + WINDOW.rowHeight / 2);
    // Gescrollte Karten streifen die Eingabe nicht: Die Spalte beginnt genau unter der Cursorzeile.
    expect(low.areaTop - low.padTop).toBe(rowTop(11));
    expect(low.padBottom).toBe(EDGE_BOTTOM);

    // Prompt in Zeile 30: darüber ist mehr Platz.
    const high = placeStack(measures({ startRow: 30, cursorRow: 30 }, tall));
    expect(high.band).toBe('above');
    expect(high.areaBottom + high.padBottom).toBe(rowTop(30));
    expect(high.padTop).toBe(EDGE_TOP);
  });

  it('Eingabe nicht im Bild → unten wie heute', () => {
    expect(placeStack(measures(null))).toEqual(TODAY);
    expect(TODAY).toEqual({ band: 'free', areaTop: 44 + 10, areaBottom: 700 - 18, padTop: 10, padBottom: 18 });
  });

  it('ohne Zeilenhöhe (Terminal noch ohne Grösse) → wie heute', () => {
    expect(placeStack({ ...measures({ startRow: 0, cursorRow: 0 }), rowHeight: 0 })).toEqual(TODAY);
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
    const target = placeStack(measures({ startRow: 38, cursorRow: 38 }));

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
    const first = placeStack(measures({ startRow: 38, cursorRow: 38 }));
    const second = placeStack(measures({ startRow: 37, cursorRow: 38 }));

    steady.propose(first, 0);
    steady.propose(second, 80);
    expect(steady.settle(120)).toBe(false);
    expect(steady.settle(180)).toBe(true);
    expect(steady.shown).toBe(second);
  });

  it('unter der Maus bleibt der Stapel stehen und rückt danach nach', () => {
    const steady = new SteadyPlacement(TODAY);
    const target = placeStack(measures({ startRow: 38, cursorRow: 38 }));

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
    steady.propose(placeStack(measures({ startRow: 38, cursorRow: 38 })), 0);
    steady.propose(placeStack(measures(null)), 200);
    steady.hold(false);

    expect(steady.dueAt()).toBeNull();
    expect(steady.settle(1000)).toBe(false);
    expect(steady.shown).toBe(TODAY);
  });

  it('springt sofort, wenn keine Karte steht', () => {
    const steady = new SteadyPlacement(TODAY);
    const target = placeStack(measures({ startRow: 38, cursorRow: 38 }, 0));
    steady.propose(placeStack(measures({ startRow: 20, cursorRow: 20 })), 0);

    steady.jump(target);

    expect(steady.shown).toBe(target);
    expect(steady.dueAt()).toBeNull();
  });
});
