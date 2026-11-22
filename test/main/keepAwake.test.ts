import { describe, expect, it, vi } from 'vitest';
import {
  createKeepAwake,
  loadPowerRequests,
  POWER_REQUEST_REASON,
  PowerRequestKeepAwake,
  TEST_MODE_LINES,
  TestModeKeepAwake,
  type PowerRequestKind,
  type PowerRequests,
} from '../../src/main/keepAwake';

// Port Wachhalten im Hauptprozess (Ticket 28): welche Energie-Anforderungen er bei Windows stellt und aufhebt, mit
// nachgemachten Aufrufen von kernel32; dazu einmal echt gegen Windows und der Testmodus.

/** Nachgemachtes kernel32: zeichnet jeden Aufruf auf; `failNext` lässt den nächsten Aufruf dieser Art scheitern. */
class FakePowerRequests implements PowerRequests {
  readonly calls: string[] = [];
  failNext: 'create' | 'set' | 'clear' | null = null;

  create(reason: string): number {
    this.maybeFail('create');
    this.calls.push(`create ${reason}`);
    return 42;
  }

  set(handle: number, kind: PowerRequestKind): void {
    this.maybeFail('set');
    this.calls.push(`set ${handle} ${kind}`);
  }

  clear(handle: number, kind: PowerRequestKind): void {
    this.maybeFail('clear');
    this.calls.push(`clear ${handle} ${kind}`);
  }

  private maybeFail(call: 'create' | 'set' | 'clear'): void {
    if (this.failNext !== call) return;
    this.failNext = null;
    throw new Error(`${call} gescheitert`);
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

  it('scheitert ein Aufruf, steht der Fehler in der Ausgabe, und der nächste versucht es erneut', async () => {
    const { api, errors, port } = setup();

    api.failNext = 'set';
    await port.set('system');
    expect(errors).toHaveLength(1);
    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`]);

    await port.set('system');
    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`, 'set 42 system']);
  });

  it('lässt sich koffi nicht laden, steht der Fehler in der Ausgabe, und der nächste Aufruf lädt neu', async () => {
    const api = new FakePowerRequests();
    const load = vi.fn<() => Promise<PowerRequests>>().mockRejectedValueOnce(new Error('koffi fehlt'));
    load.mockResolvedValue(api);
    const errors: unknown[] = [];
    const port = new PowerRequestKeepAwake(load, (_message, err) => errors.push(err));

    await port.set('system');
    expect(errors).toEqual([new Error('koffi fehlt')]);

    await port.set('system');
    expect(load).toHaveBeenCalledTimes(2);
    expect(api.calls).toEqual([`create ${POWER_REQUEST_REASON}`, 'set 42 system']);
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
