import { describe, expect, it } from 'vitest';
import { startWorkspace } from '../support/harness';

// Design und Schriftgrösse (Ticket 18): Der Kern speichert die Wahl, meldet sie der Oberfläche und
// liest sie nach einem Neustart wieder. Was sie bewirken, zeigen Hauptprozess und Oberfläche.

/** Ein gespeicherter Zustand der Version 2 mit diesen Einstellungen. */
function stateWith(settings: Record<string, unknown>) {
  return {
    version: 2,
    settings: { defaultCwd: '', ...settings },
    tabs: [{ id: 'a', name: 'A', nameIsManual: true, shellId: 'cmd', startCwd: 'C:\\Users\\tester' }],
    activeTabId: 'a',
  };
}

describe('Design', () => {
  it('folgt ohne Einstellung Windows („System“)', () => {
    const h = startWorkspace();

    expect(h.snapshot().settings.theme).toBe('system');
  });

  it.each(['light', 'dark', 'system'] as const)('„%s“ wird gespeichert und der Oberfläche gemeldet', (theme) => {
    const h = startWorkspace();
    h.workspace.updateSettings({ theme: theme === 'system' ? 'dark' : 'system' });

    h.workspace.updateSettings({ theme });

    expect(h.snapshot().settings.theme).toBe(theme);
    expect(h.storedState().settings.theme).toBe(theme);
    expect(h.events.at(-1)).toMatchObject({ type: 'settings', settings: { theme } });
  });

  it('übersteht einen Neustart', async () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ theme: 'light' });

    await h.restart();

    expect(h.snapshot().settings.theme).toBe('light');
  });

  it('ein unbekanntes Design in der Datei gilt als „System“', () => {
    const h = startWorkspace({ state: stateWith({ theme: 'blau' }) });

    expect(h.snapshot().settings.theme).toBe('system');
  });
});

describe('Schriftgrösse im Terminal', () => {
  it('ist ohne Einstellung 14', () => {
    const h = startWorkspace();

    expect(h.snapshot().settings.fontSize).toBe(14);
  });

  it('wird gespeichert und der Oberfläche gemeldet', () => {
    const h = startWorkspace();

    h.workspace.updateSettings({ fontSize: 18 });

    expect(h.snapshot().settings.fontSize).toBe(18);
    expect(h.storedState().settings.fontSize).toBe(18);
    expect(h.events.at(-1)).toMatchObject({ type: 'settings', settings: { fontSize: 18 } });
  });

  it('übersteht einen Neustart, zusammen mit dem Design', async () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ fontSize: 11 });
    h.workspace.updateSettings({ theme: 'dark' });

    await h.restart();

    expect(h.snapshot().settings).toMatchObject({ fontSize: 11, theme: 'dark' });
  });

  it.each([
    ['grösser als 32', 40, 32],
    ['kleiner als 8', 3, 8],
    ['genau 32', 32, 32],
    ['genau 8', 8, 8],
    ['mit Kommastelle', 13.6, 14],
  ])('bleibt zwischen 8 und 32: %s', (_label, requested, expected) => {
    const h = startWorkspace();

    h.workspace.updateSettings({ fontSize: requested });

    expect(h.snapshot().settings.fontSize).toBe(expected);
    expect(h.storedState().settings.fontSize).toBe(expected);
  });

  it('bleibt auch beim Lesen der Datei zwischen 8 und 32', () => {
    expect(startWorkspace({ state: stateWith({ fontSize: 99 }) }).snapshot().settings.fontSize).toBe(32);
    expect(startWorkspace({ state: stateWith({ fontSize: 0 }) }).snapshot().settings.fontSize).toBe(8);
    expect(startWorkspace({ state: stateWith({ fontSize: 'gross' }) }).snapshot().settings.fontSize).toBe(14);
  });

  it('an der Grenze ändert ein weiterer Schritt nichts mehr; es gibt kein Ereignis', () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ fontSize: 32 });
    const events = h.events.length;

    h.workspace.updateSettings({ fontSize: 33 });

    expect(h.events.length).toBe(events);
  });

  it('lässt die anderen Einstellungen unverändert', () => {
    const h = startWorkspace({ directories: ['D:\\work'] });
    h.workspace.updateSettings({ defaultCwd: 'D:\\work', theme: 'light' });

    h.workspace.updateSettings({ fontSize: 20 });

    expect(h.snapshot().settings).toMatchObject({ defaultCwd: 'D:\\work', theme: 'light', fontSize: 20 });
  });
});
