// Woraus diese App gebaut wurde (Ticket 30): Commit und ob der Arbeitsstand dabei sauber war. build.mjs setzt beides
// beim Bauen ein (esbuild `define`); ohne Git, und in Tests ohne Bauen, fehlt der Commit.

interface BuildInfo {
  /** Kurze Kennung des Commits, aus dem gebaut wurde; `null` ohne Git. */
  commit: string | null;
  /** Der Arbeitsstand hatte beim Bauen Änderungen, die nicht committet waren. */
  dirty: boolean;
}

declare const __THUB_BUILD__: BuildInfo | undefined;

export const BUILD_INFO: BuildInfo =
  typeof __THUB_BUILD__ === 'undefined' ? { commit: null, dirty: false } : __THUB_BUILD__;
