import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createProcessProbe, fileTimeToMs, parseProcessInformation } from '../../src/main/processProbe';

// Prozess-Sonde für Windows (Ticket 13): Auswerten des Puffers von NtQuerySystemInformation(SystemProcessInformation)
// an gebauten und an einem aufgenommenen Puffer, dazu eine echte Abfrage über koffi, wo Windows mit 64 Bit läuft.

/** Lage der Felder in SYSTEM_PROCESS_INFORMATION auf 64 Bit (winternl.h); ein Thread-Eintrag hat 0x50 Bytes. */
const ENTRY = 0x100;
const THREAD = 0x50;

interface Entry {
  pid: number;
  ppid: number;
  name: string;
  createTime: bigint;
  threads?: number;
  /** Namenszeiger absichtlich ausserhalb des Puffers. */
  badPointer?: boolean;
}

/** Baut einen Puffer, wie ihn der Kernel füllt: Eintrag, seine Threads, dann der Name (UTF-16) im selben Puffer. */
function buildBuffer(entries: Entry[], base: bigint): Buffer {
  const parts = entries.map((e) => {
    const name = Buffer.from(e.name, 'utf16le');
    const nameAt = ENTRY + (e.threads ?? 0) * THREAD;
    const size = Math.ceil((nameAt + name.length + 2) / 8) * 8;
    return { e, name, nameAt, size };
  });
  const buf = Buffer.alloc(parts.reduce((sum, p) => sum + p.size, 0));
  let off = 0;
  parts.forEach(({ e, name, nameAt, size }, i) => {
    buf.writeUInt32LE(i === parts.length - 1 ? 0 : size, off);
    buf.writeUInt32LE(e.threads ?? 0, off + 0x04);
    buf.writeBigInt64LE(e.createTime, off + 0x20);
    buf.writeUInt16LE(name.length, off + 0x38);
    buf.writeUInt16LE(name.length + 2, off + 0x3a);
    const pointer = e.badPointer ? base + BigInt(buf.length + 4096) : base + BigInt(off + nameAt);
    buf.writeBigUInt64LE(name.length ? pointer : 0n, off + 0x40);
    buf.writeBigUInt64LE(BigInt(e.pid), off + 0x50);
    buf.writeBigUInt64LE(BigInt(e.ppid), off + 0x58);
    // Felder, die die Sonde nicht liest, mit Mustern füllen: Sie dürfen nichts verfälschen.
    buf.fill(0xab, off + 0x60, off + ENTRY);
    buf.fill(0xcd, off + ENTRY, off + nameAt);
    name.copy(buf, off + nameAt);
    off += size;
  });
  return buf;
}

/** FILETIME zu einem Zeitpunkt in Millisekunden seit 1970, plus `extra` Einheiten zu 100 ns. */
function fileTime(ms: number, extra = 0n): bigint {
  return BigInt(ms) * 10_000n + 116444736000000000n + extra;
}

const T = Date.UTC(2026, 10, 19, 8, 0, 0);

describe('Prozess-Sonde: Puffer auswerten', () => {
  it('liest Prozess-ID, Eltern-ID, Name und Startzeit jedes Eintrags, über Threads und andere Felder hinweg', () => {
    const base = 0x7ff6_1234_0000n;
    const buf = buildBuffer(
      [
        { pid: 0, ppid: 0, name: '', createTime: fileTime(T - 86_400_000), threads: 20 },
        { pid: 4, ppid: 0, name: 'System', createTime: fileTime(T - 86_400_000), threads: 300 },
        { pid: 19996, ppid: 29248, name: 'pwsh.exe', createTime: fileTime(T + 102), threads: 23 },
        { pid: 4_294_967_292, ppid: 19996, name: 'Prüfung Ä.exe', createTime: fileTime(T + 2499), threads: 1 },
      ],
      base,
    );

    expect(parseProcessInformation(buf, base)).toEqual([
      { pid: 0, ppid: 0, name: '', startTime: T - 86_400_000 },
      { pid: 4, ppid: 0, name: 'System', startTime: T - 86_400_000 },
      { pid: 19996, ppid: 29248, name: 'pwsh.exe', startTime: T + 102 },
      { pid: 4_294_967_292, ppid: 19996, name: 'Prüfung Ä.exe', startTime: T + 2499 },
    ]);
  });

  it('ein Namenszeiger ausserhalb des Puffers ergibt einen leeren Namen statt eines Fehlers', () => {
    const base = 0x2_0000_0000n;
    const buf = buildBuffer([{ pid: 8, ppid: 4, name: 'x.exe', createTime: fileTime(T), badPointer: true }], base);

    expect(parseProcessInformation(buf, base)).toEqual([{ pid: 8, ppid: 4, name: '', startTime: T }]);
  });

  it('hört am Ende des Puffers auf, auch wenn ein Eintrag weiter verweist', () => {
    const base = 0x1000n;
    const buf = buildBuffer([{ pid: 8, ppid: 4, name: 'a.exe', createTime: fileTime(T) }], base);
    buf.writeUInt32LE(buf.length, 0);

    expect(parseProcessInformation(buf, base)).toHaveLength(1);
  });

  it('FILETIME in Millisekunden seit 1970, mit Bruchteilen', () => {
    expect(fileTimeToMs(116444736000000000n)).toBe(0);
    expect(fileTimeToMs(fileTime(T))).toBe(T);
    expect(fileTimeToMs(fileTime(T, 3_000n)) - T).toBeCloseTo(0.3, 3);
    expect(fileTimeToMs(fileTime(-1000, -5_000n))).toBeCloseTo(-1000.5, 6);
    // Zwei Prozesse, die eine Mikrosekunde auseinander starten, bleiben unterscheidbar und richtig geordnet.
    expect(fileTimeToMs(fileTime(T, 10n))).toBeGreaterThan(fileTimeToMs(fileTime(T, 0n)));
  });

  it('liest einen aufgenommenen Puffer von Windows 11 (Anfang der Liste, bereinigt)', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ntqsi-start.json'), 'utf8')) as {
      base: string;
      gzipBase64: string;
    };
    const buf = gunzipSync(Buffer.from(fixture.gzipBase64, 'base64'));

    const processes = parseProcessInformation(buf, BigInt(fixture.base));

    expect(processes.map(({ pid, ppid, name }) => ({ pid, ppid, name }))).toEqual([
      { pid: 0, ppid: 0, name: '' },
      { pid: 4, ppid: 0, name: 'System' },
      { pid: 284, ppid: 4, name: 'Secure System' },
      { pid: 324, ppid: 4, name: 'Registry' },
      { pid: 1068, ppid: 4, name: 'smss.exe' },
    ]);
    expect(processes[1].startTime).toBeCloseTo(Date.parse('2026-10-29T15:17:49.271Z') + 0.2546, 3);
    // Secure System und Registry starten vor System: Startzeiten sind keine Rangfolge der Prozess-IDs.
    expect(processes[2].startTime).toBeLessThan(processes[1].startTime);
  });
});

const windows64 = process.platform === 'win32' && (process.arch === 'x64' || process.arch === 'arm64');

describe.runIf(windows64)('Prozess-Sonde: echte Abfrage über koffi', () => {
  it('findet den eigenen Prozess mit Elternprozess, Programmname und Startzeit', async () => {
    const probe = createProcessProbe();
    const started = Date.now() - process.uptime() * 1000;

    const processes = await probe.snapshot();

    const self = processes.find((p) => p.pid === process.pid);
    expect(self).toMatchObject({ ppid: process.ppid, name: path.basename(process.execPath) });
    expect(Math.abs(self!.startTime - started)).toBeLessThan(5000);
    expect(processes.find((p) => p.pid === 4)?.name).toBe('System');
    expect(processes.length).toBeGreaterThan(20);
  });

  it('gibt einer zweiten Abfrage, solange die erste läuft, dieselbe Antwort; danach eine neue', async () => {
    const probe = createProcessProbe();

    const first = probe.snapshot();
    const second = probe.snapshot();
    expect(second).toBe(first);
    await first;
    const third = probe.snapshot();

    expect(third).not.toBe(first);
    expect((await third).some((p) => p.pid === process.pid)).toBe(true);
  });

  it('liest den Konsolen-Host eines Prozesses oder liefert null', async () => {
    const probe = createProcessProbe();
    await probe.snapshot();

    const host = probe.consoleHost(process.pid);
    const none = probe.consoleHost(4);

    expect(host === null || (Number.isInteger(host) && host > 0)).toBe(true);
    expect(none).toBeNull();
  });

  describe('Prozesse beenden', () => {
    /** Ein Node-Prozess ohne Fenster, der wartet, bis er beendet wird. */
    function sleeper(): { child: ChildProcess; exited: Promise<number | null> } {
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', windowsHide: true });
      const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
      return { child, exited };
    }

    it('beendet einen Prozess mit Prozess-ID und Startzeit aus der Abfrage', async () => {
      const probe = createProcessProbe();
      const { child, exited } = sleeper();
      const info = (await probe.snapshot()).find((p) => p.pid === child.pid);
      expect(info).toBeDefined();

      probe.terminate([info!]);

      expect(await exited).toBe(1);
    });

    it('übergeht einen Prozess mit anderer Startzeit (Prozess-ID neu vergeben) und beendete Prozesse', async () => {
      const probe = createProcessProbe();
      const { child, exited } = sleeper();
      const info = (await probe.snapshot()).find((p) => p.pid === child.pid)!;

      probe.terminate([{ ...info, startTime: info.startTime - 1 }, { pid: 999_999_996, ppid: 0, name: 'weg.exe', startTime: 0 }]);
      const stillRunning = (await probe.snapshot()).some((p) => p.pid === child.pid && p.startTime === info.startTime);
      child.kill();
      await exited;

      expect(stillRunning).toBe(true);
    });
  });
});
