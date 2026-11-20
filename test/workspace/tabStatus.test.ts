import { describe, expect, it } from 'vitest';
import { classifyInput, displayedStatus, type StatusFacts } from '../../src/main/workspace/tabStatus';

// Reine Regeln zum Status am Tab (Ticket 13): Vorrang des angezeigten Status und was eine Eingabe aus dem Terminal
// für den Status bedeutet. Das Zusammenspiel mit Hooks, Uhr und Sonde prüfen claudeStatus und processStatus.

describe('angezeigter Status', () => {
  const none: StatusFacts = { paused: false, activity: 'idle', finished: false, processes: false };

  it.each<[string, Partial<StatusFacts>, string]>([
    ['nichts', {}, 'idle'],
    ['nur Prozesse', { processes: true }, 'processes'],
    ['grün plus blau', { finished: true, processes: true }, 'finished'],
    ['arbeitet plus grün und blau', { activity: 'working', finished: true, processes: true }, 'working'],
    ['wartet plus grün und blau', { activity: 'waiting', finished: true, processes: true }, 'waiting'],
    ['pausiert vor allem anderen', { paused: true, activity: 'waiting', finished: true, processes: true }, 'paused'],
  ])('%s', (_label, facts, expected) => {
    expect(displayedStatus({ ...none, ...facts })).toBe(expected);
  });
});

describe('Eingaben aus dem Terminal', () => {
  it.each([
    ['Esc', '\x1b', 'escape'],
    ['Esc, schnell zweimal', '\x1b\x1b', 'escape'],
    ['Ziffer 1', '1', 'answer'],
    ['Ziffer 3', '3', 'answer'],
    ['Enter', '\r', 'answer'],
    ['eine Buchstabentaste', 'y', 'other'],
    ['Text', 'mach', 'other'],
    ['zwei Ziffern auf einmal (Einfügen)', '12', 'other'],
    ['Pfeil nach unten', '\x1b[B', 'other'],
    ['Pfeil im Anwendungsmodus', '\x1bOB', 'other'],
    ['Pos1', '\x1b[H', 'other'],
    ['Ende', '\x1b[F', 'other'],
    ['Bild auf', '\x1b[5~', 'other'],
    ['Bild ab', '\x1b[6~', 'other'],
    ['Tab', '\t', 'other'],
    ['Alt+x', '\x1bx', 'other'],
    ['Einfügen mit Klammern', '\x1b[200~text\x1b[201~', 'other'],
    ['Fokus gewonnen', '\x1b[I', 'report'],
    ['Fokus verloren', '\x1b[O', 'report'],
    ['Maus (SGR), Rad', '\x1b[<64;10;5M', 'report'],
    ['Maus (X10)', '\x1b[M #!', 'report'],
    ['Cursor-Position', '\x1b[12;40R', 'report'],
    ['Geräteattribute', '\x1b[?1;2c', 'report'],
    ['Modus-Abfrage', '\x1b[?2026;2$y', 'report'],
    ['Farbe des Hintergrunds (OSC 11)', '\x1b]11;rgb:1414/1414/1717\x1b\\', 'report'],
    ['Farbe mit BEL', '\x1b]10;rgb:d4d4/d4d4/dcdc\x07', 'report'],
    ['XTVERSION (DCS)', '\x1bP>|xterm.js(6.0.0)\x1b\\', 'report'],
    ['mehrere Antworten zugleich', '\x1b[I\x1b[12;40R', 'report'],
    ['Antwort des Terminals und Taste', '\x1b[I1', 'other'],
  ])('%s', (_label, data, expected) => {
    expect(classifyInput(data)).toBe(expected);
  });
});
