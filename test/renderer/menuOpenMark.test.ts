import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMenuOpenMark, MENU_OPEN_ATTRIBUTE, type MarkTarget } from '../../src/renderer/popup/menuOpenMark';

// Solange ein Menü offen ist, ist die Titelleiste keine Zieh-Fläche (Ticket 39): Das Merkmal am Wurzel-Element kommt mit
// dem ersten offenen Menü und geht mit dem letzten. Ohne DOM: Das Wurzel-Element ist nachgemacht und zeichnet auf.

function fakeRoot() {
  const attributes = new Map<string, string>();
  const changes: string[] = [];
  const target: MarkTarget = {
    setAttribute(name, value) {
      attributes.set(name, value);
      changes.push(`+${name}`);
    },
    removeAttribute(name) {
      attributes.delete(name);
      changes.push(`-${name}`);
    },
  };
  return { target, changes, marked: () => attributes.has(MENU_OPEN_ATTRIBUTE) };
}

describe('Merkmal „Menü offen“ am Wurzel-Element', () => {
  it('ohne offenes Menü fehlt es', () => {
    const root = fakeRoot();
    createMenuOpenMark(root.target);
    expect(root.marked()).toBe(false);
    expect(root.changes).toEqual([]);
  });

  it('ein offenes Menü setzt es, mit dem Schliessen verschwindet es wieder', () => {
    const root = fakeRoot();
    const mark = createMenuOpenMark(root.target);
    const close = mark.open();
    expect(root.marked()).toBe(true);
    close();
    expect(root.marked()).toBe(false);
    expect(root.changes).toEqual([`+${MENU_OPEN_ATTRIBUTE}`, `-${MENU_OPEN_ATTRIBUTE}`]);
  });

  it('ersetzt ein Menü direkt ein anderes (das alte schliesst, dann geht das neue auf), bleibt es danach gesetzt', () => {
    // So ruft React die Effekte auf, wenn etwa die Liste einer Gruppe dem Menü eines ihrer Tabs Platz macht: zuerst das
    // Abmelden des alten Menüs, dann das Anmelden des neuen, im selben Durchgang.
    const root = fakeRoot();
    const mark = createMenuOpenMark(root.target);
    const closeList = mark.open();
    closeList();
    const closeTabMenu = mark.open();
    expect(root.marked()).toBe(true);
    closeTabMenu();
    expect(root.marked()).toBe(false);
  });

  it('geht das neue Menü vor dem Schliessen des alten auf, bleibt es durchgehend gesetzt', () => {
    const root = fakeRoot();
    const mark = createMenuOpenMark(root.target);
    const closeFirst = mark.open();
    const closeSecond = mark.open();
    closeFirst();
    expect(root.marked()).toBe(true);
    closeSecond();
    expect(root.marked()).toBe(false);
    // Kein Wegnehmen zwischendurch.
    expect(root.changes).toEqual([`+${MENU_OPEN_ATTRIBUTE}`, `-${MENU_OPEN_ATTRIBUTE}`]);
  });

  it('ein zweites Schliessen desselben Menüs nimmt es einem anderen offenen Menü nicht weg', () => {
    const root = fakeRoot();
    const mark = createMenuOpenMark(root.target);
    const closeFirst = mark.open();
    const closeSecond = mark.open();
    closeFirst();
    closeFirst();
    expect(root.marked()).toBe(true);
    closeSecond();
    expect(root.marked()).toBe(false);
    // Danach setzt ein neues Menü es wieder.
    const closeThird = mark.open();
    expect(root.marked()).toBe(true);
    closeThird();
    expect(root.marked()).toBe(false);
  });

  it('das CSS nimmt mit dem Merkmal die ganze Titelleiste von der Zieh-Fläche aus', () => {
    const css = readFileSync(new URL('../../src/renderer/styles/app.css', import.meta.url), 'utf8');
    const rule = new RegExp(`:root\\[${MENU_OPEN_ATTRIBUTE}\\]\\s+\\.titlebar\\s*\\{([^}]*)\\}`);
    const body = css.match(rule)?.[1] ?? '';
    expect(body).toMatch(/-webkit-app-region:\s*no-drag\s*;/);
    // Ohne Merkmal bleibt die Titelleiste die Zieh-Fläche.
    expect(css).toMatch(/\n\.titlebar\s*\{[^}]*-webkit-app-region:\s*drag\s*;/);
  });
});
