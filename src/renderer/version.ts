// Die Versionszeile im Einstellungsdialog (Ticket 30), ohne DOM, damit sie sich prüfen lässt. „Version kopieren“
// (Klick auf die Zeile, Befehlspalette) kopiert genau diesen Text.

import type { AppInfo } from '../shared/types';

/**
 * „THub 2.0.0 · e8e865a“: Version und Commit, aus dem gebaut wurde. Dahinter „+ Änderungen“, wenn beim Bauen nicht
 * alles committet war, und „Entwicklung“, wenn THub unpaketiert läuft (`npm start`). Ohne Commit nur die Version.
 */
export function versionLabel(info: AppInfo): string {
  let label = `THub ${info.version}`;
  if (info.commit) label += ` · ${info.commit}${info.dirty ? ' + Änderungen' : ''}`;
  if (!info.packaged) label += ' · Entwicklung';
  return label;
}
