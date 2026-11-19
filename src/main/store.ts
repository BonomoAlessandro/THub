import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StateStorage } from './workspace/ports';
import type { PersistedState } from './workspace/schema';

const SAVE_DEBOUNCE_MS = 200;

/**
 * Speicher: liest state.json und schreibt den Zustand entprellt und atomar zurück.
 * Was im Zustand steht, entscheidet der Workspace-Kern; dieser Speicher kennt nur die Datei.
 */
export class StateStore implements StateStorage {
  private pending: PersistedState | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string) {}

  loadState(): unknown {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return null;
    }
    try {
      // Ein BOM (z.B. nach Bearbeiten im Editor) ist kein Grund, die Datei zu verwerfen.
      const parsed: unknown = JSON.parse(raw.replace(/^﻿/, ''));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Kein JSON-Objekt');
      }
      return parsed;
    } catch (err) {
      // Kaputte Datei nicht stillschweigend überschreiben, sondern beiseitelegen.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.copyFileSync(this.file, backup);
      console.error(`state.json konnte nicht gelesen werden, gesichert als ${backup}:`, err);
      return null;
    }
  }

  saveState(state: PersistedState): void {
    this.pending = state;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writePending();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Schreibt sofort; beim Beenden der App aufrufen. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writePending();
  }

  private writePending(): void {
    if (!this.pending) return;
    const state = this.pending;
    this.pending = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
}
