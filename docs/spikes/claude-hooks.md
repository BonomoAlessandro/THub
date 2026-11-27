# Spike: Claude-Code-Hooks für TermHub (Tickets 10 bis 13)

Stand: 2026-11-19 · Claude Code 2.1.328 · Windows 11 · Spike-Code unter `spikes/claude-hooks/`

Nachtrag 2026-11-27 (Ticket 37): Hook-Ereignisse zu Agenten, gemessen mit Claude Code 2.1.332, im Abschnitt [Agenten (Ticket 37)](#agenten-ticket-37).

Nachtrag 2026-11-27 (Ticket 38): die Statuszeile (`statusLine`) für den Verbrauchsbalken, gemessen mit Claude Code 2.1.332, im Abschnitt [Statuszeile (Ticket 38)](#statuszeile-ticket-38) am Ende.

Dieser Spike prüft mit dem installierten Claude Code, ob die Annahmen der Spezifikation (`docs/specs/termhub-v2.md`, Abschnitte „Shell-Integration“ Punkt 2, „Hook-Empfänger und lokale Schnittstelle“, „Claude-Status: Zustandsautomat pro Tab“ und „Weitere Hinweise“) stimmen. Am Ende stehen konkrete Korrekturen für die Spezifikation.

## Kurzfassung

1. **HTTP-Hooks für `SessionStart` gibt es nicht.** Claude überspringt sie still („HTTP hooks are not supported for SessionStart“, nur im Debug-Log sichtbar). Alle anderen geprüften Ereignisse kommen per HTTP-Hook an. Ersatz, der funktioniert: ein Befehls-Hook ohne Shell, der mit dem `curl.exe` von Windows die Nutzdaten an TermHub weiterleitet (siehe „Korrekturen → Hook-Datei“).
2. `--settings <Datei>` wird akzeptiert. Die Hooks laufen **zusätzlich** zu den Hooks des Nutzers. `$VAR` und `${VAR}` in Kopfzeilen werden mit `allowedEnvVars` auch unter Windows ersetzt.
3. `--session-id` mit `-n` vergibt die Kennung und den Namen. `--resume <Kennung>` behält die Kennung, auch aus einem anderen Ordner. `/clear` liefert `SessionEnd(clear)` mit der alten und `SessionStart(clear)` mit einer neuen Kennung.
4. **Nach einer Unterbrechung mit Esc kommt weder `Stop` noch `idle_prompt`.** Die Annahme, `idle_prompt` fange Unterbrechungen auf, ist widerlegt. `idle_prompt` kommt nur rund 60 Sekunden nach einem `Stop`.
5. **`Notification` mit `permission_prompt` kommt erst rund 6 Sekunden nach der Rückfrage.** Das Ereignis `PermissionRequest` kommt sofort. `AskUserQuestion` meldet sich ebenfalls als `PermissionRequest` und `permission_prompt`, nicht als `elicitation_dialog`.
6. Ein nicht erreichbarer Empfänger blockiert nicht und kostet kaum Zeit (etwa 13 ms). Claude zeigt aber **bei jedem Hook eine sichtbare Fehlerzeile** im Terminal. Ein Empfänger, der hängt, verzögert jedes Ereignis bis zum Timeout, auch `/exit`.
7. Gibt der Nutzer selbst ein `--settings` an, gilt **nur das letzte** `--settings`, ohne Fehler und ohne Zusammenführen.
8. `"disableAllHooks": true` in `.claude/settings.local.json` eines Projekts schaltet auch die Hooks aus `--settings` ab.
9. Das Akzeptanzkriterium aus Ticket 10 (`claude --settings <Datei> --version`) prüft nur, ob die Datei existiert. Eine ungültige Hook-Datei führt in der interaktiven Oberfläche zu einem blockierenden Dialog „Settings Warning“.

## Aufbau

- **Umgebung:** Claude Code 2.1.328 (`claude.exe` im PATH), Windows 11, Node 24, `node-pty` aus dem Wurzelordner, `@xterm/headless` für Bildschirmabzüge. Die Benutzerkonfiguration blieb unverändert. Sie enthält ein Plugin mit eigenen Befehls-Hooks (`SessionStart`, `UserPromptSubmit`, `Stop`, `PostToolUse`, `PermissionRequest`, `Notification`, `StopFailure`), Vollbild-TUI und den Berechtigungsmodus „auto“ als Standard.
- **Ablauf:** Ein Node-Skript startet einen HTTP-Empfänger auf `127.0.0.1` (zufälliger Port, antwortet sofort mit 200 und leerem Inhalt), schreibt eine Hook-Datei und startet `claude` in node-pty in einem eigenen Temp-Ordner mit `TERMHUB_TAB_ID`, `TERMHUB_TOKEN`, `TERMHUB_API` und `NO_PROXY` in der Umgebung. Die Variablen der umgebenden Claude-Session (`CLAUDECODE`, `CLAUDE_CODE_*`) werden entfernt. Tastendrücke (`/clear\r`, `\x1b`, `\x03`) gehen über das Pseudoterminal. Hook-Aufrufe, Tastendrücke und Bildschirmabzüge landen auf einer gemeinsamen Zeitachse. Zusätzlich schreibt `--debug-file` ein Debug-Log.
- **Kosten:** `--model haiku`, insgesamt **10 Prompts** (S1: 4, Hintergrund-Aufgabe: 1, Endpunkt nicht erreichbar: 1, Unterbrechung und Rückfrage: 2, Esc während der Antwort: 2). Alle übrigen Szenarien kommen ohne Prompt aus. Keine Rückfrage wurde für etwas bestätigt, das ausserhalb des Temp-Ordners schreibt. Eine Leseberechtigung für `a.txt` im Temp-Ordner wurde in S1 versehentlich bestätigt (siehe S1).
- **Rohdaten** (Debug-Logs, Terminalausgabe, Zeitachsen) liegen nicht im Repo, weil sie Pfade und Benutzerdaten enthalten. Eingecheckt sind die redigierten Beispiel-Nutzdaten (`spikes/claude-hooks/samples/`) und die Abläufe aller Szenarien (`spikes/claude-hooks/befunde.json`).

| Szenario | Skript | Prompts | Was es prüft |
|---|---|---|---|
| S0 | `s0-start-exit.mjs` | 0 | `--settings`, `--session-id`, `-n`, Kopfzeilen, eigene Hooks, `/exit`, Vertrauensdialog |
| S1 | `s1-hauptsession.mjs` | 4 | Nutzdaten aller Ereignisse, Rückfrage, `idle_prompt`, `AskUserQuestion`, `/clear`, `/exit` |
| resume-ctrlc / resume-exit | `kurz.mjs resume …` | 0 | `--resume` im selben und in einem anderen Ordner, `Ctrl+C` zweimal |
| resume-exit-nosettings | `kurz.mjs resume … exit nosettings` | 0 | Wirken die Hooks beim Fortsetzen ohne `--settings` nach? |
| resume-missing | `kurz.mjs resume-missing` | 0 | `--resume` mit unbekannter Kennung |
| sessionid-taken | `kurz.mjs sessionid-taken …` | 0 | `--session-id` mit bereits benutzter Kennung |
| double-settings (+ reverse) | `kurz.mjs double-settings` | 0 | zwei `--settings` |
| kill | `kurz.mjs kill` | 0 | Pseudoterminal hart schliessen |
| down | `kurz.mjs down prompt` | 1 | Port geschlossen |
| hang | `kurz.mjs hang` | 0 | Empfänger nimmt an, antwortet nie |
| disable-all (+ override) | `kurz.mjs disable-all` | 0 | `disableAllHooks` im Projekt |
| interrupt | `kurz.mjs interrupt` | 2 | `idle_prompt` nach `Stop`, Bash-Rückfrage mit Esc ablehnen |
| esc, esc 2000 | `kurz.mjs esc [2000]` | 2 | Esc während der Antwort |
| bg | `kurz.mjs bg` | 1 | `background_tasks`, Ende einer Hintergrund-Aufgabe |
| invalid | `kurz.mjs invalid` | 0 | ungültiger Hook-Eintrag |
| recommended | `kurz.mjs recommended` | 0 | die empfohlene Hook-Datei (`empfohlene-hook-datei.json`) |

Reproduzieren: `npm ci` im Wurzelordner, `npm install` in `spikes/claude-hooks/`, dann z. B. `node s1-hauptsession.mjs`. `node samples.mjs` erzeugt Beispiele und Befunde neu.

## Annahmen der Spezifikation: Urteil und Beleg

### 1. HTTP-Hooks über `--settings`

| # | Annahme | Urteil | Beleg |
|---|---|---|---|
| 1.1 | Claude akzeptiert eine Hook-Datei über `--settings <Datei>` mit Hooks vom Typ `http`. | **bestätigt** | S0, S1: keine Warnung, Hooks kommen an. Gegenprobe `invalid`: Ein `http`-Hook ohne `url` erzeugt den Dialog „Settings Warning … entry ignored“ mit „Continue / Fix with Claude / Exit“. |
| 1.2 | Alle registrierten Ereignisse lassen sich als HTTP-Hook empfangen. | **widerlegt** für `SessionStart` | Debug-Log in jedem Lauf: `Skipping HTTP hook http://127.0.0.1:…/hooks/SessionStart — HTTP hooks are not supported for SessionStart`. Kein Aufruf am Empfänger. Per HTTP angekommen sind `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `Notification`. `PostToolUseFailure`, `StopFailure` und `PermissionDenied` traten nicht auf (nicht geprüft). |
| 1.3 | `X-TermHub-Tab: $TERMHUB_TAB_ID` mit `allowedEnvVars` funktioniert unter Windows. | **bestätigt** | Kopfzeilen am Empfänger: `$TERMHUB_TAB_ID`, `${TERMHUB_TAB_ID}` und `tab=$TERMHUB_TAB_ID;end` wurden ersetzt. `$USERNAME` (nicht in `allowedEnvVars`) kam als leere Zeichenkette an, Debug-Log: `[WARN] Hooks: env var $USERNAME not in allowedEnvVars, skipping interpolation`. |
| 1.4 | Hooks aus `--settings` laufen zusätzlich zu denen des Nutzers. | **bestätigt** | S0/S1: Die Befehls-Hooks des Plugins (Debug-Log `Hooks: Stop [...] (plugin …) finished with status 0`) und ein Projekt-Hook in `.claude/settings.local.json` des Temp-Ordners (Protokolldatei mit `SessionStart`, `UserPromptSubmit`, `Stop`, `SessionEnd`) liefen parallel zu den TermHub-Hooks. |
| 1.5 | Der Empfänger antwortet leer und beeinflusst Claude nie. | **bestätigt** | Debug-Log: `HTTP hook returned empty body, treating as empty JSON object`. Eine leere Antwort auf `PermissionRequest` lässt die Rückfrage normal erscheinen. |
| 1.6 | Die Hooks gelten erst, wenn Claude läuft. | **präzisiert** | In einem noch nicht vertrauten Ordner laufen **keine** Hooks, bis der Vertrauensdialog bestätigt ist. Wählt der Nutzer „No, exit“, endet Claude mit Exit-Code 1 ohne ein einziges Hook-Ereignis (`s0-untrusted`, Debug-Log: `Skipping SessionEnd:other hook execution - workspace trust not accepted`). |

### 2. Nutzdaten

Beobachtete Felder (gekürzte Beispiele weiter unten und in `spikes/claude-hooks/samples/`):

| Ereignis | Felder | Bemerkungen |
|---|---|---|
| alle | `session_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `hook_event_name` | `prompt_id` überall ausser `SessionStart`. `permission_mode` (`default` für den Modus „manual“, `auto`) bei `UserPromptSubmit`, Werkzeug-Ereignissen und `Stop`. `effort` bei Werkzeug-Ereignissen und `Stop`. |
| `SessionStart` | `source`, `model`, `session_title` | `source`: `startup`, `resume`, `clear` beobachtet. `model` fehlt nach `/clear`. `session_title` = Wert von `-n`. Bei `resume` zusätzlich `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd`. |
| `UserPromptSubmit` | `prompt`, `session_title` | Kommt auch **ohne Tippen**, wenn eine Hintergrund-Aufgabe endet; `prompt` beginnt dann mit `<task-notification>`. |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` | kommt vor `PermissionRequest` |
| `PermissionRequest` | `tool_name`, `tool_input`, `permission_suggestions` | **kein** `tool_use_id`. Kommt 46 bis 106 ms nach `PreToolUse`, sobald die Rückfrage erscheint. |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, `duration_ms` | |
| `Stop` | `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` | `background_tasks` ist immer da: leer oder z. B. `[{id, type: "shell", status: "running", description, command}]` |
| `Notification` | `message`, `notification_type` | `idle_prompt` („Claude is waiting for your input“), `permission_prompt` („Claude needs your permission“). `elicitation_dialog` nicht beobachtet. |
| `SessionEnd` | `reason` | `prompt_input_exit` (nach `/exit` **und** nach zweimal `Ctrl+C`), `clear`, `other` (`--resume` mit unbekannter Kennung) |

| # | Annahme | Urteil | Beleg |
|---|---|---|---|
| 2.1 | Alle Ereignisse tragen `session_id`, `cwd`, `transcript_path`. | **bestätigt** | alle Beispiele. `cwd` ist der Ordner so, wie Claude ihn bekam, auch als 8.3-Kurzpfad (`C:\Users\<USER~1>\…`); `transcript_path` nutzt den Langpfad. |
| 2.2 | `SessionStart.source`: `startup`, `resume`, `clear`, `compact`, `fork` | **bestätigt** für `startup`, `resume`, `clear`; **unklar** für `compact`, `fork` | S0, S1, resume-* |
| 2.3 | `SessionEnd.reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other` | **bestätigt** für `clear`, `prompt_input_exit`, `other`; **unklar** für `resume`, `logout` | S1, resume-ctrlc, resume-missing |
| 2.4 | `Notification.notification_type` u. a. `permission_prompt`, `idle_prompt`, `elicitation_dialog` | **bestätigt** für `permission_prompt` und `idle_prompt`; **unklar** für `elicitation_dialog` (braucht ein MCP-Formular) | S1, interrupt. Rückfragen von `AskUserQuestion` melden sich als `permission_prompt`. |
| 2.5 | `Stop` enthält `background_tasks`. | **bestätigt** | bg: `Stop` mit einem laufenden `ping`. Endet die Aufgabe, folgen ohne Zutun `UserPromptSubmit` (`<task-notification>…`) und ein zweites `Stop` mit leerer Liste. |

### 3. Session-Kennungen und Ende

| # | Annahme oder Frage | Urteil | Beleg |
|---|---|---|---|
| 3.1 | `--session-id <uuid> -n <Name>` bei einer neuen Session nutzt diese Kennung. | **bestätigt** | S0, S1: alle Ereignisse mit der vorgegebenen Kennung. `session_title` = Name, auch mit Umlaut („Spike Null Ä“). Der Name steht im Eingaberahmen und bleibt nach `/clear` und `--resume` erhalten. |
| 3.2 | Ein späteres `--resume <uuid>` behält die Kennung. | **bestätigt** | resume-ctrlc: `SessionStart(resume)` mit derselben Kennung. Auch aus einem anderen Ordner (resume-exit): gleiche Kennung, aber `cwd` ist dann der **aktuelle** Ordner, nicht der ursprüngliche. Claude stellt auch den Berechtigungsmodus der Session wieder her. |
| 3.3 | `--settings` bleibt beim Fortsetzen nicht erhalten. | **bestätigt** | resume-exit-nosettings: weder HTTP- noch curl-Aufrufe im Debug-Log, nur die Hooks des Nutzers. |
| 3.4 | `/clear` erzeugt `SessionEnd(clear)` und danach `SessionStart(clear)` mit neuer Kennung. | **bestätigt** (`SessionStart` nur per Befehls-Hook) | S1: `SessionEnd clear` (alte Kennung) bei 446,8 s, `SessionStart clear` (neue Kennung) bei 447,2 s. Ein weiteres `/exit` endet mit `SessionEnd` der neuen Kennung. |
| 3.5 | `Stop` läuft nicht, wenn der Nutzer mit Esc unterbricht. | **bestätigt** | esc 2000: Esc 7 s nach `UserPromptSubmit` während der Antwort → „Interrupted · What should Claude do instead?“, kein `Stop`. S1 (Esc vor der ersten Ausgabe; Claude legt den Prompt in die Eingabe zurück): kein `Stop`. interrupt B (Rückfrage mit Esc abgelehnt): kein `Stop`, kein `PostToolUseFailure`, kein `PermissionDenied`. Sonderfall esc: Kommt Esc, während noch die `Stop`-Hooks des Nutzers laufen, ist `Stop` schon gesendet. |
| 3.6 | `idle_prompt` fängt Unterbrechungen mit Esc auf. | **widerlegt** | Nach `Stop` kommt `idle_prompt` nach 60,3 s, 60,5 s und 60,6 s. Nach Unterbrechungen kam es in vier Fällen auch nach 80 s **nicht** (S1, interrupt B, esc, esc 2000), auch bei leerer Eingabezeile. |
| 3.7 | Wann kommt `idle_prompt`? | **beobachtet** | rund 60 s nach jedem `Stop`, wenn nichts getippt wurde. Es kommt auch, wenn der Tab schon „ruht“, und ist kein Zeichen für eine offene Frage. |
| 3.8 | `claude --resume <unbekannte uuid>` | **beobachtet** | Ausgabe `No conversation found with session ID: <uuid>`, **Exit-Code 1**, kein `SessionStart`, aber **`SessionEnd` mit `reason: other`** und der unbekannten Kennung, etwa 1,5 s vor dem Prozessende. |
| 3.9 | Exit-Codes nach `/exit` und nach zweimal `Ctrl+C` | **beobachtet** | `/exit` → 0 (`SessionEnd prompt_input_exit`). `Ctrl+C`, Hinweis „Press Ctrl-C again to exit“, zweites `Ctrl+C` → **0** (`SessionEnd prompt_input_exit`). Nach dem Ende schreibt Claude „Resume this session with: claude --resume <uuid>“ ins Terminal. |
| 3.10 | Eigenes `--settings` des Nutzers zusätzlich zu unserem | **beobachtet: das letzte gewinnt** | double-settings: Nur die Hooks der zweiten Datei kamen an. In umgekehrter Reihenfolge wieder nur die der zweiten. Kein Fehler, kein Zusammenführen der Hooks. |
| 3.11 | Pseudoterminal hart schliessen (wie beim Beenden von TermHub) | **beobachtet** | kill: kein `SessionEnd`, Claude-Prozess beendet. |
| 3.12 | `--session-id` mit einer bereits benutzten Kennung | **beobachtet** | `Error: Session ID <uuid> is already in use.`, Exit-Code 1, kein Hook-Ereignis. |

### 4. Endpunkt nicht erreichbar

| # | Annahme | Urteil | Beleg |
|---|---|---|---|
| 4.1 | Nicht erreichbare HTTP-Hooks sind nur ein nicht blockierender Fehler. | **bestätigt, aber sichtbar** | down (Port geschlossen): Der Prompt läuft normal. Im Terminal stehen `⎿ UserPromptSubmit hook failed connect ECONNREFUSED 127.0.0.1:<Port>`, `⎿ Stop hook failed connect ECONNREFUSED …`, in der Statuszeile „stop hook reported a problem · ctrl+o to see“. Nach `/exit` steht in der Shell `SessionEnd hook [http://127.0.0.1:<Port>/hooks/SessionEnd] failed: connect ECONNREFUSED …`. |
| 4.2 | Zusätzliche Wartezeit | **beobachtet** | Geschlossener Port: etwa 13 ms pro Hook (Debug-Log: POST 26,935 s, Fehler 26,948 s). `/exit` dauerte 2,05 s wie ohne Hooks (2,07 s). Hängender Empfänger (hang): Jeder Hook wartet bis zum `timeout` (hier 5 s); `/exit` dauerte **7,4 s** statt 2,0 bis 3,2 s, Meldung `SessionEnd hook […] failed: Hook cancelled`. Claude hebt das Zeitbudget für `SessionEnd` auf den grössten `timeout` an (Debug-Log: abgebrochen nach 5,0 s). |
| 4.3 | Ersatz-Hook für `SessionStart` (curl) bei nicht erreichbarem TermHub | **beobachtet** | Sichtbar beim Start: `⎿ SessionStart:startup hook failed curl: (28) …`. `curl.exe` braucht unter Windows für einen geschlossenen Port auf `127.0.0.1` rund **2 s** (SYN-Wiederholungen), mit `--connect-timeout 0.3` rund 0,5 s. Normalfall: 122 bis 223 ms. |

### 5. Projekt-Override `disableAllHooks`

| # | Annahme | Urteil | Beleg |
|---|---|---|---|
| 5.1 | `"disableAllHooks": true` in `.claude/settings.local.json` eines Projekts schaltet auch die `--settings`-Hooks ab (Story 38). | **bestätigt** | disable-all: kein einziges Hook-Ereignis, auch kein curl-`SessionStart`. Die vorgegebene `--session-id` wirkt unabhängig davon (Kommandozeilen-Option), das Sicherheitsnetz für das Fortsetzen bleibt also. |
| 5.2 | (Gegenprobe) | **beobachtet** | disable-all override: Mit `"disableAllHooks": false` in der `--settings`-Datei laufen die Hooks wieder, auch die des Nutzers. TermHub sollte das **nicht** tun, weil es die Entscheidung des Nutzers aushebelt. |
| 5.3 | `allowManagedHooksOnly` sperrt auch Hooks aus `--settings`. | **unklar** | ohne verwaltete Einstellungen eines Administrators nicht prüfbar. Die Dokumentation nennt nur „user, project, local, and plugin hooks“. |

### 6. Weitere Befunde

- **Ticket 10, Akzeptanzkriterium „`claude --settings <Datei> --version` ohne Fehler“:** prüft nur, ob die Datei existiert. Kaputtes JSON und ein `http`-Hook ohne `url` ergeben beide Exit-Code 0 und die Versionsnummer. Eine fehlende Datei ergibt `Error: Settings file not found`, Exit-Code 1. Eine ungültige Hook-Datei blockiert dagegen jeden interaktiven Start mit dem Dialog „Settings Warning“ (invalid).
- **`SessionStart` kommt vor der Eingabebereitschaft:** etwa 1 bis 2 s, bevor die Oberfläche Eingaben annimmt. Für TermHub ohne Folgen, weil der Startbefehl keine Tasten simuliert.
- **Hintergrund-Aufgaben:** `Stop` kommt, obwohl eine Aufgabe weiterläuft. Endet sie, arbeitet Claude ohne Zutun weiter (`UserPromptSubmit` mit `<task-notification>`, dann `Stop`). Für den Status heisst das: kurz „arbeitet“, danach wieder „ruht“ bzw. grün, wenn der Tab nicht sichtbar ist.
- **Transkript-Marken:** Nach Esc steht im Gesprächsprotokoll (`transcript_path`) eine Zeile `[Request interrupted by user]`, nach dem Ablehnen einer Rückfrage `[Request interrupted by user for tool use]`. Bei Esc vor der ersten Ausgabe (Prompt zurückgelegt) fehlt die Marke. Das Format des Protokolls ist keine zugesicherte Schnittstelle.
- **NO_PROXY:** Die HTTP-Hooks laufen über axios (`user-agent: axios/1.15.2`). Ohne Proxy in der Testumgebung blieb **unklar**, ob `NO_PROXY` greift. Die Ergänzung in der Spezifikation schadet nicht.

## Beispiel-Nutzdaten (gekürzt und redigiert)

Prompt-Texte und Antworten sind ersetzt, Benutzername, Tab-Kennung und Token anonymisiert. `transcript_path` und `scratchpad_dir` sind nur im ersten Beispiel ausgeschrieben. Vollständige Dateien mit Kopfzeilen: `spikes/claude-hooks/samples/*.json`.

Kopfzeilen eines HTTP-Hooks (TermHub-Kopfzeilen plus Prüf-Kopfzeilen des Spikes):

```json
{
  "x-termhub-tab": "<tab-id>",
  "x-termhub-token": "<token>",
  "x-spike-braces": "<tab-id>",
  "x-spike-mixed": "tab=<tab-id>;end",
  "x-spike-unlisted": "",
  "user-agent": "axios/1.15.2",
  "content-type": "application/json"
}
```

`SessionStart` (startup, über den curl-Befehls-Hook; Kopfzeilen `x-termhub-tab`, `x-termhub-token`, `user-agent: curl/8.21.0`):

```json
{
  "session_id": "ec84ffa6-a2f2-4150-983c-65e55fc1ff58",
  "transcript_path": "C:\\Users\\<user>\\.claude\\projects\\C--Users-<USER-1>-AppData-Local-Temp-termhub-spike-ws-s1-hauptsession\\ec84ffa6-a2f2-4150-983c-65e55fc1ff58.jsonl",
  "cwd": "C:\\Users\\<USER~1>\\AppData\\Local\\Temp\\termhub-spike-ws\\s1-hauptsession",
  "scratchpad_dir": "C:\\Users\\<USER~1>\\AppData\\Local\\Temp\\claude\\5347ee85841f507d\\ec84ffa6-a2f2-4150-983c-65e55fc1ff58\\scratchpad",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-haiku-5-5",
  "session_title": "Spike Eins"
}
```

`SessionStart` (resume) und (clear):

```json
{ "session_id": "ec84ffa6-…", "cwd": "…\\s1-hauptsession", "hook_event_name": "SessionStart",
  "source": "resume", "session_title": "Spike Eins", "seconds_since_last_response": 122,
  "context_tokens": 54074, "prompt_cache_likely_expired": false, "estimated_cache_write_usd": 0.0108 }

{ "session_id": "0f54d6f0-5e3c-45e6-aabf-d76021219bad", "cwd": "…\\s1-hauptsession",
  "hook_event_name": "SessionStart", "source": "clear", "session_title": "Spike Eins" }
```

`UserPromptSubmit` (getippt und durch eine endende Hintergrund-Aufgabe ausgelöst):

```json
{ "session_id": "ec84ffa6-…", "cwd": "…", "prompt_id": "98ba18fe-4a45-4caa-8cf5-8d5be7d92c2d",
  "permission_mode": "default", "hook_event_name": "UserPromptSubmit",
  "prompt": "<redigiert>", "session_title": "Spike Eins" }

{ "session_id": "9a1d2322-…", "cwd": "…\\k-bg", "prompt_id": "29dd8887-…", "permission_mode": "auto",
  "hook_event_name": "UserPromptSubmit", "prompt": "<task-notification>…(gekürzt)…</task-notification>" }
```

`PreToolUse`, `PermissionRequest`, `PostToolUse`:

```json
{ "session_id": "d82f6be1-…", "cwd": "…\\k-interrupt", "prompt_id": "13f55335-…", "permission_mode": "default",
  "effort": { "level": "medium" }, "hook_event_name": "PreToolUse", "tool_name": "Bash",
  "tool_input": { "command": "echo hi > hi.txt", "description": "Write \"hi\" into hi.txt in the current directory" },
  "tool_use_id": "toolu_01GN7rLntzdP67jqsmsXhH5L" }

{ "session_id": "d82f6be1-…", "cwd": "…\\k-interrupt", "prompt_id": "13f55335-…", "permission_mode": "default",
  "effort": { "level": "medium" }, "hook_event_name": "PermissionRequest", "tool_name": "Bash",
  "tool_input": { "command": "echo hi > hi.txt", "description": "Write \"hi\" into hi.txt in the current directory" },
  "permission_suggestions": [ { "type": "addDirectories", "directories": ["…\\k-interrupt"], "destination": "session" } ] }

{ "session_id": "ec84ffa6-…", "cwd": "…", "prompt_id": "e29a665b-…", "permission_mode": "default",
  "effort": { "level": "medium" }, "hook_event_name": "PostToolUse", "tool_name": "Read",
  "tool_input": { "file_path": "…\\s1-hauptsession\\a.txt" },
  "tool_response": { "type": "text", "file": { "filePath": "…\\a.txt", "content": "Inhalt von a\n",
                     "numLines": 2, "startLine": 1, "totalLines": 2 } },
  "tool_use_id": "toolu_01TBrLVN66Kytek7ahUbmvnT", "duration_ms": 259 }
```

`PermissionRequest` für `AskUserQuestion` (danach nach 6,1 s `Notification permission_prompt`):

```json
{ "session_id": "ec84ffa6-…", "cwd": "…", "prompt_id": "a4debf3c-…", "permission_mode": "default",
  "effort": { "level": "medium" }, "hook_event_name": "PermissionRequest",
  "tool_name": "AskUserQuestion", "tool_input": { "questions": "<gekürzt>" } }
```

`Stop` (ohne und mit Hintergrund-Aufgabe):

```json
{ "session_id": "ec84ffa6-…", "cwd": "…", "prompt_id": "98ba18fe-…", "permission_mode": "default",
  "effort": { "level": "medium" }, "hook_event_name": "Stop", "stop_hook_active": false,
  "last_assistant_message": "<redigiert>", "background_tasks": [], "session_crons": [] }

{ "session_id": "9a1d2322-…", "cwd": "…\\k-bg", "prompt_id": "f16d9f98-…", "permission_mode": "auto",
  "effort": { "level": "medium" }, "hook_event_name": "Stop", "stop_hook_active": false,
  "last_assistant_message": "<redigiert>",
  "background_tasks": [ { "id": "b0ynxtly0", "type": "shell", "status": "running",
                          "description": "Run ping for about 25 seconds in background",
                          "command": "ping -n 25 127.0.0.1" } ],
  "session_crons": [] }
```

`Notification`:

```json
{ "session_id": "ec84ffa6-…", "cwd": "…", "prompt_id": "e29a665b-…", "hook_event_name": "Notification",
  "message": "Claude needs your permission", "notification_type": "permission_prompt" }

{ "session_id": "ec84ffa6-…", "cwd": "…", "prompt_id": "98ba18fe-…", "hook_event_name": "Notification",
  "message": "Claude is waiting for your input", "notification_type": "idle_prompt" }
```

`SessionEnd`:

```json
{ "session_id": "ec84ffa6-…", "cwd": "…", "prompt_id": "54415c25-…", "hook_event_name": "SessionEnd", "reason": "clear" }
{ "session_id": "0f54d6f0-…", "cwd": "…", "prompt_id": "1c2ab0af-…", "hook_event_name": "SessionEnd", "reason": "prompt_input_exit" }
{ "session_id": "8c74988d-a942-4021-a698-4b97d7977f8b", "cwd": "…\\k-resume-missing", "hook_event_name": "SessionEnd", "reason": "other" }
```

### Gemessene Zeiten

| Messung | Wert |
|---|---|
| `PermissionRequest` nach `PreToolUse` | 46 bis 106 ms |
| `Notification permission_prompt` nach `PermissionRequest` | 6,0 s (Read), 6,05 s (Bash), 6,1 s (AskUserQuestion) |
| `Notification idle_prompt` nach `Stop` | 60,3 s, 60,5 s, 60,6 s |
| `idle_prompt` nach Unterbrechung (Esc) | kam in 4 Fällen nicht innerhalb von 80 s |
| `SessionStart(clear)` nach `SessionEnd(clear)` | 0,4 s |
| curl-Weiterleitung `SessionStart` | 122 bis 223 ms |
| HTTP-Hook auf geschlossenen Port | etwa 13 ms bis ECONNREFUSED |
| `/exit` bis Prozessende | 2,0 bis 3,2 s; mit hängendem Empfänger und `timeout: 5` 7,4 s |

## Korrekturen an der Spezifikation

### Hook-Datei („Hook-Empfänger und lokale Schnittstelle“)

1. **„ausschliesslich Hooks vom Typ `http`“ ersetzen:** `SessionStart` wird ein Befehls-Hook in „exec form“ (ohne Shell, `command` plus `args`), der mit `%SystemRoot%\System32\curl.exe` die Nutzdaten von stdin an `POST /hooks/SessionStart` weiterleitet. curl liest die Kopfzeilen selbst aus der Umgebung (`--variable %NAME=` und `--expand-header`, ab curl 8.3; Windows 11 hat 8.21). Getestet in S0, S1, resume-*, recommended. Fehlt `curl.exe`, lässt TermHub den Eintrag weg; dann greift die Rückfallregel in der Zustandstabelle.
2. **Der Endpunkt `/hooks/SessionStart` muss leer antworten:** Die Standardausgabe eines `SessionStart`-Befehls-Hooks landet in Claudes Kontext. curl mit `-s` gibt den Antwortinhalt aus.
3. **`PermissionRequest` zusätzlich registrieren** (HTTP, leere Antwort). Es meldet eine Rückfrage sofort; `Notification permission_prompt` kommt erst nach rund 6 s.
4. **Timeouts konkret:** HTTP-Hooks `timeout: 2`, curl `--connect-timeout 1 -m 2` mit Hook-`timeout: 3`. Hängt der Empfänger, verzögert jeder Hook Claude um bis zu diesen Wert; `/exit` ebenfalls, weil Claude das Budget für `SessionEnd` an den grössten `timeout` anpasst.
5. **„Relevante Felder“ ergänzen:** `prompt_id`, `permission_mode`, `session_title`, `model` (nur `SessionStart`), `background_tasks`. Bei `Notification` die Werte gemäss Abschnitt 2. `elicitation_dialog` bleibt ungeprüft.
6. **Akzeptanzkriterium in Ticket 10 ersetzen:** statt `claude --settings <Datei> --version` (prüft nur die Existenz) die Datei gegen das Schema `https://json.schemastore.org/claude-code-settings.json` prüfen oder einen Start in node-pty ohne Prompt machen, bei dem kein „Settings Warning“ erscheint und `SessionStart` ankommt (wie `kurz.mjs recommended`).

Empfohlene Hook-Datei (vollständig in `spikes/claude-hooks/empfohlene-hook-datei.json`, mit echtem Port im Szenario recommended geprüft):

```json
{
  "hooks": {
    "SessionStart": [ { "hooks": [ {
      "type": "command",
      "command": "C:\\Windows\\System32\\curl.exe",
      "args": ["-s", "-S", "--connect-timeout", "1", "-m", "2", "--noproxy", "*",
               "--variable", "%TERMHUB_TAB_ID=", "--variable", "%TERMHUB_TOKEN=",
               "--expand-header", "X-TermHub-Tab: {{TERMHUB_TAB_ID}}",
               "--expand-header", "X-TermHub-Token: {{TERMHUB_TOKEN}}",
               "-H", "Content-Type: application/json",
               "--data-binary", "@-",
               "http://127.0.0.1:<PORT>/hooks/SessionStart"],
      "timeout": 3 } ] } ],
    "SessionEnd": [ { "hooks": [ {
      "type": "http",
      "url": "http://127.0.0.1:<PORT>/hooks/SessionEnd",
      "timeout": 2,
      "headers": { "X-TermHub-Tab": "$TERMHUB_TAB_ID", "X-TermHub-Token": "$TERMHUB_TOKEN" },
      "allowedEnvVars": ["TERMHUB_TAB_ID", "TERMHUB_TOKEN"] } ] } ]
  }
}
```

Die übrigen Ereignisse (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure`, `Notification`) folgen dem Muster von `SessionEnd`.

### Zustandstabelle („Claude-Status: Zustandsautomat pro Tab“)

Geänderte und neue Zeilen; die übrigen bleiben:

| Eingang | Wirkung (korrigiert) |
|---|---|
| `SessionStart` (alle Quellen; kommt über den curl-Befehls-Hook, nicht als HTTP-Hook) | wie bisher: Kennung und Ordner übernehmen, bestätigt; bei neuer Kennung „hatte Prompt“ zurücksetzen; Zustand „ruht“. Den Ordner normalisieren (`cwd` kann ein 8.3-Kurzpfad sein). |
| **neu:** ein anderes Hook-Ereignis ausser `SessionEnd`, dessen `session_id` von der gespeicherten abweicht oder bei dem keine gespeichert ist | zuerst wie `SessionStart` behandeln (Rückfall, falls der curl-Hook fehlt oder scheitert), dann das Ereignis selbst anwenden |
| `UserPromptSubmit` | wie bisher. Hinweis: kommt auch ohne Tippen, wenn eine Hintergrund-Aufgabe endet (`prompt` beginnt mit `<task-notification>`) |
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure` | „arbeitet“ (beendet auch „wartet“). `PreToolUse` kommt 46 bis 106 ms **vor** `PermissionRequest`; der Empfänger muss Ereignisse eines Tabs in Ankunftsreihenfolge verarbeiten. |
| **neu:** `PermissionRequest` | „wartet auf dich“, sofort beim Erscheinen der Rückfrage (auch bei `AskUserQuestion`) |
| `Notification` mit `permission_prompt` oder `elicitation_dialog` | „wartet auf dich“ (Rückfall; `permission_prompt` kommt erst rund 6 s nach der Rückfrage) |
| `Notification` mit `idle_prompt` | **keine Änderung.** Kommt nur rund 60 s nach `Stop` und nie nach einer Unterbrechung mit Esc. Die bisherige Begründung („fängt Unterbrechungen mit Esc auf“) streichen. |
| **neu:** Esc-Taste im Claude-Tab, während der Zustand „arbeitet“ oder „wartet“ ist (die Taste geht durch TermHub zum Terminal) | „ruht“, wenn innerhalb von etwa 1,5 s kein weiteres Hook-Ereignis kommt; „fertig, noch nicht angeschaut“ nicht setzen. Grund: Nach Esc (Unterbrechung oder abgelehnte Rückfrage) kommt kein Hook mehr. Ohne diese Zeile bliebe der Tab bis zum nächsten Prompt violett oder orange. |
| **neu:** andere Eingabe im Claude-Tab, während der Zustand „wartet“ ist | „arbeitet“. Grund: Nach dem Bestätigen einer Rückfrage kommt erst `PostToolUse`, wenn das Werkzeug fertig ist; bei einem langen Befehl bliebe der Tab sonst orange. |
| `SessionEnd` mit Grund `clear` oder `resume` | wie bisher keine Änderung; `SessionStart` mit neuer Kennung folgt nach etwa 0,4 s (bzw. die Rückfallregel beim nächsten Ereignis) |
| `SessionEnd` mit anderem Grund | Tab wird normales Terminal, **ausser** es gab noch kein `SessionStart` (unbestätigt) nach einem von TermHub gestarteten Fortsetzen: dann entscheidet erst die Ende-Meldung des Starters. Grund: Ein fehlgeschlagenes `--resume` meldet `SessionEnd other` etwa 1,5 s **vor** der Ende-Meldung mit Exit-Code 1. |
| Ende-Meldung **ohne** vorheriges `SessionStart`, Exit-Code ≠ 0, nach einem von TermHub gestarteten Fortsetzen | wie bisher Hinweis „Claude-Session konnte nicht fortgesetzt werden“. Die Bedingung bleibt gültig: Exit-Code 1 bei unbekannter Kennung, bei abgelehntem Vertrauensdialog und bei bereits benutzter `--session-id`. Exit-Code 0 nach `/exit` und nach zweimal `Ctrl+C`. |

Unverändert bestätigt: Ende der Shell bzw. Schliessen des Pseudoterminals erzeugt kein `SessionEnd`. Das Einfrieren beim Beenden durch TermHub bleibt nötig, die Ende-Meldung des Starters ist das verlässliche Signal.

### Starter-Regeln („Shell-Integration“, Punkt 2)

1. **Schritt 4, eigenes `--settings`:** Die Regel „kein TermHub-`--settings`, wenn der Nutzer selbst eines angibt“ ist richtig und wird begründet: Bei mehreren `--settings` gilt nur das letzte, ohne Fehlermeldung. Hängte der Starter seines an, gingen die Einstellungen des Nutzers still verloren. (Möglich, aber nicht nötig: die Datei bzw. das JSON des Nutzers mit den TermHub-Hooks zu einer temporären Datei zusammenführen.)
2. **Schritt 2, Fall „mit Kennung“ über `--session-id`:** Eine bereits benutzte Kennung endet mit `Error: Session ID … is already in use.` und Exit-Code 1, ohne Hooks. Unverändert durchreichen; da kein von TermHub gestartetes Fortsetzen, kein Hinweis.
3. **Schritt 4, Fall „neu“:** `--session-id <neue Kennung>` und `-n <Tab-Name>` bestätigt; der Name bleibt bei `/clear` und `--resume` erhalten (`session_title`), auch mit Umlauten.
4. **Startbefehl zum Fortsetzen:** `--resume <Kennung>` funktioniert ordnerübergreifend, Claude arbeitet dann aber im aktuellen Ordner (`cwd` im `SessionStart`). Die Regel „Shell im Ordner der Session starten“ ist daher zwingend. Ist der Ordner (noch) nicht vertraut, erscheint vor jedem Hook der Vertrauensdialog; „No, exit“ ergibt Exit-Code 1 ohne `SessionStart`, also den Hinweis „konnte nicht fortgesetzt werden“. Das ist vertretbar.
5. **Schritt 6, Exit-Codes:** `/exit` → 0, zweimal `Ctrl+C` → 0, unbekannte Kennung → 1, Vertrauensdialog abgelehnt → 1, benutzte `--session-id` → 1. „Exit-Code ≠ 0“ trennt also nicht zwischen `Ctrl+C` und `/exit`, wohl aber zwischen normalem Ende und gescheitertem Start.

### „Weitere Hinweise“

- **Grundlage der Claude-Anbindung** ergänzen bzw. berichtigen:
  - HTTP-Hooks werden für `SessionStart` nicht unterstützt; TermHub nutzt dafür einen Befehls-Hook mit `curl.exe`.
  - Nicht erreichbare HTTP-Hooks blockieren nicht, erzeugen aber pro Ereignis eine sichtbare Fehlerzeile im Terminal. Ein hängender Empfänger verzögert jedes Ereignis bis zum Timeout.
  - `Stop` läuft nicht nach Esc (bestätigt), **`idle_prompt` ebenfalls nicht**.
  - `Notification permission_prompt` kommt erst rund 6 s nach der Rückfrage, `PermissionRequest` sofort.
  - Bei mehreren `--settings` gilt nur das letzte.
- **Offen zu prüfen** aktualisieren:
  - `disableAllHooks` (Story 38, Ticket 12): geprüft. Ein `"disableAllHooks": true` im Projekt schaltet auch die TermHub-Hooks ab; das Fortsetzen über die selbst vergebene Kennung bleibt möglich.
  - `allowManagedHooksOnly`: weiterhin offen (nur mit verwalteten Einstellungen prüfbar).
  - `elicitation_dialog` (MCP-Formular), `SessionStart.source` `compact`/`fork`, `SessionEnd.reason` `resume`/`logout`, `PostToolUseFailure`, `StopFailure`: nicht ausgelöst.
  - `NO_PROXY` mit Firmen-Proxy: nicht geprüft.

## Grenzen des Spikes

- In S1 schluckte die unerwartete Rückfrage für `Read` (Modus „manual“) den Text des dritten Prompts; das abschliessende Enter bestätigte das Lesen von `a.txt` im Temp-Ordner. Die Bash-Rückfrage mit Ablehnung wurde deshalb im Szenario interrupt sauber wiederholt. Das „Esc“ bei 243,6 s in S1 fiel in einen ruhenden Zustand und ist ohne Aussage.
- Im ersten Esc-Versuch (interrupt A, esc) war die Antwort von Haiku schon fertig; esc 2000 zeigt die Unterbrechung während der Antwort.
- Die Rückfragen wurden mit `--permission-mode manual` erzwungen. Im Standardmodus „auto“ des Nutzers erscheinen Rückfragen seltener; die Hook-Abfolge bleibt dieselbe.

## Agenten (Ticket 37)

Stand: 2026-11-27 · Claude Code 2.1.332 · Windows 11 · Skript `spikes/claude-hooks/agenten.mjs`, Zeitachsen aller Läufe in `spikes/claude-hooks/befunde-agenten.json`, redigierte Beispiele in `spikes/claude-hooks/samples/` (`SubagentStart`, `SubagentStop`, `SubagentStop-helfer`, `Stop-mit-agent`, `UserPromptSubmit-agent-message`, `UserPromptSubmit-task-notification-agent`, `UserPromptSubmit-task-notification-agent-killed`, `PreToolUse-Agent`, `PostToolUse-Agent`, `*-aus-agent`, `PostToolBatch`).

Frage aus Ticket 37: Warum zeigt ein Claude-Tab „ruht“, obwohl darin noch ein Agent rechnet, und welche Hook-Ereignisse braucht THub, um „arbeitet“ bis zum Schluss zu zeigen?

### Kurzfassung

1. **`SubagentStart` und `SubagentStop` kommen per HTTP-Hook an.** HTTP-Hooks überspringt Claude Code nur bei `SessionStart` und `Setup` (im installierten Programm nachgesehen). Laut dessen Beschreibung kommt `SubagentStart`, wenn ein Agent (Werkzeug `Agent`) startet, mit `agent_id` und `agent_type`; `SubagentStop` kommt, kurz bevor er seine Antwort abschliesst, dazu mit `agent_transcript_path`.
2. **Alle Ereignisse aus Agenten tragen die `session_id` der Hauptsession**, dazu `agent_id` und `agent_type`. Agenten haben keine eigene Session. Nach `/clear` tragen auch die Ereignisse der weiterlaufenden Agenten die Kennung der neuen Session.
3. **Agenten laufen in 2.1.332 standardmässig im Hintergrund** (Beschreibung des Parameters: „Agents run in the background by default“). Haiku liess `run_in_background` in allen Läufen weg, auch auf die ausdrückliche Bitte um `false`. Einen Agenten im Vordergrund gab es in der Messung deshalb nicht.
4. **Der vermutete Ablauf aus dem Ticket stimmt:** Claude startet den Agenten (`PreToolUse` mit `Agent`, `SubagentStart`, gleich danach `PostToolUse`) und endet mit `Stop`, während der Agent rechnet. Bisher stand der Tab dann auf „ruht“ bzw. grün und wurde erst mit dem nächsten `PreToolUse` des Agenten wieder violett.
5. **`Stop.background_tasks` führt laufende Agenten:** `{ "id": <agent_id>, "type": "subagent", "status": "running", "description", "agent_type" }`, neben Befehlen im Hintergrund (`"type": "shell"`). Bei `SubagentStop` steht der endende Agent selbst noch als `running` darin.
6. **Ende eines Agenten:** Er übergibt seinen Bericht mit dem Werkzeug `SubagentHandback`, und Claude bekommt ihn sofort als Prompt `<agent-message from="<agent_id>">` (`UserPromptSubmit`), 0,4 bis 0,8 s **vor** `SubagentStop`. Ohne Übergabe kommt 0,1 s nach `SubagentStop` eine Meldung `<task-notification>` mit `<task-id>` gleich der `agent_id`. In beiden Fällen arbeitet Claude von selbst weiter und endet wieder mit `Stop`.
7. **Weitere Meldungen nach Claudes `Stop`:** Kommt ein Bericht, während Claude noch arbeitet, wartet er und kommt 0,3 s nach `Stop`. Hinterlässt ein Agent eigene Hintergrund-Arbeit, kommt nach `Stop` noch eine Zwischenmeldung (`<task-notification>`, „is waiting on its own background work“, 0,6 s nach `Stop`); endet die Arbeit, wird der Agent wieder aufgenommen (`SubagentStart` mit derselben `agent_id`). Ohne Frist hätte THub in beiden Fällen zweimal kurz hintereinander „fertig“ gemeldet.
8. **Esc unterbricht nur Claude selbst:** Danach kommt kein Ereignis der Hauptsession mehr, der Agent rechnet weiter und endet normal (Bericht, `SubagentStop`, `Stop`). Esc im Ruhezustand ändert nichts.
9. **Gestoppte Agenten melden kein `SubagentStop`**, weder über die Aufgabenliste (`/tasks`, Taste `x`) noch durch Claude (Werkzeug `TaskStop`). Claude bekommt eine `<task-notification>` mit `<status>killed</status>` (bei der Aufgabenliste erst, wenn sie wieder geschlossen ist), und im nächsten `Stop` fehlt der Agent in `background_tasks`.
10. **`/clear` beendet laufende Agenten nicht.** Nach `SessionEnd` (`clear`) und `SessionStart` (`clear`) mit neuer Kennung rechnen sie weiter und melden Bericht, `SubagentStop` und Claudes `Stop` in der neuen Session.
11. **`/exit` mit laufender Hintergrund-Arbeit** fragt: „Background work is running … 1. Exit and stop tasks, 2. Move to background and exit, 3. Stay“. Nach 1. kommt `SessionEnd` (`prompt_input_exit`) ohne `SubagentStop`.
12. **Rückfrage aus einem Agenten** (Berechtigungsmodus „manual“): `PermissionRequest` mit `agent_id` und `agent_type`, sofort. Die Rückfrage steht in der Hauptansicht („Bash command · from the general-purpose agent“), auch wenn Claude schon ruht. Eine `Notification` dazu kam nicht. Nach der Antwort kommt `PostToolUse` des Agenten.
13. **Hilfs-Agenten von Claude Code:** Nach jedem `Stop` (0,6 bis 1,5 s später) meldet Claude Code ein `SubagentStop` mit leerem `agent_type` und einer `agent_id`, zu der es nie ein `SubagentStart` gab. Im Eingabefeld erscheint dann ein Vorschlag für den nächsten Prompt; vermutlich ist das dieser Helfer. Diese Ereignisse gehören zu keinem Agenten des Nutzers.
14. **Neu in 2.1.332:** `PostToolBatch` nach jedem Bündel von Werkzeugen, auch aus Agenten (THub braucht es nicht). `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `PreCompact` und `PostCompact` waren registriert, kamen aber nicht vor.

### Aufbau

- Wie oben: Ein Node-Skript startet einen Empfänger auf `127.0.0.1`, schreibt eine Hook-Datei und startet das installierte `claude.exe` in node-pty in einem Arbeitsordner im Temp-Ordner, ohne die geerbten `CLAUDE*`- und `THUB_*`-Variablen, mit `--model haiku` und der Konfiguration des Nutzers (Modus „auto“; zwei Läufe mit `--permission-mode manual`). Kopfzeilen und Variablen heissen im Skript `X-Spike-Tab` bzw. `SPIKE_TAB_ID`, damit nichts mit einer laufenden THub verwechselt wird.
- Die Hook-Datei registriert alle Ereignisse, die per HTTP ankommen können: `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `PermissionRequest`, `PermissionDenied`, `Notification`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `PreCompact`, `PostCompact`; dazu `SessionStart` über curl. Die Liste stammt aus dem installierten Programm.
- Jeder Lauf hat eine harte Zeitgrenze von 240 s (danach `taskkill /T` auf die eigene Prozess-ID), von aussen zusätzlich `timeout 300`. Das Skript bringt einen kleinen Nachbau des Bildschirms mit; `@xterm/headless` ist nicht nötig.
- Ein Agent wartet mit `ping -n <Sekunden+1> 127.0.0.1 > /dev/null`. `sleep 30` allein im Vordergrund blockiert Claude Code selbst („standalone sleep“); im ersten Lauf startete der Agent es deshalb im Hintergrund.
- Im Vertrauensdialog ist in 2.1.332 „No, exit“ vorausgewählt. Der erste Versuch endete dort, ohne Prompt.
- **Kosten:** 9 Prompts, die bei Claude ankamen. Bestätigt wurde nur das Schreiben von `hi.txt` im Arbeitsordner (Temp).

| Szenario | Prompts | Was es prüft |
|---|---|---|
| `hintergrund` | 1 | ein Agent im Hintergrund; Claude endet, während er läuft. Der Agent legte sein `sleep 30` selbst in den Hintergrund und hinterliess es (Zwischenmeldung, Wiederaufnahme). Danach `/exit` mit laufendem Befehl im Hintergrund |
| `zwei` | 1 | zwei Agenten (10 und 35 s), die nacheinander enden |
| `esc` | 1 | Esc, während Claude selbst einen Befehl ausführt und ein Agent läuft (45 s); danach Esc im Ruhezustand |
| `stoppen` | 2 | Agent durch Claude gestoppt (`TaskStop`). Der Versuch über die Aufgabenliste scheiterte: Bei einem einzigen Agenten öffnet `/tasks` gleich dessen Ansicht, und Enter schloss sie wieder |
| `drei` | 1 | drei Agenten: einer über die Aufgabenliste gestoppt (`x`), dann `/clear`, während zwei weiterlaufen |
| `exit` | 1 | `/exit`, während ein Agent läuft |
| `rueckfrage` | 1 | Rückfrage aus einem Agenten (Modus „manual“). Der Agent lief im Hintergrund und fragte nach Claudes `Stop`. Ein zweiter getippter Prompt landete im Dialog; sein Enter bestätigte „Yes“ |
| `vordergrund` | 1 | Agent ausdrücklich im Vordergrund verlangt; er lief trotzdem im Hintergrund. Rückfrage, mit `1` bestätigt |

Reproduzieren: `npm ci` im Wurzelordner, dann in `spikes/claude-hooks/` zum Beispiel `node agenten.mjs zwei` und danach `node agenten.mjs samples`.

### Zeitachsen

Sekunden ab dem Start des Laufs; `S1`, `S2` sind Sessions, `A1`, `A2` Agenten, „Helfer“ ein `SubagentStop` ohne `SubagentStart`. `PostToolBatch` ist weggelassen. Alle Läufe vollständig in `befunde-agenten.json`.

Zwei Agenten (`zwei`), der typische Ablauf mit Übergabe:

```
22.9  UserPromptSubmit                                   S1
25.8  PreToolUse Agent, 26.2 PreToolUse Agent            S1
26.9  SubagentStart A1, SubagentStart A2                 S1
27.0  PostToolUse Agent (2x)                             S1
28.2  Stop                 background_tasks [A1, A2]     S1   ← Claude ruht, zwei Agenten rechnen
29.3  SubagentStop (Helfer)                              S1
39.5  PostToolUse Bash                    aus A1         S1
41.2  UserPromptSubmit <agent-message from A1>           S1   ← Bericht von A1
42.0  SubagentStop A1      background_tasks [A1, A2]     S1
43.7  Stop                 background_tasks [A2]         S1
64.9  PostToolUse Bash                    aus A2         S1
66.7  UserPromptSubmit <agent-message from A2>           S1
67.2  SubagentStop A2      background_tasks [A2]         S1
68.0  Stop                 background_tasks []           S1   ← alles fertig
68.6  SubagentStop (Helfer)                              S1
```

Esc (`esc`):

```
21.3  UserPromptSubmit                                   S1
25.8  SubagentStart A1                                   S1
26.4  PreToolUse Bash     (Claude selbst)                S1
28.1  PreToolUse Bash                     aus A1         S1
29.4  Esc                                                     ← „Interrupted · What should Claude do instead?“
47.4  Esc (Claude ruht, A1 rechnet)                           ← keine Wirkung
74.0  PostToolUse Bash                    aus A1         S1
75.8  UserPromptSubmit <agent-message from A1>           S1
76.6  SubagentStop A1      background_tasks [A1]         S1
78.9  Stop                 background_tasks []           S1
```

Stoppen über die Aufgabenliste und `/clear` (`drei`):

```
33.5  Stop                 background_tasks [A1, A2, A3] S1
41.4  x in /tasks (A3)                                        ← „Background update waiting while this panel is open“
52.4  Esc (Liste zu)
52.6  UserPromptSubmit <task-notification A3 killed>     S1   ← kein SubagentStop für A3
55.0  Stop                 background_tasks [A1, A2]     S1
56.7  SessionEnd clear                                   S1
57.2  SessionStart clear                                 S2
80.0  PostToolUse Bash                    aus A1         S2   ← A1, A2 rechnen weiter, jetzt mit S2
82.3  UserPromptSubmit <agent-message from A1>           S2
82.8  SubagentStop A1      background_tasks [A1, A2]     S2
83.2  SubagentStop A2      background_tasks [A2]         S2
84.2  Stop                 background_tasks []           S2
84.5  UserPromptSubmit <agent-message from A2>           S2   ← wartender Bericht, 0,3 s nach Stop
86.1  Stop                 background_tasks []           S2
```

Agent mit eigener Hintergrund-Arbeit (`hintergrund`):

```
14.5  UserPromptSubmit                                   S1
17.0  SubagentStart A1, PostToolUse Agent                S1
18.1  Stop                 background_tasks [A1]         S1
21.2  PreToolUse Bash (sleep 30 im Hintergrund)  aus A1  S1
26.7  UserPromptSubmit <agent-message from A1>           S1
27.1  SubagentStop A1      background_tasks [A1, Befehl] S1
29.4  Stop                 background_tasks [Befehl]     S1
30.0  UserPromptSubmit <task-notification A1 completed>  S1   ← „waiting on its own background work“, 0,6 s nach Stop
31.4  Stop                 background_tasks [Befehl]     S1
37.4  /exit                                                   ← Dialog „Background work is running“
53.3  SubagentStart A1 (Wiederaufnahme, sleep fertig)    S1
54.5  SubagentStop A1                                    S1
58.1  SessionEnd prompt_input_exit (nach „Exit and stop tasks“)  S1
```

Rückfrage aus einem Agenten, ohne Übergabe (`vordergrund`):

```
19.2  UserPromptSubmit                                   S1
21.1  SubagentStart A1, PostToolUse Agent                S1
22.5  PreToolUse Bash                     aus A1         S1
22.6  PermissionRequest Bash              aus A1         S1
23.2  Taste 1 (Ja, hi.txt im Arbeitsordner)
23.6  PostToolUse Bash                    aus A1         S1
23.8  Stop                 background_tasks [A1]         S1
24.8  SubagentStop A1      background_tasks [A1]         S1
24.9  UserPromptSubmit <task-notification A1 completed>  S1   ← 0,1 s nach SubagentStop
26.2  Stop                 background_tasks []           S1
```

### Gemessene Zeiten

| Messung | Wert |
|---|---|
| `SubagentStart` nach `PreToolUse` (`Agent`) | 0,1 bis 1,2 s |
| `PostToolUse` (`Agent`) nach `SubagentStart` (Hintergrund) | 0,05 bis 0,1 s |
| Bericht (`<agent-message>`) vor `SubagentStop` | 0,4 bis 0,8 s (5 Fälle) |
| `<task-notification>` nach `SubagentStop`, ohne Übergabe | 0,1 s (2 Fälle) |
| wartende Meldung nach Claudes `Stop` | 0,3 s (Bericht), 0,6 s (Zwischenmeldung) |
| `<task-notification>` mit `killed` nach dem Stoppen | 0,3 s nach `TaskStop`; über die Aufgabenliste 0,2 s nach dem Schliessen der Liste |
| Helfer-`SubagentStop` nach `Stop` | 0,6 bis 1,5 s |

### Folgen für THub

- Die Hook-Datei bekommt `SubagentStart` und `SubagentStop` (HTTP, wie die übrigen), die Vorlage `empfohlene-hook-datei.json` ebenso.
- Laufende Agenten führt der Kern pro Tab: `SubagentStart` fügt hinzu, `SubagentStop` nimmt weg, `Stop` gleicht mit `background_tasks` ab (das fängt gestoppte Agenten ohne `SubagentStop`), und eine `<task-notification>` über einen Agenten nimmt ihn ebenfalls weg. Ein `SubagentStop` ohne bekannten Agenten (Helfer) zählt nicht.
- Der Bericht kommt vor `SubagentStop`, weitere Meldungen erst nach Claudes `Stop`. Deshalb wartet THub nach dem Ende eines Agenten im Hintergrund nach Claudes `Stop` noch eine Frist auf eine Meldung über ihn. Gewählt sind 3 s, rund das Fünffache der längsten gemessenen Verzögerung (0,6 s); so sind auch langsame `Stop`-Hooks des Nutzers abgedeckt, die Claude vor der nächsten Runde abwartet.
- Ereignisse mit `agent_id` ändern die Claude-Zuordnung nie. In 2.1.332 wäre das nicht nötig (gleiche `session_id`), es schützt aber vor einem Umhängen, falls sich das ändert.
- `/clear` leert die Liste der Agenten nicht, weil sie weiterrechnen.

### Grenzen

- Einen Agenten im Vordergrund liess Haiku nicht erzeugen. Dass ein solcher Agent bei `SubagentStop` nicht in `background_tasks` steht, ist eine Annahme; THub behandelt ihn dann wie bisher (violett bis Claudes `Stop`).
- Was Esc mit einem Agenten im Vordergrund macht, ist ungeprüft.
- „Move to background and exit“ im Dialog von `/exit` ist ungeprüft.
- Agenten-Teams (eigene Sessions pro Mitglied) sind ausserhalb von Ticket 37 und nicht gemessen; die Variablen dafür wurden für die Messung entfernt.
- Beim Start räumt Claude Code verwaiste Ordner unter `~/.claude/teams` auf (Debug-Log „cleanupSessionTeams“); das tut jeder Start, auch ausserhalb der Messung.

## Statuszeile (Ticket 38)

Stand: 2026-11-27 · Claude Code 2.1.332 · Windows 11 · Skript `spikes/claude-hooks/statuszeile.mjs`, Zeitachsen aller Läufe in `spikes/claude-hooks/befunde-statuszeile.json`, redigiertes Beispiel in `spikes/claude-hooks/samples/StatusLine.json`.

Fragen aus Ticket 38: Wie führt Claude Code unter Windows den Befehl einer Statuszeile aus, und klappt darin die Weiterleitung mit `curl.exe`? Welche Felder kommen wann an? Was kostet eine Session nach dem Fortsetzen? Ersetzt der Eintrag aus `--settings` die Statuszeile des Nutzers wirklich?

### Kurzfassung

1. **Keine Exec-Form.** Der Eintrag `statusLine` kennt in 2.1.332 nur `type: "command"`, `command`, `padding`, `refreshInterval` (Sekunden, mindestens 1) und `hideVimModeIndicator` (Schema im installierten Programm). `args` und `shell` fallen beim Lesen weg. Ein Eintrag wie der curl-Hook für `SessionStart` (`command` plus `args`) lief deshalb als blosse Zeichenkette `C:\Windows\System32\curl.exe` durch Git Bash, die die `\` schluckte: „/usr/bin/bash: line 1: C:WindowsSystem32curl.exe: command not found“, Status 127 (Debug-Log, Lauf `form-exec`).
2. **Ausführung wie ein Befehls-Hook ohne `args`** (im installierten Programm nachgesehen): unter Windows mit Git Bash, falls Claude sie findet (`CLAUDE_CODE_GIT_BASH_PATH`, sonst `C:\Program Files\Git\bin\bash.exe`, `C:\Program Files (x86)\Git\bin\bash.exe`, sonst neben `git` im PATH), sonst mit PowerShell (`pwsh` bzw. `powershell` mit `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command`). Das JSON kommt auf stdin, dazu die ganze Umgebung von Claude. Die Ausgabe (stdout) zeigt Claude als Statuszeile, leere Zeilen fallen weg.
3. **Die Weiterleitung mit `curl.exe` klappt als Zeichenkette**, die beide Shells gleich lesen: Pfad mit `/` und ohne Anführungszeichen (`C:/Windows/System32/curl.exe`), jedes Argument mit Sonderzeichen in einfachen Anführungszeichen, `--variable %THUB_TAB_ID=` und `--expand-header` wie beim curl-Hook (siehe „Folgen für THub“). In Claude (Git Bash) kam das JSON bei jedem Aufruf an, mit Tab und Token in den Kopfzeilen. Ohne Claude (Lauf `shells`) dieselbe Zeichenkette in Git Bash (`bash -c`), Windows PowerShell 5.1 und PowerShell 7: JSON byte-genau angekommen, auch Umlaute und «», Ausgabe leer. Mit einer fast leeren Umgebung (nur `SystemRoot`, `PATH`, Tab und Token) startete Windows PowerShell den Befehl nicht und endete trotzdem mit 0; Claude gibt aber seine ganze Umgebung mit.
4. **`--settings` geht vor.** Mit dem Eintrag aus `--settings` lief nur dieser Befehl: weder die Statuszeile des Projekts (`.claude/settings.local.json` im Arbeitsordner, Ausgabe „PROJEKT-STATUSZEILE“) noch die des Nutzers (in `~/.claude/settings.json` ein Python-Skript mit zwei Zeilen) erschien. Ohne den Eintrag erschien die des Projekts (Lauf `ohne`), ohne Projekteinstellungen die des Nutzers (Lauf `nutzer`). Hat der Nutzer keine eigene Statuszeile, ist der Eintrag aus `--settings` der einzige; geprüft in der Test-App mit echtem Claude und einer Konfiguration ohne Statuszeile (siehe Ticket 38, „Hinweise aus der Umsetzung“). Die Einstellungen werden zusammengeführt: Setzt der Nutzer in seiner Statuszeile `padding` oder `refreshInterval`, gilt das auch für den Eintrag aus `--settings` (beim Nutzer nur `padding: 0`).
5. **Leere Ausgabe heisst keine Zeile.** Mit der Statuszeile des Projekts stand zwischen der unteren Linie des Eingabefelds und der Zeile mit dem Modus eine Zeile, mit der des Nutzers zwei. Mit leerer Ausgabe folgt der Modus direkt auf die Linie; der Bereich unter dem Eingabefeld wird um diese Zeilen kleiner.
6. **Felder:** `model.id` (`claude-haiku-5-5`), `model.display_name` (`Haiku 5.5`), `cost.total_cost_usd` (dazu Dauer und geänderte Zeilen), `rate_limits.five_hour` und `rate_limits.seven_day` mit `used_percentage` und `resets_at` (Sekunden seit 1970, volle Stunde), daneben `context_window`, `prompt_cache`, `effort`, `thinking`, `session_name`, `scratchpad_dir` usw. (Beispiel unten).
   - `used_percentage` rechnet Claude aus dem Anteil, den die API meldet (`utilization`, 0 bis 1), auf eine Nachkommastelle gerundet und auf 100 begrenzt. `utilization` selbst kommt in 2.1.332 nicht vor.
   - Weitere Schlüssel in `rate_limits` kennt 2.1.332 nur hinter einem Gateway (`spend_limit` mit `used_usd`, `limit_usd`, `period`). Wochenlimits pro Modell oder `extra_usage` stehen nicht im JSON der Statuszeile.
   - Ein Fenster, dessen `resets_at` vorbei ist, lässt Claude weg, bis die API es wieder meldet (laut Beschreibung im Programm).
7. **Ab wann es `rate_limits` gibt:** Bei 3 von 6 frischen Starts stand es schon im ersten Aufruf, vor jedem Prompt; Claude kennt die Limits offenbar aus einer Anfrage beim Start. Sonst kam es erst später (im Lauf `intervall` 3,6 s nach dem ersten Aufruf, im Lauf `form-ps` gar nicht, weil Claude ohne Anlass nicht neu aufrief) bzw. mit der ersten Antwort. Nach `--resume` fehlte es beim Start. Ohne Abo, mit API-Schlüssel: geprüft nur in der Test-App ohne Verbindung zur API; kein `rate_limits`, Modell und Kosten (0) kamen an.
8. **Takt:** Claude ruft den Befehl auf beim Start (1,2 bis 4,2 s nach `SessionStart`), nach jeder Antwort zweimal (0,3 bis 0,6 s und 1,2 bis 1,5 s nach `Stop`; beim zweiten Mal mit höheren Kosten, vermutlich durch Hilfsanfragen nach der Antwort), nach `/clear` (0,2 s nach dem neuen `SessionStart`) und nach einer neuen Grösse des Terminals (0,6 s), jeweils mit den Limits aus seiner letzten Antwort. Im Leerlauf ruft er ihn nicht auf (40 s nach einer Antwort, 20 s nach dem Start: keiner). Laut Programm ausserdem bei jeder Änderung von Modell, Berechtigungsmodus, Vim-Modus, Aufwand, Denken, Ordner oder Session-Name, bei neuer Token-Nutzung während einer Antwort (alles um 300 ms entprellt), zum frühesten `resets_at` plus 1 s und wenn der Prompt-Cache abläuft.
9. **`refreshInterval`:** Mit 2 ruft Claude den Befehl auch im Leerlauf alle 2 s auf (8 Aufrufe in 15 s).
10. **Kosten nach dem Fortsetzen:** `--resume` beginnt nicht bei 0. Die fortgesetzte Session meldete beim Start $0.0104, den letzten Stand vor dem Beenden, nach einem Prompt $0.0144. `/clear` beginnt eine neue Session (neue Kennung) mit $0.
11. **Vertrauen und `disableAllHooks`:** Vor dem Vertrauensdialog läuft keine Statuszeile; mit `disableAllHooks` ebenfalls nicht (Warnung „Status line is configured but disableAllHooks is true“ im Programm; nicht gemessen).
12. **Die Datei aus `--settings` beobachtet Claude nicht** (Debug-Log „Watching for changes in setting files …“ nennt nur die Dateien des Nutzers und des Projekts). Eine laufende Session übernimmt eine geänderte Hook-Datei also nicht.

### Aufbau

- Wie bei den Messungen zu den Tickets 10 bis 13 und 37: eigener Empfänger auf `127.0.0.1` (antwortet leer), eigene Datei per `--settings` (curl-Hook für `SessionStart`, HTTP-Hooks für `SessionEnd`, `UserPromptSubmit`, `Stop`, dazu je nach Lauf `statusLine`), das installierte `claude.exe` in node-pty in einem Arbeitsordner im Temp-Ordner, ohne die geerbten `CLAUDE*`- und `THUB_*`-Variablen, `--model haiku`, mit der Konfiguration des Nutzers. Kopfzeilen und Variablen heissen `X-Spike-Tab` bzw. `SPIKE_TAB_ID`.
- Die Statuszeile des Projekts stand in `.claude/settings.local.json` des Arbeitsordners (`echo PROJEKT-STATUSZEILE`); die Einstellungen des Nutzers blieben unverändert.
- Jeder Lauf hatte eine harte Zeitgrenze von 180 s (danach `taskkill /T` auf die eigene Prozess-ID), von aussen zusätzlich `timeout 240`.
- **Kosten:** 2 Prompts (`haupt`, `fortsetzen`), alle anderen Läufe ohne Prompt.

| Lauf | Prompts | Was er prüft |
|---|---|---|
| `form exec` | 0 | Eintrag in Exec-Form (`command` plus `args`), Statuszeile des Projekts daneben |
| `form bash` | 0 | dieselbe Weiterleitung als Zeichenkette |
| `form ps` | 0 | dieselbe Zeichenkette mit `"shell": "powershell"` (fällt weg, lief wie `bash`) |
| `shells` | 0 | ohne Claude: die Zeichenkette in Git Bash, Windows PowerShell und PowerShell 7 |
| `haupt bash` | 1 | Felder vor und nach der ersten Antwort, Takt beim Start, nach der Antwort und 40 s im Leerlauf |
| `fortsetzen bash` | 1 | `--resume` der Session aus `haupt`: Kosten beim Start, nach einem Prompt und nach `/clear` |
| `intervall bash` | 0 | `refreshInterval: 2` im Leerlauf |
| `groesse` | 0 | neue Grösse des Terminals |
| `ohne` | 0 | ohne Eintrag `statusLine`: die Statuszeile des Projekts erscheint |
| `nutzer` | 0 | ohne Eintrag und ohne Projekteinstellungen: die Statuszeile des Nutzers erscheint |

Reproduzieren: `npm ci` im Wurzelordner, dann in `spikes/claude-hooks/` zum Beispiel `node statuszeile.mjs form bash` und danach `node statuszeile.mjs samples`.

### Beispiel (redigiert)

Nach einer Antwort in einer fortgesetzten Session (`fortsetzen bash`), gekürzt; vollständig in `samples/StatusLine.json`:

```json
{
  "session_id": "<session-id>",
  "model": { "id": "claude-haiku-5-5", "display_name": "Haiku 5.5" },
  "version": "2.1.332",
  "cost": { "total_cost_usd": 0.014391390000000002, "total_duration_ms": 81837, "total_api_duration_ms": 2947,
            "total_lines_added": 0, "total_lines_removed": 0 },
  "context_window": { "total_input_tokens": 54832, "context_window_size": 1000000, "used_percentage": 5, "…": "…" },
  "prompt_cache": { "warm": true, "ttl": "1h", "expires_at": 1795776423, "…": "…" },
  "rate_limits": {
    "five_hour": { "used_percentage": 56, "resets_at": 1795780800 },
    "seven_day": { "used_percentage": 26, "resets_at": 1795834800 }
  }
}
```

### Folgen für THub

- Die Hook-Datei bekommt einen Eintrag `statusLine` mit einer Zeichenkette statt der Exec-Form:

  ```
  C:/Windows/System32/curl.exe -s -S --connect-timeout 1 -m 2 --noproxy '*' --variable %THUB_TAB_ID=
    --variable %THUB_TOKEN= --expand-header 'X-THub-Tab: {{THUB_TAB_ID}}' --expand-header 'X-THub-Token: {{THUB_TOKEN}}'
    -H 'Content-Type: application/json' --data-binary '@-' http://127.0.0.1:<PORT>/claude/statusline
  ```

  (eine Zeile; vollständig in `empfohlene-hook-datei.json`). Lässt sich der Pfad zu `curl.exe` so nicht schreiben (etwa mit Leerzeichen), entfällt der Eintrag wie ohne `curl.exe`.
- Der Endpunkt antwortet immer leer; Claude zeigt dann keine Statuszeile.
- Weil Claude die Limits aus seiner letzten Antwort bei jedem Aufruf mitschickt, auch Stunden später nach einer neuen Grösse des Terminals, gewinnt nicht einfach die zuletzt angekommene Meldung. Pro Limit gilt der spätere Reset (ein neues Fenster), im selben Fenster der höhere Verbrauch.
- Fehlt `rate_limits` (beim Start, nach dem Fortsetzen, ohne Abo) oder fehlt darin ein Fenster (nach seinem Reset), bleibt der bisherige Stand.
- Die Kosten zeigt THub, wie Claude sie meldet: nach dem Fortsetzen samt der früheren Kosten der Session, nach `/clear` ab 0.
- Einen eigenen `refreshInterval` setzt THub nicht: Claude meldet nach jeder Antwort, und die Uhrzeiten und das Gedämpfte nach einem Reset richtet die Oberfläche selbst nach der Uhr.
- Ob der Balken an ist, entscheidet der Kern beim Start von Claude: Es gibt die Hook-Datei mit und ohne `statusLine`. Eine laufende Session behält ihre Statuszeile bis zum nächsten Start (Claude beobachtet die Datei nicht).

### Grenzen

- Ohne Git Bash führt Claude den Befehl mit PowerShell aus. Das liess sich am Rechner der Messung nicht in Claude selbst prüfen (Git Bash ist installiert, und `shell` fällt weg); geprüft ist die Zeichenkette in Windows PowerShell und PowerShell 7, aufgerufen wie Claude es tut.
- Ein Konto mit API-Schlüssel statt Abo ist nur ohne Verbindung zur API geprüft. Ein Gateway mit Ausgabenlimit (`spend_limit`) ist nicht geprüft.
- `disableAllHooks`, verwaltete Einstellungen mit eigener Statuszeile (`policySettings` gehen vor `--settings`) und `subagentStatusLine` sind nicht gemessen.
