// Datenordner der App (Ticket 20) und die einmalige Übernahme der Daten aus der Zeit, als THub noch
// „TermHub“ hiess. Lädt nie Electron, damit die Tests ihn mit Temp-Ordnern echt betreiben können.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { HISTORY_DIR_NAME, STATE_FILE_NAME } from './store';

/** Datenordner der App und der Ordner, den sie unter ihrem alten Namen hatte. */
export interface DataFolders {
  /** `%APPDATA%\THub`, unpaketiert (`npm start`) `%APPDATA%\THub-dev`. */
  current: string;
  /** `%APPDATA%\TermHub` bzw. `%APPDATA%\TermHub-dev`; wird nur gelesen, nie verändert. */
  legacy: string;
}

/**
 * Datenordner unter `appData` (%APPDATA%). Unpaketiert ein eigener, damit die Entwicklung die installierte
 * App nie berührt; übernommen wird entsprechend nur aus dem alten Entwicklungsordner.
 */
export function dataFolders(appData: string, packaged: boolean): DataFolders {
  const suffix = packaged ? '' : '-dev';
  return {
    current: path.join(appData, `THub${suffix}`),
    legacy: path.join(appData, `TermHub${suffix}`),
  };
}

/**
 * Ergebnis der Übernahme:
 * - `not-needed`: Der neue Ordner hat schon eine Zustandsdatei; nichts getan.
 * - `nothing-to-take-over`: Auch der alte Ordner hat keine; nichts getan.
 * - `taken-over`: Zustandsdatei und Verlauf wurden aus dem alten Ordner kopiert.
 */
export type TakeoverResult = 'not-needed' | 'nothing-to-take-over' | 'taken-over';

/**
 * Einmalige Übernahme beim Start: Hat der neue Datenordner noch keine Zustandsdatei, der alte aber eine,
 * werden die Zustandsdatei und der Verlaufsordner kopiert; danach gelten sie wie selbst geschrieben.
 * Der alte Ordner bleibt unangetastet, andere Dateien darin (etwa die Hook-Datei) bleiben dort.
 * Die Zustandsdatei kommt zuletzt und atomar: Bricht die Übernahme ab, liegt im neuen Ordner keine halbe
 * Zustandsdatei, sondern gar keine.
 */
export function takeOverLegacyData(folders: DataFolders): TakeoverResult {
  const stateFile = path.join(folders.current, STATE_FILE_NAME);
  if (fs.existsSync(stateFile)) return 'not-needed';
  const legacyStateFile = path.join(folders.legacy, STATE_FILE_NAME);
  if (!isFile(legacyStateFile)) return 'nothing-to-take-over';

  fs.mkdirSync(folders.current, { recursive: true });
  const legacyHistory = path.join(folders.legacy, HISTORY_DIR_NAME);
  if (fs.existsSync(legacyHistory)) {
    fs.cpSync(legacyHistory, path.join(folders.current, HISTORY_DIR_NAME), { recursive: true });
  }
  const tmp = `${stateFile}.tmp`;
  fs.copyFileSync(legacyStateFile, tmp);
  fs.renameSync(tmp, stateFile);
  return 'taken-over';
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}
