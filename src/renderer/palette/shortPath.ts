// Kurze Anzeige eines Ordners in der Befehlspalette: Bei langen Pfaden zählt vor allem das Ende.

/**
 * Kürzt einen langen Pfad in der Mitte: erster Teil (meist das Laufwerk), „…“ und die letzten `keep` Ordner,
 * z.B. `C:\…\work\api\src`. Kurze Pfade bleiben unverändert; führende Trenner (UNC, `/c/…`) und die Art des
 * Trenners bleiben erhalten.
 */
export function shortPath(path: string, keep = 3): string {
  const sep = path.includes('\\') ? '\\' : '/';
  const lead = /^[\\/]+/.exec(path)?.[0] ?? '';
  const parts = path.slice(lead.length).split(/[\\/]+/).filter(Boolean);
  if (parts.length <= keep + 2) return path;
  return lead + [parts[0], '…', ...parts.slice(-keep)].join(sep);
}
