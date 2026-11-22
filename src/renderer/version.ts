// Die Versionszeile im Einstellungsdialog (Ticket 30), ohne DOM, damit sie sich prüfen lässt. „Version kopieren“
// (Klick auf die Zeile, Befehlspalette) kopiert genau diesen Text.

import type { AppInfo } from '../shared/types';

/** „THub 0.2.0“; läuft THub unpaketiert (`npm start`), steht „Entwicklung“ dahinter. */
export function versionLabel(info: AppInfo): string {
  return info.packaged ? `THub ${info.version}` : `THub ${info.version} · Entwicklung`;
}
