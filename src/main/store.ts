import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StateStorage, TabHistory } from './workspace/ports';
import type { PersistedState } from './workspace/schema';

const SAVE_DEBOUNCE_MS = 200;

/** Name der Zustandsdatei im Datenordner. */
export const STATE_FILE_NAME = 'state.json';
/** Unterordner neben der Zustandsdatei mit einer Verlaufsdatei pro Tab. */
export const HISTORY_DIR_NAME = 'history';

/**
 * Speicher: liest state.json und schreibt den Zustand entprellt und atomar zurück. Den Verlauf legt er
 * pro Tab als eigene Datei im Unterordner `history` ab, sofort und ebenfalls atomar.
 * Was im Zustand steht, entscheidet der Workspace-Kern; dieser Speicher kennt nur die Dateien.
 */
export class StateStore implements StateStorage {
  private pending: PersistedState | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly historyDir: string;

  constructor(private readonly file: string) {
    this.historyDir = path.join(path.dirname(file), HISTORY_DIR_NAME);
  }

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

  loadHistory(tabId: string): TabHistory | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.historyFile(tabId), 'utf8');
    } catch {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isHistoryFile(parsed)) return { content: parsed.content, savedAt: parsed.savedAt };
    } catch {
      // Unten weiter.
    }
    // Eine unlesbare Verlaufsdatei kostet nur den Verlauf; die nächste Sicherung ersetzt sie.
    console.error(`Verlauf von Tab ${tabId} ist unlesbar und wird ignoriert.`);
    return null;
  }

  saveHistory(tabId: string, history: TabHistory): void {
    const file: HistoryFile = { version: 1, savedAt: history.savedAt, content: history.content };
    writeAtomically(this.historyFile(tabId), JSON.stringify(file));
  }

  deleteHistory(tabId: string): void {
    fs.rmSync(this.historyFile(tabId), { force: true });
  }

  private historyFile(tabId: string): string {
    // Kennungen sind UUIDs. Andere (etwa aus Version 1) werden zu einem sicheren Dateinamen; die
    // Mindestlänge schliesst reservierte Namen wie CON oder NUL aus.
    const name = /^[A-Za-z0-9_-]{8,64}$/.test(tabId)
      ? tabId
      : createHash('sha256').update(tabId).digest('hex');
    return path.join(this.historyDir, `${name}.json`);
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

/** Inhalt einer Verlaufsdatei. */
interface HistoryFile {
  version: 1;
  savedAt: number;
  /** Serialisierter Terminal-Inhalt mit Escape-Sequenzen. */
  content: string;
}

function isHistoryFile(value: unknown): value is HistoryFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.content === 'string' && typeof v.savedAt === 'number' && Number.isFinite(v.savedAt);
}

/** Schreibt wie state.json über eine Temp-Datei: Ein Absturz hinterlässt nie eine halbe Datei. */
function writeAtomically(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}
