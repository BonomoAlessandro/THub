// Echte Ports für den Betrieb: Uhr, System und Prozess-Sonde.
import { screen } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Clock, HostSystem, ProcessProbe } from './workspace/ports';

export const systemClock: Clock = {
  now: () => Date.now(),
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};

export const hostSystem: HostSystem = {
  directoryExists(dir) {
    if (!dir) return false;
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  },
  homeDir: () => os.homedir(),
  userName() {
    try {
      return os.userInfo().username;
    } catch {
      return path.basename(os.homedir());
    }
  },
  // Erst nach app.whenReady() aufrufen; vorher steht `screen` nicht zur Verfügung.
  displays() {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => ({
      bounds: d.bounds,
      workArea: d.workArea,
      primary: d.id === primaryId,
    }));
  },
  longPath(p) {
    // Nur Kurznamen auflösen: realpath löst auch Verknüpfungen auf, und die sollen bleiben, wie sie sind.
    if (!p.includes('~')) return p;
    try {
      return fs.realpathSync.native(p);
    } catch {
      return p;
    }
  },
};

/** Sonde ohne Prozesse: Rückfall, wenn sich die echte Sonde (`processProbe.ts`) nicht laden lässt. Beendet nichts. */
export const noProcessProbe: ProcessProbe = {
  snapshot: () => Promise.resolve([]),
  consoleHost: () => null,
  terminate: () => {},
};
