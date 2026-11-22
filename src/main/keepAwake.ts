// Port Wachhalten (Ticket 28): Energie-Anforderungen bei Windows über koffi, kein Skript und kein eigener Prozess.
// Eine einzige Anforderung mit dem Grund „THub hält den Rechner wach“; „nur Rechner“ setzt darauf
// PowerRequestSystemRequired, „Rechner und Bildschirm“ zusätzlich PowerRequestDisplayRequired. Endet THub, auf welchem
// Weg auch immer, gibt Windows die Anforderung mit dem Prozess frei.
// Nicht powerSaveBlocker von Electron: Dessen „prevent-app-suspension“ stellt nur PowerRequestExecutionRequired, und das
// hält auf Rechnern mit Modern Standby das System nicht sicher wach (Spezifikation, „Rechner wach halten“).
//
// Lädt nie Electron. koffi wird erst beim ersten Einschalten geladen, wie bei der Prozess-Sonde.

import type { KeepAwake, KeepAwakeLevel } from './workspace/ports';

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

/** Die drei Aufrufe von kernel32, die das Wachhalten braucht. Jeder wirft, wenn Windows einen Fehler meldet. */
export interface PowerRequests {
  /** `PowerCreateRequest` mit einem einfachen Text als Grund; liefert das Handle der Anforderung. */
  create(reason: string): number;
  /** `PowerSetRequest`. */
  set(handle: number, kind: PowerRequestKind): void;
  /** `PowerClearRequest`. */
  clear(handle: number, kind: PowerRequestKind): void;
}

/**
 * Der Port für THub: im Testmodus (`THUB_TEST_HIDDEN=1`) nur eine Zeile in der Ausgabe, sonst echte Anforderungen bei
 * Windows. Auf anderen Systemen als Windows mit 64 Bit hält er nichts wach.
 */
export function createKeepAwake(options: { testMode: boolean }): KeepAwake {
  if (options.testMode) return new TestModeKeepAwake();
  const supported = process.platform === 'win32' && (process.arch === 'x64' || process.arch === 'arm64');
  return supported ? new PowerRequestKeepAwake(loadPowerRequests) : { set: () => {} };
}

/**
 * Hält den Rechner über eine Energie-Anforderung wach. Die Anforderung entsteht beim ersten Einschalten und bleibt bis
 * zum Ende des Prozesses; an- und ausgeschaltet werden nur ihre Arten. Idempotent: Was schon gilt, wird nicht noch einmal
 * gesetzt. Scheitert ein Aufruf, steht der Fehler in der Ausgabe; gesetzt ist dann, was bis dahin geklappt hat, und der
 * nächste Aufruf versucht den Rest erneut.
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
    private readonly logError: (message: string, err: unknown) => void = console.error,
  ) {}

  /** Liefert, wann die Stufe gilt (bzw. der Fehler in der Ausgabe steht); der Kern wartet nicht darauf. */
  set(level: KeepAwakeLevel): Promise<void> {
    this.queue = this.queue.then(() =>
      this.apply(level).catch((err: unknown) => this.logError('Rechner wach halten:', err)),
    );
    return this.queue;
  }

  private async apply(level: KeepAwakeLevel): Promise<void> {
    const wanted = KINDS[level];
    const toSet = wanted.filter((kind) => !this.active.has(kind));
    const toClear = [...this.active].filter((kind) => !wanted.includes(kind));
    // Nichts zu tun, etwa „aus“ beim Start: koffi wird gar nicht erst geladen.
    if (toSet.length === 0 && toClear.length === 0) return;
    const api = await this.loadApi();
    // Erst setzen, dann aufheben: Beim Wechsel der Stufe entsteht keine Lücke.
    for (const kind of toSet) {
      this.handle ??= api.create(POWER_REQUEST_REASON);
      api.set(this.handle, kind);
      this.active.add(kind);
    }
    for (const kind of toClear) {
      if (this.handle !== null) api.clear(this.handle, kind);
      this.active.delete(kind);
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

/** Testmodus: keine Anforderung bei Windows, nur eine Zeile in der Ausgabe, wenn sich die Stufe ändert. */
export class TestModeKeepAwake implements KeepAwake {
  private level: KeepAwakeLevel = 'off';

  constructor(private readonly log: (line: string) => void = console.log) {}

  set(level: KeepAwakeLevel): void {
    if (level === this.level) return;
    this.level = level;
    this.log(TEST_MODE_LINES[level]);
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

  const failed = (call: string): Error => new Error(`${call}: Windows-Fehler ${GetLastError()}`);
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
