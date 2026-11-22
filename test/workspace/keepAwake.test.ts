import { describe, expect, it, vi } from 'vitest';
import { startWorkspace } from '../support/harness';

// Rechner wach halten (Ticket 28): Der Kern besitzt an/aus und die Stufe und meldet dem Port Wachhalten die wirksame
// Stufe, beim Start und bei jeder Änderung, die sie ändert. Was Windows daraus macht, zeigt der echte Port
// (test/main/keepAwake.test.ts).

/** Ein gespeicherter Zustand der Version 2 mit diesen Einstellungen. */
function stateWith(settings: Record<string, unknown>) {
  return {
    version: 2,
    settings: { defaultCwd: '', ...settings },
    tabs: [{ id: 'a', name: 'A', nameIsManual: true, shellId: 'cmd', startCwd: 'C:\\Users\\tester' }],
    activeTabId: 'a',
  };
}

describe('Rechner wach halten: Start', () => {
  it('ohne gespeicherte Angaben ist es aus, mit der Stufe „nur Rechner“, und der Kern meldet beim Start „aus“', () => {
    const h = startWorkspace();

    expect(h.snapshot().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'system' });
    expect(h.keepAwake.levels).toEqual(['off']);
  });

  it('ein Zustand von vor Ticket 28 gilt als aus und „nur Rechner“, ohne neue Schema-Version', () => {
    const h = startWorkspace({ state: stateWith({ theme: 'dark', fontSize: 16 }) });

    expect(h.snapshot().settings).toMatchObject({ theme: 'dark', fontSize: 16, keepAwake: false, keepAwakeMode: 'system' });
    expect(h.keepAwake.levels).toEqual(['off']);
    h.workspace.updateSettings({ keepAwake: true });
    expect(h.storedState().version).toBe(2);
    expect(h.storedState().settings).toMatchObject({ keepAwake: true, keepAwakeMode: 'system' });
  });

  it.each([
    [{ keepAwake: true, keepAwakeMode: 'system' }, 'system'],
    [{ keepAwake: true, keepAwakeMode: 'display' }, 'display'],
    [{ keepAwake: false, keepAwakeMode: 'display' }, 'off'],
  ] as const)('gespeichert %o: der Kern meldet beim Start „%s“', (settings, level) => {
    const h = startWorkspace({ state: stateWith(settings) });

    expect(h.keepAwake.levels).toEqual([level]);
  });

  it('unbrauchbare Angaben in der Datei fallen auf aus und „nur Rechner“ zurück', () => {
    const h = startWorkspace({ state: stateWith({ keepAwake: 'ja', keepAwakeMode: 'alles' }) });

    expect(h.snapshot().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'system' });
    expect(h.keepAwake.levels).toEqual(['off']);
  });
});

describe('Rechner wach halten: Umschalten', () => {
  it('Einschalten meldet die gewählte Stufe, Ausschalten „aus“', () => {
    const h = startWorkspace();

    h.workspace.updateSettings({ keepAwake: true });
    h.workspace.updateSettings({ keepAwake: false });
    h.workspace.updateSettings({ keepAwakeMode: 'display' });
    h.workspace.updateSettings({ keepAwake: true });
    h.workspace.updateSettings({ keepAwake: false });

    expect(h.keepAwake.levels).toEqual(['off', 'system', 'off', 'display', 'off']);
  });

  it('ein Wechsel der Stufe meldet eingeschaltet die neue Stufe, ausgeschaltet nichts', () => {
    const h = startWorkspace();

    h.workspace.updateSettings({ keepAwakeMode: 'display' });
    expect(h.keepAwake.levels).toEqual(['off']);
    expect(h.snapshot().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'display' });

    h.workspace.updateSettings({ keepAwake: true });
    h.workspace.updateSettings({ keepAwakeMode: 'system' });
    h.workspace.updateSettings({ keepAwakeMode: 'display' });

    expect(h.keepAwake.levels).toEqual(['off', 'display', 'system', 'display']);
  });

  it('die Wahl im Pfeil-Menü (Stufe und an zusammen) ergibt eine einzige Meldung mit der neuen Stufe', () => {
    const h = startWorkspace();

    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });

    expect(h.keepAwake.levels).toEqual(['off', 'display']);
  });

  it('dieselbe Einstellung zweimal ergibt keine zweite Meldung', () => {
    const h = startWorkspace();

    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });
    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });
    h.workspace.updateSettings({ keepAwake: true });
    h.workspace.updateSettings({ keepAwake: false });
    h.workspace.updateSettings({ keepAwake: false });

    expect(h.keepAwake.levels).toEqual(['off', 'display', 'off']);
  });

  it('andere Einstellungen melden nichts', () => {
    const h = startWorkspace({ state: stateWith({ keepAwake: true }) });

    h.workspace.updateSettings({ theme: 'dark' });
    h.workspace.stepFontSize(1);
    h.workspace.updateSettings({ notifications: false, openPoints: false });

    expect(h.keepAwake.levels).toEqual(['system']);
  });

  it('wird gespeichert und der Oberfläche gemeldet', () => {
    const h = startWorkspace();

    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });

    expect(h.storedState().settings).toMatchObject({ keepAwake: true, keepAwakeMode: 'display' });
    expect(h.events.at(-1)).toMatchObject({
      type: 'settings',
      settings: { keepAwake: true, keepAwakeMode: 'display' },
    });
  });
});

describe('Rechner wach halten: Beenden und Neustart', () => {
  it('nach einem Neustart meldet der Kern beim Start die gespeicherte Stufe', async () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });

    await h.restart();

    expect(h.keepAwake.levels).toEqual(['display']);
    expect(h.snapshot().settings).toMatchObject({ keepAwake: true, keepAwakeMode: 'display' });
  });

  it('ausgeschaltet bleibt es über einen Neustart aus, mit der gewählten Stufe', async () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });
    h.workspace.updateSettings({ keepAwake: false });

    await h.restart();

    expect(h.keepAwake.levels).toEqual(['off']);
    expect(h.snapshot().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'display' });
  });

  it('Beenden lässt die gespeicherte Einstellung eingeschaltet und meldet nichts mehr', async () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ keepAwake: true });

    await h.workspace.shutdown();

    expect(h.storedState().settings).toMatchObject({ keepAwake: true, keepAwakeMode: 'system' });
    expect(h.keepAwake.levels).toEqual(['off', 'system']);
  });

  it('nach dem Beenden ändert eine Einstellung das Wachhalten nicht mehr', async () => {
    const h = startWorkspace({ state: stateWith({ keepAwake: true }) });
    await h.workspace.shutdown();

    h.workspace.updateSettings({ keepAwake: false });

    expect(h.keepAwake.levels).toEqual(['system']);
    expect(h.storedState().settings.keepAwake).toBe(true);
  });

  it('Einfrieren und Windows-Abmeldung lassen die gespeicherte Einstellung eingeschaltet', () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });

    h.workspace.freeze();
    h.workspace.sessionEnding();

    expect(h.storedState().settings).toMatchObject({ keepAwake: true, keepAwakeMode: 'display' });
    expect(h.keepAwake.levels).toEqual(['off', 'display']);
  });

  it('wirft der Port, läuft der Kern weiter und die Einstellung bleibt, wie gewählt', () => {
    const h = startWorkspace();
    h.keepAwake.set = () => {
      throw new Error('koffi fehlt');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    h.workspace.updateSettings({ keepAwake: true });

    expect(logged).toHaveBeenCalledWith('Rechner wach halten:', expect.any(Error));
    logged.mockRestore();
    expect(h.snapshot().settings.keepAwake).toBe(true);
    expect(h.storedState().settings.keepAwake).toBe(true);
  });
});
