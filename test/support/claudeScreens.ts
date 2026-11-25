// Bildschirme, wie Claude Code 2.1.332 sie über ConPTY in ein xterm.js zeichnet (Ticket 35). Der Aufbau ist der
// Aufzeichnung des echten Claude Code in einem eigenen Pseudoterminal nachgebaut (Hinweise aus der Umsetzung im Ticket):
// Eingabefeld zwischen zwei Linien aus ─, darunter die Statuszeile des Nutzers und der Modus.

import type { TerminalLine } from '../../src/renderer/terminal/inputArea';

/** Die Statuszeile des Nutzers nachgebildet: eine Überschrift und Balken, zusammen `count` Zeilen. */
export function statusLines(count: number): string[] {
  const names = ['Kontext ', '5 h     ', 'Woche   ', 'Modell  ', 'Extra   '];
  const bar = (p: number) => '█'.repeat(p / 5) + '░'.repeat(20 - p / 5);
  const lines = ['  Modell · Kontext · Nutzung'];
  for (let i = 0; i < count - 1; i++) lines.push(`  ${names[i % names.length]} ${bar((i + 1) * 15)} ${(i + 1) * 15} %`);
  return lines;
}

const MODE = '  ⏵⏵ auto mode on (shift+tab to cycle)';

export interface ClaudeScreen {
  lines: TerminalLine[];
  /** Zeile der Linie über dem Eingabefeld. */
  ruleRow: number;
  /** Zeile des Cursors: die letzte Zeile der Eingabe. */
  cursorRow: number;
  /** Letzte nicht leere Zeile: der Modus. */
  lastRow: number;
}

interface ScreenOptions {
  rows: number;
  cols: number;
  /** Zeilen der Eingabe, die erste mit `> `. */
  input?: string[];
  /** Zeilen der Statuszeile. */
  status?: number;
}

function line(text: string): TerminalLine {
  return { text, isWrapped: false };
}

/**
 * Claude im Vollbild (Standard in 2.1.332, alternativer Bildschirm): Eingabefeld, Statuszeile und Modus sind unten
 * verankert. Wird die Statuszeile höher, rückt das Eingabefeld nach oben. Darüber Claudes Antwort, eine Zeile mit
 * Hinweis rechts (etwa „◐ medium · /effort“) und Reste aus Leerzeichen.
 */
export function fullscreenClaude({ rows, cols, input = ['> '], status = 5 }: ScreenOptions): ClaudeScreen {
  const rule = '─'.repeat(cols);
  const bottom = [rule, ...input, rule, ...statusLines(status), MODE];
  const ruleRow = rows - bottom.length;
  const top = Array.from({ length: ruleRow }, (_, i) => (i < ruleRow - 4 ? (i % 3 === 0 ? `● Antwort ${i}` : '') : ' '.repeat(30)));
  top[ruleRow - 1] = `${' '.repeat(cols - 20)}◐ medium · /effort`;
  return {
    lines: [...top, ...bottom].map(line),
    ruleRow,
    cursorRow: ruleRow + input.length,
    lastRow: rows - 1,
  };
}

/**
 * Claude ohne Vollbild (`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`): Das Eingabefeld steht nach der bisherigen Ausgabe,
 * hier mit der Linie in `ruleRow`; Statuszeile und Modus folgen darunter, danach leere Zeilen. Wird die Statuszeile
 * höher, wächst sie nach unten.
 */
export function inlineClaude({ rows, cols, input = ['> '], status = 5, ruleRow }: ScreenOptions & { ruleRow: number }): ClaudeScreen {
  const rule = '─'.repeat(cols);
  const top = Array.from({ length: ruleRow }, (_, i) => (i % 3 === 0 ? `● Antwort ${i}` : ''));
  const block = [rule, ...input, rule, ...statusLines(status), MODE];
  const rest = Array.from({ length: rows - ruleRow - block.length }, () => '');
  return {
    lines: [...top, ...block, ...rest].map(line),
    ruleRow,
    cursorRow: ruleRow + input.length,
    lastRow: ruleRow + block.length - 1,
  };
}
