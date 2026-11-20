// Claude-Sessions fortsetzen (Ticket 12): welcher Claude-Tab nach einem Neustart fortgesetzt wird und mit welchem
// Startbefehl. Die Regeln stehen in der Spezifikation unter „Wiederherstellen“; der Workspace-Kern wendet sie an.

import type { ShellIntegration } from './ports';
import type { PersistedClaudeLink } from './schema';

/**
 * Kennungen, die THub in einen Startbefehl schreibt. Claude vergibt UUIDs; alles andere stammt aus einem getippten
 * `claude --resume <Suchbegriff>`, das Claude nie bestätigt hat, und käme sonst ungeschützt in eine Befehlszeile.
 */
const RESUMABLE_ID = /^[0-9A-Za-z][0-9A-Za-z_-]*$/;

/**
 * Die Session, die ein Claude-Tab beim Wiederherstellen fortsetzt: Er hat eine Kennung und hat entweder einen Prompt
 * erlebt oder ist unbestätigt (Sicherheitsnetz, falls keine Hooks laufen). `undefined` heisst, der Tab kommt als
 * normales Terminal zurück: ohne Kennung, oder bestätigt, aber nie ein Prompt.
 */
export function sessionToResume(link: PersistedClaudeLink): string | undefined {
  const { sessionId } = link;
  if (!sessionId || !RESUMABLE_ID.test(sessionId)) return undefined;
  return link.hadPrompt || !link.confirmed ? sessionId : undefined;
}

/**
 * Startbefehl zum Fortsetzen, in der Sprache der Shell: der Starter mit `--resume <Kennung>`. Er ruft den Starter
 * direkt auf, nicht das Wort `claude`, weil doskey-Makros in der `/k`-Zeile von cmd nicht wirken. Fehlt THUB_STARTER
 * (eine Gruppenrichtlinie würde den Starter blockieren), ruft er `claude --resume <Kennung>` direkt auf, wie getippt
 * und ohne Erfassung; der Kern erkennt das an der fehlenden Start-Meldung und lässt die Claude-Zuordnung fallen
 * (Ticket 23).
 * @param sessionId eine Kennung aus `sessionToResume`
 */
export function resumeCommand(integration: ShellIntegration, sessionId: string): string {
  const args = `--resume ${sessionId}`;
  switch (integration) {
    case 'powershell':
      return (
        `if ($env:THUB_STARTER) { & "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" ` +
        `-NoProfile -NoLogo -ExecutionPolicy Bypass -File $env:THUB_STARTER ${args} } else { claude ${args} }`
      );
    case 'cmd':
      return (
        `if defined THUB_STARTER ("%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" ` +
        `-NoProfile -NoLogo -ExecutionPolicy Bypass -File "%THUB_STARTER%" ${args}) else claude ${args}`
      );
    case 'bash':
      // __thub_starter richtet die Integration zusammen mit dem claude-Ersatz ein, nur mit THUB_STARTER.
      return `if [ -n "$THUB_STARTER" ]; then __thub_starter ${args}; else claude ${args}; fi`;
  }
}
