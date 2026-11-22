// Port Wachhalten (Ticket 28): Energie-Anforderungen bei Windows über koffi, kein Skript und kein eigener Prozess.
// Eine einzige Anforderung mit dem Grund „THub hält den Rechner wach“; „nur Rechner“ setzt darauf
// PowerRequestSystemRequired, „Rechner und Bildschirm“ zusätzlich PowerRequestDisplayRequired. Endet THub, auf welchem
// Weg auch immer, gibt Windows die Anforderung mit dem Prozess frei.
// Nicht powerSaveBlocker von Electron: Dessen „prevent-app-suspension“ stellt nur PowerRequestExecutionRequired, und das
// hält auf Rechnern mit Modern Standby das System nicht sicher wach (Spezifikation, „Rechner wach halten“).
// Scheitert etwas, meldet der Port es dem Kern (Ticket 31), statt still weiterzumachen.
//
// Lädt nie Electron. koffi wird erst beim ersten Einschalten geladen, wie bei der Prozess-Sonde.

import { KeepAwakeError, type KeepAwake, type KeepAwakeLevel } from './workspace/ports';

/** Der Grund der Anforderung, so wie ihn `powercfg /requests` zeigt. */
export const POWER_REQUEST_REASON = 'THub hält den Rechner wach';

/** Eine Art der Energie-Anforderung, die THub setzt. */
export type PowerRequestKind = 'display' | 'system';

/** `POWER_REQUEST_TYPE` aus winnt.h. */
const POWER_REQUEST_TYPE: Record<PowerRequestKind, number> = { display: 0, system: 1 };
/** `POWER_REQUEST_CONTEXT_VERSION` und `POWER_REQUEST_CONTEXT_SIMPLE_STRING` aus winnt.h. */
const POWER_REQUEST_CONTEXT_VERSION = 0;
const POWER_REQUEST_CONTEXT_SIMPLE_STRING = 0x1;
const INVALID_HANDLE_VALUE = -1;
/** `ERROR_ACCESS_DENIED`: der feste Grund, mit dem der Testmodus scheitert. */
const ERROR_ACCESS_DENIED = 5;

/** Welche Arten jede Stufe braucht; „Rechner und Bildschirm“ hält auch den Rechner selbst wach. */
const KINDS: Record<KeepAwakeLevel, readonly PowerRequestKind[]> = {
  off: [],
  system: ['system'],
  display: ['system', 'display'],
};

/** Die Zeilen in der Ausgabe im Testmodus, je Stufe. */
export const TEST_MODE_LINES: Record<KeepAwakeLevel, string> = {
  system: 'Testmodus: THub würde jetzt den Rechner wach halten.',
  display: 'Testmodus: THub würde jetzt den Rechner und den Bildschirm wach halten.',
  off: 'Testmodus: THub würde jetzt nichts mehr wach halten.',
};
/** Die Zeile, wenn der Testmodus mit `THUB_TEST_KEEPAWAKE_FAIL=1` scheitern soll. */
export const TEST_MODE_FAIL_LINE = 'Testmodus: Die Anforderung scheitert (THUB_TEST_KEEPAWAKE_FAIL).';

/** Ein Aufruf von kernel32 meldete einen Fehler; `code` ist der Fehlercode von Windows (`GetLastError`). */
export class Win32Error extends Error {
  constructor(
    call: string,
    readonly code: number,
  ) {
    super(`${call}: Windows-Fehler ${code}`);
    this.name = 'Win32Error';
  }
}

/** Die drei Aufrufe von kernel32, die das Wachhalten braucht. Jeder wirft einen `Win32Error`, wenn Windows ablehnt. */
export interface PowerRequests {
  /** `PowerCreateRequest` mit einem einfachen Text als Grund; liefert das Handle der Anforderung. */
  create(reason: string): number;
  /** `PowerSetRequest`. */
  set(handle: number, kind: PowerRequestKind): void;
  /** `PowerClearRequest`. */
  clear(handle: number, kind: PowerRequestKind): void;
}

/**
 * Der Port für THub: im Testmodus (`THUB_TEST_HIDDEN=1`) nur eine Zeile in der Ausgabe, mit `failInTestMode` dazu ein
 * Fehler bei jedem Einschalten; sonst echte Anforderungen bei Windows. Auf anderen Systemen als Windows mit 64 Bit
 * scheitert jedes Einschalten mit „nicht unterstützt“.
 */
export function createKeepAwake(options: { testMode: boolean; failInTestMode?: boolean }): KeepAwake {
  if (options.testMode) return new TestModeKeepAwake(console.log, options.failInTestMode ?? false);
  const supported = process.platform === 'win32' && (process.arch === 'x64' || process.arch === 'arm64');
  return supported ? new PowerRequestKeepAwake(loadPowerRequests) : new UnsupportedKeepAwake();
}

/**
 * Hält den Rechner über eine Energie-Anforderung wach. Die Anforderung entsteht beim ersten Einschalten und bleibt bis
 * zum Ende des Prozesses; an- und ausgeschaltet werden nur ihre Arten. Idempotent: Was schon gilt, wird nicht noch einmal
 * gesetzt.
 *
 * Fehler (Ticket 31): Scheitert das Setzen einer Art, hebt der Port alles auf, was gesetzt ist, und weist mit
 * `phase: 'set'` zurück; danach hält er nichts wach. Scheitert das Aufheben, bleibt die Art gesetzt, und er weist mit
 * `phase: 'clear'` zurück. Der nächste Aufruf versucht es erneut.
 */
export class PowerRequestKeepAwake implements KeepAwake {
  private api: Promise<PowerRequests> | null = null;
  private handle: number | null = null;
  /** Die Arten, die gerade gesetzt sind. */
  private readonly active = new Set<PowerRequestKind>();
  /** Die Aufrufe laufen nacheinander in der Reihenfolge, in der sie kamen (koffi lädt asynchron). */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly load: () => Promise<PowerRequests>,
    /** Für Fehler beim Aufräumen nach einem Fehler; der eigentliche Fehler geht an den Kern. */
    private readonly logError: (message: string, err: unknown) => void = console.error,
  ) {}

  /** Erfüllt sich, sobald die Stufe gilt; weist mit einem `KeepAwakeError` zurück, wenn nicht. */
  set(level: KeepAwakeLevel): Promise<void> {
    const run = this.queue.then(() => this.apply(level));
    // Die Kette läuft auch nach einem Fehler weiter; den Fehler bekommt nur, wer diesen Aufruf gemacht hat.
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Die Arten, die gerade gesetzt sind (für Tests). */
  activeKinds(): PowerRequestKind[] {
    return [...this.active];
  }

  private async apply(level: KeepAwakeLevel): Promise<void> {
    const wanted = KINDS[level];
    const toSet = wanted.filter((kind) => !this.active.has(kind));
    const toClear = [...this.active].filter((kind) => !wanted.includes(kind));
    // Nichts zu tun, etwa „aus“ beim Start: koffi wird gar nicht erst geladen.
    if (toSet.length === 0 && toClear.length === 0) return;
    let api: PowerRequests;
    try {
      api = await this.loadApi();
    } catch (err) {
      throw failure(toSet.length > 0 ? 'set' : 'clear', err, 'koffi lässt sich nicht laden');
    }
    // Erst setzen, dann aufheben: Beim Wechsel der Stufe entsteht keine Lücke.
    for (const kind of toSet) {
      try {
        this.handle ??= api.create(POWER_REQUEST_REASON);
        api.set(this.handle, kind);
        this.active.add(kind);
      } catch (err) {
        // Nichts halb eingeschaltet lassen: Nach einem Fehler hält der Port gar nichts mehr wach.
        this.clearAll(api);
        throw failure('set', err);
      }
    }
    for (const kind of toClear) {
      try {
        if (this.handle !== null) api.clear(this.handle, kind);
        this.active.delete(kind);
      } catch (err) {
        throw failure('clear', err);
      }
    }
  }

  /** Hebt alle gesetzten Arten auf, so weit es geht; was sich nicht aufheben lässt, steht in der Ausgabe. */
  private clearAll(api: PowerRequests): void {
    for (const kind of [...this.active]) {
      try {
        if (this.handle !== null) api.clear(this.handle, kind);
        this.active.delete(kind);
      } catch (err) {
        this.logError(`Rechner wach halten: ${kind} liess sich nach einem Fehler nicht aufheben:`, err);
      }
    }
  }

  /** Lädt koffi einmal; scheitert das, versucht es der nächste Aufruf erneut. */
  private loadApi(): Promise<PowerRequests> {
    this.api ??= this.load().catch((err: unknown) => {
      this.api = null;
      throw err;
    });
    return this.api;
  }
}

/** Macht aus einem Fehler eines Aufrufs den Fehler des Ports, mit Phase und Grund. */
function failure(phase: 'set' | 'clear', err: unknown, loadMessage?: string): KeepAwakeError {
  if (err instanceof Win32Error) return new KeepAwakeError(err.message, phase, 'windows', err.code);
  const detail = err instanceof Error ? err.message : String(err);
  if (loadMessage) return new KeepAwakeError(`${loadMessage}: ${detail}`, phase, 'load');
  return new KeepAwakeError(detail, phase, 'other');
}

/** Andere Systeme als Windows mit 64 Bit: Einschalten scheitert mit „nicht unterstützt“, Ausschalten gelingt. */
class UnsupportedKeepAwake implements KeepAwake {
  set(level: KeepAwakeLevel): Promise<void> {
    if (level === 'off') return Promise.resolve();
    return Promise.reject(
      new KeepAwakeError(`Wachhalten wird auf ${process.platform}/${process.arch} nicht unterstützt`, 'set', 'unsupported'),
    );
  }
}

/**
 * Testmodus: keine Anforderung bei Windows, nur eine Zeile in der Ausgabe, wenn sich die Stufe ändert. Mit `fail`
 * scheitert jedes Einschalten wie eine abgelehnte Anforderung (Windows-Fehler 5), damit sich der Fehler-Hinweis prüfen
 * lässt; die Stufe bleibt dann „aus“.
 */
export class TestModeKeepAwake implements KeepAwake {
  private level: KeepAwakeLevel = 'off';

  constructor(
    private readonly log: (line: string) => void = console.log,
    private readonly fail = false,
  ) {}

  set(level: KeepAwakeLevel): Promise<void> {
    if (level === this.level) return Promise.resolve();
    if (this.fail && level !== 'off') {
      this.log(TEST_MODE_FAIL_LINE);
      this.level = 'off';
      const err = new Win32Error(`PowerSetRequest(${level === 'display' ? 'display' : 'system'})`, ERROR_ACCESS_DENIED);
      return Promise.reject(failure('set', err));
    }
    this.level = level;
    this.log(TEST_MODE_LINES[level]);
    return Promise.resolve();
  }
}

/** Die echten Aufrufe in kernel32 über koffi. */
export async function loadPowerRequests(): Promise<PowerRequests> {
  const imported = await import('koffi');
  // Je nach Lader (esbuild-Bündel mit require, Vitest mit import) steckt das Modul in `default` oder ist es selbst.
  const koffi = imported.default ?? (imported as unknown as typeof imported.default);
  const kernel32 = koffi.load('kernel32.dll');
  // REASON_CONTEXT: Version, Kennzeichen und als Union der Grund; THub nutzt nur den einfachen Text. Die zweite
  // Variante der Union gibt ihr die Grösse wie in winnt.h.
  const ReasonContext = koffi.struct({
    Version: 'uint32_t',
    Flags: 'uint32_t',
    Reason: koffi.union({
      Detailed: koffi.struct({
        LocalizedReasonModule: 'void *',
        LocalizedReasonId: 'uint32_t',
        ReasonStringCount: 'uint32_t',
        ReasonStrings: 'void *',
      }),
      SimpleReasonString: 'str16',
    }),
  });
  // Das Handle als Zahl in Zeigerbreite: So lässt sich INVALID_HANDLE_VALUE (-1) erkennen.
  const PowerCreateRequest = kernel32.func('__stdcall', 'PowerCreateRequest', 'intptr_t', [koffi.pointer(ReasonContext)]);
  const PowerSetRequest = kernel32.func('__stdcall', 'PowerSetRequest', 'int', ['intptr_t', 'int']);
  const PowerClearRequest = kernel32.func('__stdcall', 'PowerClearRequest', 'int', ['intptr_t', 'int']);
  const GetLastError = kernel32.func('__stdcall', 'GetLastError', 'uint32_t', []);

  const failed = (call: string): Win32Error => new Win32Error(call, GetLastError());
  return {
    create(reason) {
      const handle = Number(
        PowerCreateRequest({
          Version: POWER_REQUEST_CONTEXT_VERSION,
          Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
          Reason: { SimpleReasonString: reason },
        }),
      );
      if (handle === INVALID_HANDLE_VALUE || handle === 0) throw failed('PowerCreateRequest');
      return handle;
    },
    set(handle, kind) {
      if (!PowerSetRequest(handle, POWER_REQUEST_TYPE[kind])) throw failed(`PowerSetRequest(${kind})`);
    },
    clear(handle, kind) {
      if (!PowerClearRequest(handle, POWER_REQUEST_TYPE[kind])) throw failed(`PowerClearRequest(${kind})`);
    },
  };
}
