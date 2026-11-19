import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PersistedState, Settings } from '../shared/types';

const SAVE_DEBOUNCE_MS = 200;

function defaultSettings(): Settings {
  return {
    defaultCwd: os.homedir(),
    shell: 'powershell.exe',
  };
}

function defaultState(): PersistedState {
  return { version: 1, settings: defaultSettings(), sessions: [], activeSessionId: null };
}

/**
 * Hält den App-Zustand im Speicher und schreibt ihn (entprellt, atomar) nach state.json.
 * Der Main-Prozess ist die einzige Quelle der Wahrheit; der Renderer ändert nur über IPC.
 */
export class StateStore {
  private state: PersistedState;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string) {
    this.state = this.load();
  }

  get(): PersistedState {
    return this.state;
  }

  update(mutate: (state: PersistedState) => void): void {
    mutate(this.state);
    this.scheduleSave();
  }

  /** Schreibt sofort; beim Beenden der App aufrufen. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeNow();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private writeNow(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  private load(): PersistedState {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return defaultState();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const defaults = defaultState();
      return {
        version: 1,
        settings: { ...defaults.settings, ...parsed.settings },
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        activeSessionId: parsed.activeSessionId ?? null,
      };
    } catch (err) {
      // Kaputte Datei nicht stillschweigend überschreiben, sondern beiseitelegen.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.copyFileSync(this.file, backup);
      console.error(`state.json konnte nicht gelesen werden, gesichert als ${backup}:`, err);
      return defaultState();
    }
  }
}
