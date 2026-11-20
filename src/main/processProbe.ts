// Prozess-Sonde für Windows (Ticket 13): pro Abfrage ein einziger asynchroner Aufruf von
// NtQuerySystemInformation(SystemProcessInformation) über koffi. Er liefert für alle Prozesse Prozess-ID,
// Eltern-ID, Programmname und Startzeit, ohne einen Prozess zu starten und ohne Prozess-Handles zu öffnen; der
// Systemaufruf läuft in einem Hilfs-Thread von koffi, im Hauptthread bleibt nur das Auswerten des Puffers.
// Nur der Konsolen-Host (für Git-Bash-Shells und Waisen) braucht ein Handle auf den einzelnen Prozess, ebenso das
// gezielte Beenden einzelner Prozesse (Ticket 15).
// Befunde und Messungen: docs/spikes/prozess-sonde.md; Referenz: spikes/prozess-sonde/probes/ntqsi.js.
//
// Lädt nie Electron. koffi wird erst bei der ersten Abfrage geladen; esbuild bündelt es nicht (external), im
// Paket liegt die Binärdatei ausserhalb des asar-Archivs (asarUnpack).

import type { ProcessInfo, ProcessProbe } from './workspace/ports';

/** Klasse `SystemProcessInformation` von NtQuerySystemInformation. */
const SYSTEM_PROCESS_INFORMATION = 5;
/** Klasse `ProcessConsoleHostProcess` von NtQueryInformationProcess. */
const PROCESS_CONSOLE_HOST_PROCESS = 49;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const PROCESS_TERMINATE = 0x0001;
const STATUS_INFO_LENGTH_MISMATCH = 0xc0000004 | 0;
/** Startgrösse des Puffers; er wächst, wenn er nicht reicht (rund 600 Prozesse mit 8600 Threads: etwa 0,8 MB). */
const INITIAL_BUFFER_BYTES = 1 << 20;
/** FILETIME (100 ns seit 1601, UTC) des 1.1.1970. */
const FILETIME_UNIX_EPOCH = 116444736000000000n;

/**
 * Lage der Felder in `SYSTEM_PROCESS_INFORMATION` auf 64 Bit (x64 und arm64), wie in `winternl.h` (dort heisst die
 * Eltern-ID `Reserved2`). Auf jeden Eintrag folgen seine Threads; `next` ist der Abstand zum nächsten Eintrag.
 */
const LAYOUT = {
  next: 0x00,
  createTime: 0x20,
  /** `UNICODE_STRING ImageName`: Länge in Bytes, Zeiger auf den Namen (zeigt in denselben Puffer). */
  nameLength: 0x38,
  namePointer: 0x40,
  pid: 0x50,
  ppid: 0x58,
  /** Grösse des festen Teils eines Eintrags. */
  size: 0x100,
} as const;

/**
 * Liest die Prozessliste aus dem Puffer von NtQuerySystemInformation(SystemProcessInformation).
 * @param base Adresse des Puffers im Speicher; damit werden die Namenszeiger zu Versätzen im Puffer
 */
export function parseProcessInformation(buf: Buffer, base: bigint): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  let off = 0;
  while (off + LAYOUT.size <= buf.length) {
    processes.push({
      pid: Number(buf.readBigUInt64LE(off + LAYOUT.pid)),
      ppid: Number(buf.readBigUInt64LE(off + LAYOUT.ppid)),
      name: readName(buf, base, off),
      startTime: fileTimeToMs(buf.readBigInt64LE(off + LAYOUT.createTime)),
    });
    const next = buf.readUInt32LE(off + LAYOUT.next);
    if (next === 0) break;
    off += next;
  }
  return processes;
}

/** Programmname eines Eintrags; leer, wenn er fehlt (Leerlaufprozess) oder nicht im Puffer liegt. */
function readName(buf: Buffer, base: bigint, off: number): string {
  const length = buf.readUInt16LE(off + LAYOUT.nameLength);
  if (length === 0) return '';
  const at = buf.readBigUInt64LE(off + LAYOUT.namePointer) - base;
  if (at < 0n || at + BigInt(length) > BigInt(buf.length)) return '';
  return buf.toString('utf16le', Number(at), Number(at) + length);
}

/**
 * FILETIME in Millisekunden seit 1970, mit Bruchteilen. Eine Zahl in JavaScript löst heutige Zeitpunkte auf etwa
 * eine Viertelmikrosekunde auf; das reicht, um Prozesse auseinanderzuhalten und Start-Reihenfolgen zu vergleichen.
 */
export function fileTimeToMs(fileTime: bigint): number {
  const ticks = fileTime - FILETIME_UNIX_EPOCH;
  // Ganze Millisekunden und Rest getrennt, sonst rundete schon die Umwandlung der grossen Zahl.
  return Number(ticks / 10_000n) + Number(ticks % 10_000n) / 10_000;
}

/** Die Funktionen aus ntdll und kernel32, die die Sonde braucht. */
interface NativeApi {
  /** Füllt den Puffer; liefert den NTSTATUS und die nötige Grösse. */
  querySystemProcesses(buf: Buffer): Promise<{ status: number; needed: number }>;
  /** Adresse eines Puffers im Speicher. */
  address(buf: Buffer): bigint;
  consoleHost(pid: number): number | null;
  /** Beendet den Prozess, wenn er noch dieselbe Startzeit hat; liefert, ob er beendet wurde. */
  terminate(pid: number, startTime: number): boolean;
}

/**
 * Die echte Sonde. Auf anderen Systemen als Windows mit 64 Bit liefert sie keine Prozesse und beendet keine. Lässt
 * sich koffi nicht laden, meldet die erste Abfrage den Fehler, und die Sonde liefert danach keine Prozesse mehr.
 */
export function createProcessProbe(): ProcessProbe {
  const supported = process.platform === 'win32' && (process.arch === 'x64' || process.arch === 'arm64');
  return supported
    ? new NtProcessProbe()
    : { snapshot: () => Promise.resolve([]), consoleHost: () => null, terminate: () => {} };
}

class NtProcessProbe implements ProcessProbe {
  private api: Promise<NativeApi> | null = null;
  private loaded: NativeApi | null = null;
  private buffer = Buffer.alloc(INITIAL_BUFFER_BYTES);
  private bufferAddress: bigint | null = null;
  /** Die laufende Abfrage: Der Puffer gehört ihr, bis sie fertig ist. */
  private running: Promise<ProcessInfo[]> | null = null;

  snapshot(): Promise<ProcessInfo[]> {
    this.running ??= this.query().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  consoleHost(pid: number): number | null {
    return this.loaded?.consoleHost(pid) ?? null;
  }

  /**
   * Öffnet jeden Prozess einzeln, prüft seine Startzeit und beendet ihn (Exit-Code 1). Meist ist koffi von der Abfrage
   * davor schon geladen; sonst wird nach dem Laden beendet.
   */
  terminate(processes: ProcessInfo[]): void {
    if (processes.length === 0) return;
    const run = (api: NativeApi): void => {
      for (const p of processes) api.terminate(p.pid, p.startTime);
    };
    if (this.loaded) {
      run(this.loaded);
      return;
    }
    this.load().then(run, (err: unknown) => console.error('Prozesse konnten nicht beendet werden:', err));
  }

  private load(): Promise<NativeApi> {
    this.api ??= loadNativeApi().then((api) => {
      this.loaded = api;
      return api;
    });
    return this.api;
  }

  private async query(): Promise<ProcessInfo[]> {
    const api = await this.load();
    for (;;) {
      const { status, needed } = await api.querySystemProcesses(this.buffer);
      if (status === STATUS_INFO_LENGTH_MISMATCH) {
        // Zwischen zwei Aufrufen können Prozesse dazukommen: mit etwas Reserve wachsen.
        this.buffer = Buffer.alloc(Math.max(this.buffer.length * 2, Math.ceil(needed * 1.25)));
        this.bufferAddress = null;
        continue;
      }
      if (status < 0) throw new Error(`NtQuerySystemInformation: 0x${(status >>> 0).toString(16)}`);
      this.bufferAddress ??= api.address(this.buffer);
      return parseProcessInformation(this.buffer, this.bufferAddress);
    }
  }
}

async function loadNativeApi(): Promise<NativeApi> {
  const imported = await import('koffi');
  // Je nach Lader (esbuild-Bündel mit require, Vitest mit import) steckt das Modul in `default` oder ist es selbst.
  const koffi = imported.default ?? (imported as unknown as typeof imported.default);
  const ntdll = koffi.load('ntdll.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const NtQuerySystemInformation = ntdll.func(
    'int32_t __stdcall NtQuerySystemInformation(int32_t cls, void *buf, uint32_t len, _Out_ uint32_t *retLen)',
  );
  const NtQueryInformationProcess = ntdll.func(
    'int32_t __stdcall NtQueryInformationProcess(void *h, int32_t cls, _Out_ uint64_t *info, uint32_t len, void *retLen)',
  );
  // memmove(buf, buf, 0) liefert die Adresse des Puffers; koffi.view() ist in Electron nicht erlaubt.
  const memmove = ntdll.func('void *memmove(void *dst, const void *src, size_t n)');
  const OpenProcess = kernel32.func('void *__stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)');
  const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *h)');
  // Die vier FILETIME als 64-Bit-Zahlen: Start, Ende, Kernel- und Benutzerzeit.
  const GetProcessTimes = kernel32.func(
    'int __stdcall GetProcessTimes(void *h, _Out_ int64_t *creation, _Out_ int64_t *exit, _Out_ int64_t *kernel, _Out_ int64_t *user)',
  );
  const TerminateProcess = kernel32.func('int __stdcall TerminateProcess(void *h, uint32_t exitCode)');

  return {
    querySystemProcesses: (buf) =>
      new Promise((resolve, reject) => {
        const needed = [0];
        NtQuerySystemInformation.async(
          SYSTEM_PROCESS_INFORMATION,
          buf,
          buf.length,
          needed,
          (err: unknown, status: number) => (err ? reject(err) : resolve({ status, needed: needed[0] })),
        );
      }),
    address: (buf) => BigInt(memmove(buf, buf, 0)),
    consoleHost(pid) {
      const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
      if (!handle) return null;
      try {
        const info = [0n];
        const status = NtQueryInformationProcess(handle, PROCESS_CONSOLE_HOST_PROCESS, info, 8, null);
        // Die unteren zwei Bits sind Kennzeichen, keine Teile der Prozess-ID.
        return status < 0 ? null : Number(BigInt(info[0]) & ~3n) || null;
      } finally {
        CloseHandle(handle);
      }
    },
    terminate(pid, startTime) {
      // Das Handle hält die Prozess-ID fest: Zwischen Prüfen und Beenden kann sie nicht neu vergeben werden.
      const handle = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
      if (!handle) return false;
      try {
        const creation = [0n];
        if (!GetProcessTimes(handle, creation, [0n], [0n], [0n])) return false;
        if (fileTimeToMs(BigInt(creation[0])) !== startTime) return false;
        return TerminateProcess(handle, 1) !== 0;
      } finally {
        CloseHandle(handle);
      }
    },
  };
}
