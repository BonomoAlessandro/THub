# 13 – Claude-Status und Prozess-Status am Tab

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 11
User Stories: 41–48
Spezifikation: „Claude-Status: Zustandsautomat pro Tab“ (Status-Zeilen, „Prozesse laufen“, angezeigter Status)

## Was gebaut wird

- **Status-Zeilen des Zustandsautomaten:**
  - „arbeitet“: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`
  - „wartet auf dich“: `Notification` mit `permission_prompt` oder `elicitation_dialog`
  - „ruht“: `Stop`, `StopFailure`, sowie `Notification` mit `idle_prompt`. Dieser Fall fängt Unterbrechungen mit Esc auf, nach denen kein `Stop` kommt.
- **„Fertig, noch nicht angeschaut“:** Das Merkmal wird gesetzt, wenn `Stop` eintrifft, während der Tab nicht sichtbar ist (nicht aktiv oder Fenster nicht im Vordergrund). Es wird gelöscht, sobald der Tab angezeigt wird oder das Fenster mit diesem Tab in den Vordergrund kommt. Der Renderer meldet dem Kern dafür, ob das Fenster im Vordergrund ist.
- **Prozess-Sonde (Windows):**
  - eine Abfrage des Prozessbaums für alle Tabs etwa alle 1,5 Sekunden, ohne pro Abfrage einen Prozess zu starten, zum Beispiel mit `@vscode/windows-process-tree` oder einem Toolhelp32-Schnappschuss;
  - ein natives Modul liegt im Paket ausserhalb des asar-Archivs und passt zur Konfiguration `npmRebuild: false`.
- **Prozess-Regeln:**
  - Ein Prozess zählt erst ab der zweiten Abfrage.
  - Nie gezählt werden `conhost.exe`, `OpenConsole.exe`, die Startkette der Shell (bei Git Bash `bin\bash.exe` → `usr\bin\bash.exe`) und der Starter.
  - Normale Tabs: jeder verbleibende Nachfahre zählt.
  - Claude-Tabs: nur Nachfahren des Claude-Prozesses (Prozess-ID aus der Meldung `started`), die beim letzten `UserPromptSubmit` noch nicht liefen, und nur, solange Claude ruht.
  - WSL-Tabs: nie blau.
- **Angezeigter Status** mit Vorrang: pausiert → wartet → arbeitet → fertig (grün) → Prozesse laufen (blau) → nichts.
- **Symbole an den Tabs** wie im Prototyp: violett animiert, orange pulsierend, blau, grün, grau pausiert (das letzte aus Ticket 12).

## Akzeptanzkriterien

- [ ] Kern-Tests mit echten HTTP-Hook-Ereignissen und steuerbarer Prozess-Sonde:
  - Prompt → arbeitet; Berechtigungsfrage → wartet; danach `PreToolUse` → arbeitet;
  - Unterbrechung ohne `Stop`, dann `idle_prompt` → ruht;
  - `Stop` im sichtbaren Tab → ruht; im nicht sichtbaren Tab bzw. bei Fenster im Hintergrund → grün, bis der Tab angezeigt wird oder das Fenster mit ihm in den Vordergrund kommt;
  - normaler Tab: Prozess nur in einer Abfrage → nichts; in zwei Abfragen → blau; nach seinem Ende → nichts;
  - Git-Bash-Startkette allein → nichts;
  - Claude-Tab mit MCP-Server-Kindern, die vor dem Prompt liefen → nach `Stop` nichts; ein während der Antwort gestarteter Kindprozess, der weiterläuft → nach `Stop` blau, nach seinem Ende nichts;
  - Vorrang bei gleichzeitigen Zuständen, etwa grün plus blau → grün.

## Abnahme von Hand (mit echtem Claude Code)

- [ ] Prompt senden → violett; eine Aktion, die eine Berechtigung braucht → orange; fertig in einem anderen Tab → grün, verschwindet beim Öffnen.
- [ ] Claude startet einen Dev-Server im Hintergrund → nach dem Ende der Antwort blau.
- [ ] `npm run dev` in einem normalen Tab → blau, nach `Ctrl+C` kein Symbol.
- [ ] Ein Git-Bash-Tab und ein PowerShell-Tab mit oh-my-posh im Leerlauf zeigen kein Symbol.
- [ ] Mit 20 offenen Tabs braucht TermHub im Leerlauf im Mittel unter 1 % CPU (Task-Manager).
