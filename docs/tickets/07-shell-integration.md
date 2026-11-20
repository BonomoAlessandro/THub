# 07 – Shell-Integration: Profil, aktueller Ordner, Startbefehl

Status: `erledigt` (2026-11-20, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 06
User Stories: 11, 17 (aktueller Ordner im Tooltip), 57, 65
Spezifikation: „Shell-Integration“ (Robust laden, Punkte 1 und 3, Umgebung), „Wiederherstellen“ (normaler Tab), „Testentscheidungen → Teststelle 1 und 2“

## Was gebaut wird

Jede Windows-Shell (PowerShell 7, Windows PowerShell, cmd, Git Bash) startet mit der mitgelieferten **Integration**:

- **Robust laden:** zuerst das normale Profil des Nutzers, dann die Integration.
  - PowerShell bekommt den Integrationscode per `-EncodedCommand`, nicht als Skriptdatei; cmd lädt per `/k`; Git Bash über eine eigene Startdatei, die lädt, was eine Login-Shell von Git Bash lädt (`/etc/profile`, dann `~/.bash_profile`/`~/.bash_login`/`~/.profile`, sonst `~/.bashrc`).
  - **Ausgangspunkt:** die geprüften Skripte aus dem Starter-Spike in `resources/shell/` und `buildLaunch` in `test/shells/harness.ts` (Befunde in `docs/spikes/starter.md`). Das Gerüst für Teststelle 2 (`npm run test:shells`, Stub `claude`, Testattrappe der Schnittstelle) besteht schon und wird weiterverwendet.
  - Mitgelieferte Skripte sind reines ASCII oder UTF-8 mit BOM.
  - Scheitert die Integration, startet die Shell trotzdem normal.
- **Ordner melden** per OSC 7 bzw. OSC 9;9 bei jedem Prompt, nur für Orte im Dateisystem. Ein eigener Prompt des Nutzers wird erweitert, nicht ersetzt.
  - Der **Kern** erkennt die Sequenzen im Ausgabestrom (auch über Stückgrenzen, Endzeichen BEL oder `ESC \`), normalisiert den Pfad (Prozentkodierung, `/c/…` → `C:\…`) und speichert ihn als zuletzt aktiven Ordner.
  - Die Sequenzen bleiben im Strom.
- **Startbefehl:** Ein von THub mitgegebener Befehl läuft genau einmal, sobald die Shell bereit ist; keine simulierten Tastendrücke. Übergabe in PowerShell und Git Bash über `THUB_START_CMD` (vor dem Ausführen entfernt), in cmd in der `/k`-Zeile hinter der Integration. Ticket 12 nutzt das zum Fortsetzen von Claude.
- **Umgebung:** jedes Terminal bekommt `THUB_TAB_ID`; `THUB_*` aus der eigenen Umgebung wird vorher entfernt; `NO_PROXY` wird um `127.0.0.1,localhost` ergänzt. Adresse und Token der Schnittstelle kommen in Ticket 10 dazu.
- **Wiederherstellen:** Ein normaler Tab startet im zuletzt aktiven Ordner (Rückfallkette). Der Tooltip zeigt den aktuellen Ordner.
- **Teststelle 2:** Gerüst für Integrationstests mit echten Shells über das echte Terminal-Backend, als eigener Testlauf.
- **Paket:** Die Integrationsdateien liegen im installierten Paket als echte Dateien ausserhalb des asar-Archivs (`extraResources`).
- **Erkennung von PowerShell 7 aus dem Store:** `pwsh.exe` ist dort ein App-Ausführungsalias, den `fs.existsSync` nicht sieht (`lstat` schon). Betrifft auch die Shell-Erkennung aus Ticket 06.

## Akzeptanzkriterien

- [ ] Kern-Tests zur Ordner-Erkennung:
  - Sequenz an jeder Position zwischen zwei Stücken getrennt;
  - beide Endzeichen, mehrere Sequenzen pro Stück;
  - Prozentkodierung, Git-Bash-Pfade;
  - Orte ausserhalb des Dateisystems werden ignoriert;
  - der Ordner übersteht einen Neustart, Wiederherstellen im zuletzt aktiven Ordner, Rückfallkette bei gelöschten Ordnern.
- [ ] Integrationstests (eigener Befehl, z.B. `npm run test:shells`) für alle vier Windows-Shells, nicht installierte werden übersprungen:
  - `cd` in einen Testordner (auch mit Leerzeichen und Umlauten) führt zur Meldung genau dieses Ordners;
  - ein Testprofil wird weiterhin geladen;
  - ein Startbefehl läuft genau einmal, auch wenn danach weitere Prompts erscheinen;
  - die Escape-Sequenzen erscheinen nicht als sichtbarer Text.
- [ ] Die Tests setzen die Umgebung ausdrücklich und sprechen keine laufende THub-Instanz an.
- [ ] WSL-Tabs bekommen keine Integration und funktionieren wie bisher.

## Abnahme von Hand

- [ ] In jeder Shell mit `cd` den Ordner wechseln, THub neu starten → der Tab startet im neuen Ordner.
- [ ] Ein vorhandenes PowerShell-Profil (z.B. mit oh-my-posh) funktioniert weiter, der Prompt sieht aus wie ausserhalb von THub.
- [ ] Im gebauten Paket (`release/win-unpacked`) funktioniert die Integration ebenfalls.
- [ ] Optional, falls verfügbar: Mit Execution Policy `AllSigned` startet PowerShell trotzdem.
