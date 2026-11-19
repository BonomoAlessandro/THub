# 13 – Claude-Status und Prozess-Status am Tab

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 11
User Stories: 41–48
Spezifikation: „Claude-Status: Zustandsautomat pro Tab“ (Status-Zeilen, „Prozesse laufen“, angezeigter Status)

## Was gebaut wird

- **Status-Zeilen des Zustandsautomaten:**
  - „arbeitet“: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`; ausserdem jede Eingabe des Nutzers (ausser Esc) in einem wartenden Claude-Tab, weil nach einer Bestätigung bis `PostToolUse` kein Ereignis kommt
  - „wartet auf dich“: `PermissionRequest` (sofort); `Notification` mit `permission_prompt` oder `elicitation_dialog` nur als Rückfallebene (kommt etwa 6 Sekunden später)
  - „ruht“: `Stop`, `StopFailure`; ausserdem Esc in einem arbeitenden oder wartenden Claude-Tab, wenn danach etwa 1,5 Sekunden kein Hook-Ereignis kommt (ohne grünes „fertig“), weil Claude nach einer Unterbrechung oder Ablehnung nichts meldet
  - `Notification` mit `idle_prompt` ändert nichts
  - Ereignisse in der Reihenfolge ihres Eintreffens verarbeiten (`PreToolUse` kommt vor `PermissionRequest`)
  - Ende einer Hintergrund-Aufgabe: Claude schickt `UserPromptSubmit` (Prompt beginnt mit `<task-notification>`) und danach `Stop`; das ergibt kurz „arbeitet“, dann „ruht“ bzw. „fertig“
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
  - Prompt → arbeitet; `PreToolUse`, dann `PermissionRequest` → wartet; Eingabe des Nutzers → arbeitet; `PostToolUse` → arbeitet;
  - Esc während „arbeitet“, danach kein Ereignis → nach 1,5 Sekunden (steuerbare Uhr) ruht, ohne grün; Esc mit folgendem `Stop` → normal über `Stop`;
  - `idle_prompt` ändert nichts; verspätetes `permission_prompt` nach `PostToolUse` setzt nicht wieder auf „wartet“, wenn der Tab inzwischen arbeitet oder ruht;
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
