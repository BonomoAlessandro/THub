import { describe, expect, it } from 'vitest';
import type { ProcessInfo } from '../../src/main/workspace/ports';
import { ptyConsoleHost } from '../../src/main/workspace/processRules';

// Der Konsolen-Host der Pseudokonsole einer Shell (Ticket 15): Das Terminal-Backend beendet ihn, wenn die Shell von
// selbst endet, weil node-pty 1.1.0 ihn sonst bis zum Ende von THub stehen lässt. ConPTY startet ihn unmittelbar vor der
// Shell als Kind von THub; Prozessbaum wie im Spike (spikes/prozess-sonde/ergebnisse/trees.txt).

const THUB = 29248;
const T0 = Date.UTC(2026, 10, 20, 9, 0, 0);

const proc = (pid: number, ppid: number, name: string, ms: number): ProcessInfo => ({ pid, ppid, name, startTime: T0 + ms });
const thub = proc(THUB, 1200, 'electron.exe', -600_000);

describe('Konsolen-Host einer Shell', () => {
  it('ist der Konsolen-Host, den THub unmittelbar vor der Shell gestartet hat', () => {
    const host = proc(4552, THUB, 'conhost.exe', 6);
    const snapshot = [thub, proc(3000, THUB, 'electron.exe', -500_000), host, proc(19996, THUB, 'pwsh.exe', 9)];

    expect(ptyConsoleHost(snapshot, THUB, 19996)).toEqual(host);
  });

  it('jede Shell hat ihren eigenen, auch bei Starts direkt nacheinander; OpenConsole.exe zählt wie conhost.exe', () => {
    const hostA = proc(4552, THUB, 'conhost.exe', 6);
    const hostB = proc(4600, THUB, 'OpenConsole.exe', 12);
    const snapshot = [thub, hostA, proc(19996, THUB, 'cmd.exe', 9), hostB, proc(20000, THUB, 'bash.exe', 15)];

    expect(ptyConsoleHost(snapshot, THUB, 19996)).toEqual(hostA);
    expect(ptyConsoleHost(snapshot, THUB, 20000)).toEqual(hostB);
  });

  it.each([
    ['ein anderes Kind von THub liegt dazwischen', [proc(4552, THUB, 'conhost.exe', 6), proc(5000, THUB, 'electron.exe', 7)]],
    ['direkt davor liegt die Shell eines anderen Tabs (ihr Host ist schon weg)', [proc(10420, THUB, 'pwsh.exe', 5)]],
    ['der Konsolen-Host gehört nicht zu THub', [proc(4552, 1200, 'conhost.exe', 6)]],
  ])('keiner, wenn %s', (_label, before) => {
    const snapshot = [thub, ...before, proc(19996, THUB, 'pwsh.exe', 9)];

    expect(ptyConsoleHost(snapshot, THUB, 19996)).toBeUndefined();
  });

  it('keiner, wenn die Shell nicht mehr läuft oder nicht von THub gestartet ist', () => {
    const host = proc(4552, THUB, 'conhost.exe', 6);

    expect(ptyConsoleHost([thub, host], THUB, 19996)).toBeUndefined();
    expect(ptyConsoleHost([thub, host, proc(19996, 777, 'pwsh.exe', 9)], THUB, 19996)).toBeUndefined();
    expect(ptyConsoleHost([host, proc(19996, THUB, 'pwsh.exe', 9)], THUB, 19996)).toBeUndefined();
  });

  it('ein Kind, das älter ist als THub, stammt von einem früheren Prozess mit derselben Prozess-ID', () => {
    const stale = proc(4552, THUB, 'conhost.exe', -700_000);

    expect(ptyConsoleHost([thub, stale, proc(19996, THUB, 'pwsh.exe', 9)], THUB, 19996)).toBeUndefined();
  });
});
