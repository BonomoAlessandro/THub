import { describe, expect, it, vi } from 'vitest';
import {
  createKeepAwake,
  loadPowerRequests,
  POWER_REQUEST_REASON,
  PowerRequestKeepAwake,
  TEST_MODE_FAIL_LINE,
  TEST_MODE_LINES,
  TestModeKeepAwake,
  Win32Error,
  type PowerRequestKind,
  type PowerRequests,
} from '../../src/main/keepAwake';
import { KeepAwakeError } from '../../src/main/workspace/ports';

// Port Wachhalten im Hauptprozess (Ticket 28): welche Energie-Anforderungen er bei Windows stellt und aufhebt, mit
// nachgemachten Aufrufen von kernel32; dazu einmal echt gegen Windows und der Testmodus.

/**
 * Nachgemachtes kernel32: zeichnet jeden Aufruf auf; `failNext` lässt den nächsten Aufruf dieser Art scheitern, wie
 * Windows mit Fehler 5 (Zugriff verweigert), `failKind` nur für diese Art.
 */
class FakePowerRequests implements PowerRequests {
  readonly calls: string[] = [];
  failNext: 'create' | 'set' | 'clear' | null = null;
  failKind: PowerRequestKind | null = null;

  create(reason: string): number {
    this.maybeFail('create');
    this.calls.push(`create ${reason}`);
    return 42;
  }

  set(handle: number, kind: PowerRequestKind): void {
    this.maybeFail('set', kind);
    this.calls.push(`set ${handle} ${kind}`);
  }

  clear(handle: number, kind: PowerRequestKind): void {
    this.maybeFail('clear', kind);
    this.calls.push(`clear ${handle} ${kind}`);
  }

  private maybeFail(call: 'create' | 'set' | 'clear', kind?: PowerRequestKind): void {
    if (this.failNext !== call || (this.failKind !== null && this.failKind !== kind)) return;
    this.failNext = null;
    throw new Win32Error(`Power${call}(${kind ?? ''})`, 5);
  }
}

function setup() {
  const api = new FakePowerRequests();
  const load = vi.fn(async () => api);
  const errors: unknown[] = [];
  const port = new PowerRequestKeepAwake(load, (_message, err) => errors.push(err));
  return { api, load, errors, port };
}

describe('Port Wachhalten: Energie-Anforderungen', () => {
  it('„aus“ ohne gesetzte Anforderung tut nichts und lädt koffi gar nicht erst', async () => {
    const { api, load, port } = setup();

    await port.set('off');

    expect(load).not.toHaveBeenCalled();
    expect(api.calls).toEqual([]);
  });

  it('„nur Rechner“ erzeugt die Anforderung mit dem Grund und setzt PowerRequestSystemRequired', async () => {
    const { api, port } = setup();

    await port.set('system');

    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`, 'set 42 system']);
  });

  it('„Rechner und Bildschirm“ setzt zusätzlich PowerRequestDisplayRequired', async () => {
    const { api, port } = setup();

    await port.set('display');

    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`, 'set 42 system', 'set 42 display']);
  });

  it('beim Wechsel der Stufe wird nur geändert, was sich ändert; die Anforderung bleibt dieselbe', async () => {
    const { api, load, port } = setup();

    await port.set('system');
    await port.set('display');
    await port.set('system');
    await port.set('off');
    await port.set('display');
    await port.set('off');

    expect(api.calls).toEqual([
      `create ${POWER_REQUEST_REASON}`,
      'set 42 system',
      'set 42 display',
      'clear 42 display',
      'clear 42 system',
      'set 42 system',
      'set 42 display',
      'clear 42 system',
      'clear 42 display',
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ist idempotent: dieselbe Stufe zweimal ergibt keinen weiteren Aufruf', async () => {
    const { api, port } = setup();

    await port.set('display');
    await port.set('display');
    await port.set('off');
    await port.set('off');

    expect(api.calls).toEqual([
      `create ${POWER_REQUEST_REASON}`,
      'set 42 system',
      'set 42 display',
      'clear 42 system',
      'clear 42 display',
    ]);
  });

  it('Aufrufe direkt nacheinander laufen in ihrer Reihenfolge', async () => {
    const { api, port } = setup();

    void port.set('system');
    void port.set('display');
    await port.set('off');

    expect(api.calls.slice(1)).toEqual(['set 42 system', 'set 42 display', 'clear 42 system', 'clear 42 display']);
  });

  it('scheitert das Setzen, weist er mit Phase, Grund und Fehlercode zurück, und der nächste Aufruf versucht es erneut', async () => {
    const { api, port } = setup();

    api.failNext = 'set';
    const failed = port.set('system');
    await expect(failed).rejects.toBeInstanceOf(KeepAwakeError);
    await expect(failed).rejects.toMatchObject({ phase: 'set', reason: 'windows', code: 5 });
    expect(port.activeKinds()).toEqual([]);

    await port.set('system');
    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`, 'set 42 system']);
    expect(port.activeKinds()).toEqual(['system']);
  });

  it('scheitert „Bildschirm“ nach „Rechner“, ist danach nichts mehr gesetzt', async () => {
    const { api, port } = setup();

    api.failNext = 'set';
    api.failKind = 'display';
    await expect(port.set('display')).rejects.toMatchObject({ phase: 'set', reason: 'windows', code: 5 });

    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`, 'set 42 system', 'clear 42 system']);
    expect(port.activeKinds()).toEqual([]);
  });

  it('scheitert ein Wechsel der Stufe bei eingeschaltetem Wachhalten, ist danach nichts mehr gesetzt', async () => {
    const { api, port } = setup();
    await port.set('system');

    api.failNext = 'set';
    await expect(port.set('display')).rejects.toMatchObject({ phase: 'set' });

    expect(api.calls.slice(-1)).toEqual(['clear 42 system']);
    expect(port.activeKinds()).toEqual([]);
  });

  it('scheitert das Aufheben, weist er mit Phase „clear“ zurück, die Art bleibt gesetzt, und der nächste Versuch hebt auf', async () => {
    const { api, port } = setup();
    await port.set('display');

    api.failNext = 'clear';
    api.failKind = 'display';
    await expect(port.set('system')).rejects.toMatchObject({ phase: 'clear', reason: 'windows', code: 5 });
    expect(port.activeKinds()).toEqual(['system', 'display']);

    await port.set('system');
    expect(port.activeKinds()).toEqual(['system']);
  });

  it('lässt sich koffi nicht laden, weist er mit Grund „load“ zurück, und der nächste Aufruf lädt neu', async () => {
    const api = new FakePowerRequests();
    const load = vi.fn<() => Promise<PowerRequests>>().mockRejectedValueOnce(new Error('koffi fehlt'));
    load.mockResolvedValue(api);
    const port = new PowerRequestKeepAwake(load);

    await expect(port.set('system')).rejects.toMatchObject({ phase: 'set', reason: 'load' });

    await port.set('system');
    expect(load).toHaveBeenCalledTimes(2);
    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`, 'set 42 system']);
  });

  it('nach einem Fehler laufen die folgenden Aufrufe weiter', async () => {
    const { api, port } = setup();

    api.failNext = 'create';
    const first = port.set('system');
    const second = port.set('display');

    await expect(first).rejects.toMatchObject({ phase: 'set', reason: 'windows' });
    await second;
    expect(port.activeKinds()).toEqual(['system', 'display']);
  });
});

describe('Port Wachhalten: Testmodus', () => {
  it('schreibt bei jeder Änderung eine Zeile in die Ausgabe und stellt keine Anforderung', () => {
    const lines: string[] = [];
    const port = new TestModeKeepAwake((line) => lines.push(line));

    port.set('off');
    port.set('system');
    port.set('system');
    port.set('display');
    port.set('off');

    expect(lines).toEqual([
      'Testmodus: THub würde jetzt den Rechner wach halten.',
      'Testmodus: THub würde jetzt den Rechner und den Bildschirm wach halten.',
      'Testmodus: THub würde jetzt nichts mehr wach halten.',
    ]);
  });

  it('mit THUB_TEST_KEEPAWAKE_FAIL scheitert jedes Einschalten wie eine abgelehnte Anforderung; die Stufe bleibt „aus“', async () => {
    const lines: string[] = [];
    const port = new TestModeKeepAwake((line) => lines.push(line), true);

    await expect(port.set('display')).rejects.toMatchObject({ phase: 'set', reason: 'windows', code: 5 });
    await port.set('off');

    expect(lines).toEqual([TEST_MODE_FAIL_LINE]);
  });

  it('createKeepAwake im Testmodus liefert den Testmodus', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    createKeepAwake({ testMode: true }).set('display');

    expect(log).toHaveBeenCalledWith(TEST_MODE_LINES.display);
    log.mockRestore();
  });
});

describe.runIf(process.platform === 'win32')('Port Wachhalten: echt gegen Windows', () => {
  it('„nur Rechner“, dann „Rechner und Bildschirm“, dann aus: Windows meldet bei keinem Aufruf einen Fehler', async () => {
    const real = await loadPowerRequests();
    const calls: string[] = [];
    const recorded: PowerRequests = {
      create: (reason) => {
        calls.push('create');
        return real.create(reason);
      },
      set: (handle, kind) => {
        calls.push(`set ${kind}`);
        real.set(handle, kind);
      },
      clear: (handle, kind) => {
        calls.push(`clear ${kind}`);
        real.clear(handle, kind);
      },
    };
    const errors: unknown[] = [];
    const port = new PowerRequestKeepAwake(async () => recorded, (_message, err) => errors.push(err));

    await port.set('system');
    await port.set('display');
    await port.set('off');

    expect(errors).toEqual([]);
    expect(calls).toEqual(['create', 'set system', 'set display', 'clear system', 'clear display']);
  });

  it('ein ungültiges Handle meldet Windows als Fehler', async () => {
    const real = await loadPowerRequests();

    expect(() => real.set(0, 'system')).toThrow(/PowerSetRequest\(system\): Windows-Fehler \d+/);
  });
});
