import { describe, expect, it } from 'vitest';
import { menuKey } from '../../src/renderer/popup/menuKeys';

// Bedienung des Pfeil-Menüs mit der Tastatur: drei wählbare Einträge.

describe('Menü mit der Tastatur', () => {
  it('Pfeil runter hebt ohne Hervorhebung den ersten Eintrag hervor, dann den nächsten, im Kreis', () => {
    expect(menuKey('ArrowDown', -1, 3)).toEqual({ type: 'highlight', index: 0 });
    expect(menuKey('ArrowDown', 0, 3)).toEqual({ type: 'highlight', index: 1 });
    expect(menuKey('ArrowDown', 2, 3)).toEqual({ type: 'highlight', index: 0 });
  });

  it('Pfeil hoch hebt ohne Hervorhebung den letzten Eintrag hervor, dann den vorherigen, im Kreis', () => {
    expect(menuKey('ArrowUp', -1, 3)).toEqual({ type: 'highlight', index: 2 });
    expect(menuKey('ArrowUp', 2, 3)).toEqual({ type: 'highlight', index: 1 });
    expect(menuKey('ArrowUp', 0, 3)).toEqual({ type: 'highlight', index: 2 });
  });

  it('Pos1 und Ende springen zum ersten und letzten Eintrag', () => {
    expect(menuKey('Home', 1, 3)).toEqual({ type: 'highlight', index: 0 });
    expect(menuKey('End', 1, 3)).toEqual({ type: 'highlight', index: 2 });
  });

  it('Enter und Leertaste wählen den hervorgehobenen Eintrag, ohne Hervorhebung nichts', () => {
    expect(menuKey('Enter', 1, 3)).toEqual({ type: 'choose', index: 1 });
    expect(menuKey(' ', 0, 3)).toEqual({ type: 'choose', index: 0 });
    expect(menuKey('Enter', -1, 3)).toBeNull();
  });

  it('Escape und Tab schliessen das Menü', () => {
    expect(menuKey('Escape', 1, 3)).toEqual({ type: 'close' });
    expect(menuKey('Tab', -1, 3)).toEqual({ type: 'close' });
  });

  it('andere Tasten betreffen das Menü nicht', () => {
    expect(menuKey('a', 0, 3)).toBeNull();
    expect(menuKey('F2', 0, 3)).toBeNull();
  });

  it('ohne wählbare Einträge bewegt sich nichts', () => {
    expect(menuKey('ArrowDown', -1, 0)).toBeNull();
    expect(menuKey('Enter', -1, 0)).toBeNull();
    expect(menuKey('Escape', -1, 0)).toEqual({ type: 'close' });
  });
});
