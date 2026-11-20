# 11 – Starter und `claude`-Ersatz

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 07, 10
User Stories: 30, 33, 34, 35, 37, 39, 40
Spezifikation: „Shell-Integration“ (Punkt 2, Bekannte Grenzen), „Hook-Empfänger und lokale Schnittstelle“ (Endpunkte), „Testentscheidungen → Teststelle 2“

## Was gebaut wird

- **Ausgangspunkt:** Der Starter-Spike hat Starter, Ersatz und Tests bereits gebaut und in allen vier Shells grün getestet (`resources/shell/`, `test/shells/`, 333 Tests; Befunde in `docs/spikes/starter.md`). Dieses Ticket bindet sie in die App ein: Terminal-Backend startet die Shells schon mit Integration (Ticket 07, `src/main/shellLaunch.ts`), setzt `THUB_STARTER`, prüft beim Start die Execution Policy, und der Starter spricht die echte lokale Schnittstelle aus Ticket 10 an. Die Regeln unten gelten weiter.
- **`claude`-Ersatz** in allen vier Windows-Shells:
  - PowerShell-Funktion (7 und 5), Bash-Funktion in Git Bash, doskey-Makro in cmd.
  - Das Makro ruft `powershell.exe` direkt auf, ohne Batch-Datei, damit `Ctrl+C` keine Rückfrage „Batchvorgang abbrechen?“ auslöst.
  - Alle Varianten rufen **denselben Starter** auf, ein Windows-PowerShell-5-Skript, das so gestartet wird, dass eine restriktive Execution Policy es nicht blockiert.
- **Starter** genau nach den sechs Schritten der Spezifikation:
  1. echtes `claude` finden: `claude.exe` vor `claude.cmd`, `claude.ps1` nie; sonst Meldung und Exit-Code 1;
  2. einordnen: durchreichen (Unterbefehle aus der Liste, `-p`, `-v`, `-h`; Optionswerte überspringen) oder Fall „neu“, „mit Kennung“ bzw. „ohne Kennung“;
  3. `launch` ohne Proxy mit etwa 1 s Zeitlimit; ohne Antwort `claude` unverändert starten;
  4. `--settings` (ausser bei eigenem `--settings`), im Fall „neu“ `--session-id` und, ohne eigenes `-n`/`--name`, `-n <Tab-Name>` ergänzen;
  5. Befehlszeile selbst nach `CommandLineToArgvW` bauen (für `.cmd` über `cmd.exe /d /s /c`), mit geerbter Konsole starten, `started` mit Prozess-ID melden, Exit-Code weitergeben;
  6. `exit` mit Session-Kennung und Exit-Code melden, auch nach `Ctrl+C`.
- **Grundsatz:** Über den Ersatz kommen genau dieselben Argumente an wie beim direkten Aufruf in derselben Shell, plus den ergänzten Optionen.
- Der **Startbefehl** zum Fortsetzen (Ticket 12) ruft den Starter direkt auf, nicht das Wort `claude`.
- Starter und Ersatz liegen im Paket ausserhalb des asar-Archivs.

## Akzeptanzkriterien

- [ ] Integrationstests (Teststelle 2) mit nachgemachtem `claude`, einmal als `.exe` und einmal als `.cmd`, und einer aufzeichnenden Testattrappe der Schnittstelle, in allen vier Windows-Shells:
  - **Gleichheit der Argumente** gegenüber dem direkten Aufruf für: eingebettete Anführungszeichen, leeres Argument, `%PATH%`, `^`, `&`, `!`, Umlaute, führender `/`, Prompt mit Leerzeichen als Positionsargument.
  - `claude` erhält `--settings`, `--session-id` und `-n <Tab-Name>` (auch mit Leerzeichen und Umlauten im Namen).
  - `--resume x` und `-c` erhalten nur `--settings`; `-n eigener` erhält `--settings` und `--session-id`, aber kein zweites `-n`; ein eigenes `--settings` bekommt kein zweites `--settings`, im Fall „neu“ aber `--session-id` und `-n`.
  - `-p "…"`, `mcp list`, `--version` und `--model opus mcp list` werden ohne Anfrage durchgereicht.
  - `launch`, `started` und `exit` kommen an, `exit` auch nach `Ctrl+C` und bei Exit-Code ≠ 0; der Exit-Code kommt in der Shell an.
  - Ohne erreichbare Schnittstelle startet `claude` unverändert; ohne `claude` im PATH kommt eine verständliche Meldung mit Exit-Code 1.
  - Ein Startbefehl „Starter mit `--resume x`“ erreicht das nachgemachte `claude` mit `--settings`.
- [ ] Die Tests sprechen keine laufende THub-Instanz an, auch wenn sie in einem THub-Tab laufen.

## Abnahme von Hand (mit echtem Claude Code)

- [ ] In einem THub-Tab `claude` tippen → der Tab ist als Claude-Tab mit der richtigen Kennung vermerkt (Zustandsdatei bzw. Entwicklerwerkzeuge); die Session trägt den Tab-Namen in Claudes `/resume`-Liste.
- [ ] `/clear` → neue Kennung vermerkt. `/exit` → Tab ist wieder normal.
- [ ] In cmd `claude` starten und mit `Ctrl+C` beenden → keine Rückfrage „Batchvorgang abbrechen?“.
- [ ] `~/.claude/settings.json` ist unverändert. Eine Claude-Session ausserhalb von THub zeigt keine Hook-Fehler.
