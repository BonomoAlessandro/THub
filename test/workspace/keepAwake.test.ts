import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { KeepAwakeError, type KeepAwakeLevel } from '../../src/main/workspace/ports';
import { settle, startWorkspace, type TestWorkspace } from '../support/harness';

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

});

// Ticket 31: Scheitert das Wachhalten, schaltet der Kern es aus und zeigt einen als Fehler markierten Hinweis ohne Tab.
describe('Rechner wach halten: Fehler', () => {
  /** Windows lehnt das Setzen ab (Fehler 5), wie der echte Port es meldet. */
  const denied = (): KeepAwakeError =>
    new KeepAwakeError('PowerSetRequest(system): Windows-Fehler 5', 'set', 'windows', 5);
  /** Scheitert bei jedem Einschalten, Ausschalten gelingt. */
  const failOn = (level: KeepAwakeLevel) => (level === 'off' ? undefined : denied());
  const errorToasts = (h: TestWorkspace) => h.snapshot().toasts.filter((t) => t.kind === 'keepAwakeError');

  let logged: MockInstance;
  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => logged.mockRestore());

  it('scheitert das Einschalten, ist es danach aus (auch gespeichert), die Stufe bleibt, und genau ein Fehler-Hinweis ohne Tab steht da', async () => {
    const h = startWorkspace({ keepAwakeFail: failOn });

    h.workspace.updateSettings({ keepAwake: true, keepAwakeMode: 'display' });
    await settle();

    expect(h.snapshot().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'display' });
    expect(h.storedState().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'display' });
    expect(h.eventsOfType('settings').at(-1)).toMatchObject({ settings: { keepAwake: false } });
    expect(errorToasts(h)).toEqual([
      { id: expect.any(String), kind: 'keepAwakeError', failure: { action: 'on', reason: 'windows', code: 5 } },
    ]);
    // Der Port hält nach dem Fehler schon nichts mehr wach; der Kern meldet „aus“ nicht noch einmal.
    expect(h.keepAwake.levels).toEqual(['off', 'display']);
    expect(logged).toHaveBeenCalled();
  });

  it('beim Start mit gespeichertem „an“ ebenso; nach einem weiteren Neustart bleibt es aus, ohne neuen Hinweis', async () => {
    const h = startWorkspace({ state: stateWith({ keepAwake: true, keepAwakeMode: 'system' }), keepAwakeFail: failOn });
    await settle();

    expect(h.snapshot().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'system' });
    expect(h.storedState().settings.keepAwake).toBe(false);
    expect(errorToasts(h)).toHaveLength(1);

    await h.restart();
    await settle();

    expect(h.keepAwake.levels).toEqual(['off']);
    expect(h.snapshot().settings.keepAwake).toBe(false);
    expect(errorToasts(h)).toEqual([]);
  });

  it('scheitert ein Wechsel der Stufe bei eingeschaltetem Wachhalten, ist es danach aus', async () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ keepAwake: true });
    await settle();

    h.keepAwakeFail = (level) => (level === 'display' ? denied() : undefined);
    h.workspace.updateSettings({ keepAwakeMode: 'display' });
    await settle();

    expect(h.snapshot().settings).toMatchObject({ keepAwake: false, keepAwakeMode: 'display' });
    expect(errorToasts(h).map((t) => t.failure.action)).toEqual(['on']);
  });

  it('scheitert das Aufheben, bleibt die Einstellung wie gewählt, mit dem Hinweis zum Aufheben', async () => {
    const h = startWorkspace({ state: stateWith({ keepAwake: true }) });
    await settle();

    h.keepAwakeFail = (level) =>
      level === 'off' ? new KeepAwakeError('PowerClearRequest(system): Windows-Fehler 6', 'clear', 'windows', 6) : undefined;
    h.workspace.updateSettings({ keepAwake: false });
    await settle();

    expect(h.snapshot().settings.keepAwake).toBe(false);
    expect(errorToasts(h).map((t) => t.failure)).toEqual([{ action: 'off', reason: 'windows', code: 6 }]);
  });

  it('ein Fehler für eine Stufe, die inzwischen nicht mehr gewünscht ist, ändert nichts und zeigt keinen Hinweis', async () => {
    const h = startWorkspace({ keepAwakeFail: (level) => (level === 'system' ? denied() : undefined) });

    // Einschalten mit „nur Rechner“ scheitert, aber noch vor der Antwort wählt der Nutzer „Rechner und Bildschirm“.
    h.workspace.updateSettings({ keepAwake: true });
    h.workspace.updateSettings({ keepAwakeMode: 'display' });
    await settle();

    expect(h.snapshot().settings).toMatchObject({ keepAwake: true, keepAwakeMode: 'display' });
    expect(errorToasts(h)).toEqual([]);
  });

  it('mehrere Fehler ergeben einen Hinweis mit dem letzten Grund, auch bei „Hinweise im Fenster: aus“; × schliesst ihn', async () => {
    const h = startWorkspace();
    h.workspace.updateSettings({ notifications: false, openPoints: false });

    h.keepAwakeFail = failOn;
    h.workspace.updateSettings({ keepAwake: true });
    await settle();
    h.keepAwakeFail = (level) => (level === 'off' ? undefined : new KeepAwakeError('koffi fehlt', 'set', 'load'));
    h.workspace.updateSettings({ keepAwake: true });
    await settle();

    const toasts = errorToasts(h);
    expect(toasts.map((t) => t.failure)).toEqual([{ action: 'on', reason: 'load' }]);

    h.workspace.dismissToast(toasts[0].id);
    expect(errorToasts(h)).toEqual([]);
  });

  it('ein Klick auf den Hinweis schliesst ihn und zeigt keinen anderen Tab an', async () => {
    const h = startWorkspace({ keepAwakeFail: failOn });
    h.workspace.createTab();
    const active = h.snapshot().activeTabId;

    h.workspace.updateSettings({ keepAwake: true });
    await settle();
    h.workspace.openToast(errorToasts(h)[0].id);

    expect(errorToasts(h)).toEqual([]);
    expect(h.snapshot().activeTabId).toBe(active);
  });

  it('wirft der Port unerwartet, gilt das als Fehler beim Einschalten: aus, mit Grund „unerwartet“', async () => {
    const h = startWorkspace();
    h.keepAwake.set = () => {
      throw new Error('koffi fehlt');
    };

    h.workspace.updateSettings({ keepAwake: true });
    await settle();

    expect(h.snapshot().settings.keepAwake).toBe(false);
    expect(errorToasts(h).map((t) => t.failure)).toEqual([{ action: 'on', reason: 'other' }]);
  });
});
