// Ordner: automatische Tab-Namen und die Liste der zuletzt benutzten Ordner.
// Reine Regeln ohne Zugriff auf das Dateisystem; ob ein Ordner existiert, prüft der Kern über den System-Port.

import * as path from 'node:path';

/** Höchstens so viele zuletzt benutzte Ordner werden gespeichert. */
export const MAX_RECENT_DIRS = 8;

/** Was die Namensregel von der Umgebung braucht. */
export interface NamingContext {
  homeDir: string;
  userName: string;
}

/**
 * Automatischer Name eines Tabs nach seinem Ordner: der letzte Teil des Pfads; beim Benutzerordner der
 * Benutzername, bei einem Laufwerk der Laufwerksbuchstabe mit Doppelpunkt (`D:`). Leer, wenn der Pfad
 * nichts hergibt.
 */
export function folderName(dir: string, ctx: NamingContext): string {
  const trimmed = dir.trim();
  if (trimmed && samePath(trimmed, ctx.homeDir) && ctx.userName.trim()) return ctx.userName.trim();
  const drive = /^([a-z]):[\\/]*$/i.exec(trimmed);
  if (drive) return `${drive[1].toUpperCase()}:`;
  return trimmed.split(/[\\/]+/).filter(Boolean).pop() ?? '';
}

/**
 * Macht einen Namen eindeutig: Ist er schon vergeben, wird „ 2“, „ 3“ usw. angehängt, die kleinste freie
 * Nummer. Gross- und Kleinschreibung zählen dabei nicht, wie bei Windows-Ordnern.
 */
export function uniqueName(base: string, used: Iterable<string>): string {
  const taken = new Set([...used].map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/**
 * Setzt einen Ordner an die Spitze der zuletzt benutzten: neueste zuerst, ohne Doppelte (Pfade wie bei
 * Windows verglichen), höchstens acht. Ein leerer Ordner ändert nichts.
 */
export function rememberDir(list: readonly string[], dir: string): string[] {
  if (!dir.trim()) return [...list];
  return [dir, ...list.filter((d) => !samePath(d, dir))].slice(0, MAX_RECENT_DIRS);
}

/** Vergleicht Windows-Pfade ohne Rücksicht auf Gross-/Kleinschreibung und abschliessende Trenner. */
export function samePath(a: string, b: string): boolean {
  const key = (p: string) => path.win32.normalize(p).replace(/[\\/]+$/, '').toLowerCase();
  return key(a) === key(b);
}
