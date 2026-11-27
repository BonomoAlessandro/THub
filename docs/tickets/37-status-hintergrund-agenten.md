# 37 – „Arbeitet“, solange Hintergrund-Agenten rechnen

Status: `erledigt` (2026-11-27, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: –
Herkunft: Rückmeldung des Nutzers am 2026-11-26. Ein Claude-Tab zeigt teilweise längere Zeit „ruht“, obwohl darin noch ein Agent rechnet. Beobachtet hat er das, wenn Claude Agenten im Hintergrund gestartet und danach seine Antwort beendet hat.
Spezifikation: User Story 105 (neu), „Claude-Status: Zustandsautomat pro Tab“ → „Hintergrund-Agenten (Ticket 37)“ (neu); Spike [`docs/spikes/claude-hooks.md`](../spikes/claude-hooks.md)

## Entscheidung

Der Nutzer hat am 2026-11-26 gewählt: **„arbeitet“ bis zum Schluss.**
- Solange in einem Claude-Tab noch ein Agent rechnet, zeigt der Tab „arbeitet“ (violett). Das gilt auch, wenn Claude selbst seine Antwort schon beendet hat.
- Grün („fertig, noch nicht angeschaut“) und der Hinweis „fertig“ kommen erst, wenn alles fertig ist.

Verworfen:
- **Eigener Zustand** „im Hintergrund läuft etwas“ neben „arbeitet“.
- **Blauer Punkt** wie bei „Prozesse laufen“, grün nach der Antwort wie bisher.

## Ausgangslage

- **Hook-Ereignisse:** THub erfährt den Zustand von Claude über die Hook-Datei aus `src/main/hookFile.ts`. Sie meldet:
  - per HTTP `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure` und `Notification`;
  - über curl `SessionStart`.
  - Ereignisse zu Agenten wie `SubagentStart` und `SubagentStop` meldet sie nicht.
- **`Stop`:** Das Ereignis setzt den Tab auf „ruht“ bzw. grün (`statusAfterHook` in `src/main/workspace/tabStatus.ts`). Laut Spike kommt `Stop`, obwohl eine Hintergrund-Aufgabe weiterläuft (Abschnitt „Weitere Befunde“). Damals galt das als gewollt.
- **Prozess-Sonde:** Ein Agent läuft im Prozess von Claude. Die Sonde sieht deshalb nur die Befehle, die er startet, nicht den Agenten selbst.
- **Vermuteter Ablauf heute** (am Code und mit der Messung bestätigen):
  - Claude startet Agenten im Hintergrund und beendet seine Antwort. `Stop` setzt den Tab auf „ruht“ bzw. grün.
  - Erst wenn ein Agent ein Werkzeug aufruft und Claude dafür `PreToolUse` meldet, wird der Tab wieder violett. Je nach Agent dauert das Sekunden bis Minuten.
  - Danach bleibt der Tab violett bis zum nächsten `Stop`.
- **Mögliche zweite Lücke:** Jedes Ereignis mit einer anderen `session_id` gilt als neue Session (`startsSession` in `src/main/workspace/claude.ts`).
  - Trügen Ereignisse aus einem Agenten eine eigene `session_id`, hinge THub die Claude-Zuordnung des Tabs um. Das Fortsetzen nach einem Neustart träfe dann die falsche Session.
  - Die Felder `agent_id` und `agent_type` wertet THub heute nicht aus.

## Was gebaut wird

1. **Zuerst messen**, aufgebaut wie der Spike zu den Tickets 10 bis 13. Die Skripte kommen nach `spikes/claude-hooks/`, die Befunde als neuer Abschnitt nach `docs/spikes/claude-hooks.md`.
   - **Aufbau:**
     - Das installierte Claude Code; die Version notieren.
     - Ein eigener HTTP-Empfänger und eine Hook-Datei mit allen Ereignissen, die die aktuelle Doku von Claude Code für Agenten und Hintergrund-Aufgaben nennt, mindestens `SubagentStart` und `SubagentStop`.
     - `claude` läuft in node-pty in einem Temp-Ordner, ohne die geerbten `CLAUDE*`- und `THUB_*`-Variablen.
   - **Kosten:** `--model haiku` und höchstens etwa 10 Prompts insgesamt. Keine Rückfrage für etwas bestätigen, das ausserhalb des Temp-Ordners schreibt.
   - **Szenarien**, jeweils mit einer Zeitachse aller Hook-Ereignisse samt `session_id`, `agent_id` und `agent_type`:
     - ein Agent im Vordergrund;
     - ein Agent im Hintergrund, der etwa 30 Sekunden braucht (etwa ein `sleep` und dann eine kurze Antwort). Claude beendet seine Antwort, während der Agent läuft;
     - zwei Agenten im Hintergrund, die nacheinander enden;
     - was nach dem Ende eines Hintergrund-Agenten kommt: `UserPromptSubmit` mit `<task-notification>`? Wie viel später?
     - Esc, während ein Hintergrund-Agent läuft: Läuft er weiter? Kommt `SubagentStop`?
     - ein Hintergrund-Agent wird gestoppt (durch Claude oder über die Aufgabenliste): Kommt `SubagentStop`?
     - `/clear` und `/exit`, während ein Hintergrund-Agent läuft;
     - eine Rückfrage aus einem Agenten, falls Claude Code das zulässt: Kommt `PermissionRequest`, und mit welchen Feldern?
   - **Klären:**
     - Kommen `SubagentStart` und `SubagentStop` als HTTP-Hook an? Bei `SessionStart` war das nicht so.
     - Tragen Ereignisse aus Agenten die `session_id` der Hauptsession?
   - **Nicht betroffen** sind Hintergrund-Befehle (`run_in_background` bei Bash). Sie sind Prozesse und zeigen weiter „Prozesse laufen“ (blau), wie in User Story 43 verlangt.
2. **Regeln im Workspace-Kern.** Das Folgende ist ein Vorschlag. Wo die Messung etwas anderes zeigt, die Regel anpassen und die Abweichung im Ticket festhalten.
   - **Laufende Agenten:** Der Kern führt sie pro Claude-Tab mit ihrer Kennung (`agent_id`). `SubagentStart` fügt einen Agenten hinzu, `SubagentStop` nimmt ihn weg.
   - **Angezeigter Status:** „arbeitet“, wenn Claude selbst arbeitet oder mindestens ein Agent läuft. Der Vorrang bleibt: pausiert → wartet → arbeitet → fertig → Prozesse laufen → nichts.
   - **Ereignisse aus einem Agenten** (mit `agent_id`):
     - Sie gelten nie als neue Session und ändern die Claude-Zuordnung nicht.
     - Sie ändern nicht, was Claude selbst tut. Sonst bliebe der Tab nach dem Ende des letzten Agenten auf „arbeitet“ hängen.
     - Ausnahme ist eine Rückfrage: `PermissionRequest` aus einem Agenten setzt den Tab wie bisher auf „wartet“.
   - **`Stop`, während Agenten laufen:** Claude ruht, aber der Tab zeigt weiter „arbeitet“. Es gibt weder grün noch einen Hinweis „fertig“.
   - **Ende des letzten Agenten, während Claude ruht:**
     - Meist arbeitet Claude danach von selbst weiter, weil es eine Meldung über den Agenten bekommt.
     - Kommt eine kurze Frist lang kein `UserPromptSubmit`, ruht der Tab. Die Länge der Frist ergibt sich aus der Messung. War der Tab nicht sichtbar, wird er grün und der Hinweis „fertig“ kommt.
     - Kommt `UserPromptSubmit`, gilt wie bisher das nächste `Stop`. So erscheint „fertig“ nicht zweimal kurz hintereinander.
   - **Esc** betrifft wie bisher nur Claude selbst. Laufen danach noch Agenten, bleibt der Tab violett. Was Esc mit Hintergrund-Agenten macht, zeigt die Messung.
   - **Nichts bleibt hängen:**
     - Die Liste der laufenden Agenten leert sich bei jedem dieser Ereignisse: eine neue Session (`SessionStart`, auch nach `/clear`), `SessionEnd`, das Ende von Claude (Ende-Meldung des Starters), das Ende der Shell, Pausieren und Einfrieren.
     - Zeigt die Messung einen Fall ohne `SubagentStop`, bekommt er eine eigene Regel.
   - **Nicht gespeichert:** Die Liste der Agenten kommt nicht in den gespeicherten Zustand. Nach einem Neustart läuft kein Agent mehr.
   - **Aufbau:** Wie bisher als reine Regeln in `tabStatus.ts`, die Zeitgeber im Kern mit steuerbarer Uhr.
3. **Hook-Datei:**
   - Die Ereignisse aus der Messung in `HTTP_HOOK_EVENTS` (`src/main/hookFile.ts`) und in der Vorlage `spikes/claude-hooks/empfohlene-hook-datei.json` ergänzen.
   - Eine laufende Claude-Session kennt die neuen Ereignisse erst nach einem neuen Start. Das im Handbuch und im Changelog nennen.
4. **Gruppen:** Der Status einer Gruppe folgt aus dem ihrer Tabs. Dort ändert sich nichts.
5. **Doku:**
   - Handbuch: „Status am Tab“ und „Status erkennen“.
   - Spezifikation: im Zustandsautomaten die Präzisierungen aus der Umsetzung.
   - `docs/entwicklung.md`: die Hook-Datei.

## Akzeptanzkriterien

- [x] Die Befunde der Messung stehen in `docs/spikes/claude-hooks.md`, mit der Version von Claude Code und den Zeitachsen. Redigierte Beispiel-Nutzdaten liegen unter `spikes/claude-hooks/samples/`.
- [x] Kern-Tests mit echten HTTP-Hook-Ereignissen (wie `test/workspace/claudeStatus.test.ts`) und steuerbarer Uhr:
  - `SubagentStart`, dann `Stop`: „arbeitet“, weder grün noch ein Hinweis;
  - danach `SubagentStop` und innerhalb der Frist `UserPromptSubmit` und `Stop`: genau einmal „ruht“ bzw. grün und höchstens ein Hinweis „fertig“;
  - `SubagentStop` ohne folgendes `UserPromptSubmit`: nach der Frist „ruht“, im nicht sichtbaren Tab grün mit Hinweis;
  - zwei Agenten: „arbeitet“, bis beide geendet haben;
  - `PreToolUse` und `PostToolUse` eines Agenten, nachdem Claude selbst fertig ist: Endet der Agent, bleibt der Tab nicht auf „arbeitet“ hängen;
  - `PermissionRequest` aus einem Agenten: „wartet“, danach wieder „arbeitet“;
  - Esc, während nur noch Agenten laufen: bleibt „arbeitet“;
  - die Liste der Agenten leert sich mit `SessionStart`, `SessionEnd`, dem Ende von Claude und dem Ende der Shell (nach der Messung angepasst: nicht bei `/clear`, siehe „Hinweise aus der Umsetzung“);
  - ein Ereignis mit `agent_id` ändert die Claude-Zuordnung nicht, auch mit eigener `session_id`, falls die Messung das zeigt;
  - der Gruppen-Tab zeigt „arbeitet“, wenn ein Tab der Gruppe nur wegen eines Agenten arbeitet.
- [x] Ein Test der Hook-Datei prüft, dass die neuen Ereignisse enthalten sind.
- [x] In der App im Testmodus über CDP auf der eigenen Seite, mit Meldungen an die Schnittstelle der Test-App wie in `docs/entwicklung.md` („Testmodus“, Abschnitt zum Countdown):
  - `/claude/launch`, `SessionStart`, `UserPromptSubmit`, `SubagentStart` und `Stop`: Der Tab zeigt das Symbol „arbeitet“;
  - `SubagentStop`: Nach der Frist kommen grün und der Hinweis „fertig“.
- [x] Die bisherigen Tests laufen weiter.
- [x] Handbuch, Spezifikation und `docs/entwicklung.md` beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

Mit echtem Claude Code, das nach dem Update in THub neu gestartet wurde.

- [ ] Claude startet einen Agenten im Hintergrund, der eine Weile braucht. Nach dem Ende der Antwort bleibt der Tab violett, bis der Agent fertig ist und Claude das Ergebnis verarbeitet hat. Erst dann ruht der Tab bzw. wird grün.
- [ ] Dasselbe in einem Tab, der nicht sichtbar ist: genau ein Hinweis „fertig“, erst am Schluss.
- [ ] Ein Agent im Vordergrund: wie bisher violett bis zum Ende der Antwort.
- [ ] Ein Dev-Server, den Claude im Hintergrund startet: nach dem Ende der Antwort weiterhin blau.
- [ ] Esc, während ein Hintergrund-Agent läuft: Der Tab zeigt, ob der Agent noch rechnet.

## Hinweise

- **Ausserhalb dieses Tickets:**
  - Hintergrund-Befehle als „arbeitet“ zeigen.
  - Agenten-Teams, deren Mitglieder in eigenen Sessions laufen.
  - Den Fortschritt einzelner Agenten am Tab zeigen.
- **Bekannte Grenze:** Läuft ein Fall aus der Messung ohne Ende-Meldung und ohne eigene Regel, bliebe der Tab violett. Dann im Handbuch unter „Status erkennen“ nennen.
- Es gelten die Spielregeln aus [`README.md`](README.md), besonders: geerbte `THUB_*` entfernen, den Testmodus verwenden und nie Meldungen an die echte App schicken.
- Für jeden Start von Claude und der App in der Messung eine harte Zeitgrenze setzen (Erfahrung aus Ticket 35).

## Hinweise aus der Umsetzung

- **Messung** (Claude Code 2.1.332, `spikes/claude-hooks/agenten.mjs`, Befunde in `docs/spikes/claude-hooks.md`, Abschnitt „Agenten (Ticket 37)“, Zeitachsen in `spikes/claude-hooks/befunde-agenten.json`): 9 Prompts mit Haiku in 8 Läufen, jeder mit harter Zeitgrenze (240 s, danach `taskkill /T` auf die eigene Prozess-ID). Bestätigt wurde nur das Schreiben von `hi.txt` im Arbeitsordner (Temp).
  - `SubagentStart` und `SubagentStop` kommen per HTTP an. Ereignisse aus Agenten tragen die `session_id` der Hauptsession und `agent_id`, `agent_type`.
  - Der vermutete Ablauf stimmt: `Stop` kommt, während der Agent rechnet; bisher wurde der Tab erst mit dem nächsten `PreToolUse` des Agenten wieder violett.
  - Agenten laufen in 2.1.332 standardmässig im Hintergrund; Haiku liess `run_in_background` immer weg, auch auf ausdrückliche Bitte. Einen Agenten im Vordergrund gab es deshalb nicht.
  - Den Bericht eines Agenten bekommt Claude als Prompt `<agent-message from="<agent_id>">`, 0,4 bis 0,8 s **vor** `SubagentStop`. Ohne Übergabe kommt 0,1 s nach `SubagentStop` eine `<task-notification>` (`<task-id>` = `agent_id`). Wartende Berichte und Zwischenmeldungen kamen 0,3 bis 0,6 s nach Claudes `Stop`.
  - Esc unterbricht nur Claude; der Agent rechnet weiter und endet normal. Esc im Ruhezustand ändert nichts.
  - Gestoppte Agenten (Aufgabenliste mit `x` oder `TaskStop` durch Claude) melden kein `SubagentStop`, nur eine `<task-notification>` mit `killed`; im nächsten `Stop` fehlen sie in `background_tasks`.
  - `/clear` beendet laufende Agenten nicht; sie melden sich danach mit der Kennung der neuen Session. `/exit` fragt nach („Exit and stop tasks“), danach `SessionEnd` ohne `SubagentStop`.
  - Rückfrage aus einem Agenten: `PermissionRequest` mit `agent_id`, ohne `Notification`.
  - Claude Code meldet nach jedem `Stop` eigene Helfer als `SubagentStop` ohne `SubagentStart` und mit leerem `agent_type`.
- **Abweichungen vom Vorschlag**, wo die Messung ihn widerlegt oder ergänzt:
  - **Frist:** Sie beginnt nicht mit dem `SubagentStop` des letzten Agenten, sondern wenn Claude danach ruht, und nur, solange über einen beendeten Agenten im Hintergrund noch eine Meldung aussteht. Grund: Der Bericht kommt schon vor `SubagentStop`, und Claude arbeitet beim `SubagentStop` meist schon; die Meldungen, die „fertig“ ein zweites Mal ausgelöst hätten, kamen nach Claudes `Stop`. Gewählt sind 3 Sekunden (`AGENT_REPORT_QUIET_MS`), rund das Fünffache der längsten gemessenen Verzögerung. Folge: Nach Agenten im Hintergrund kommt grün in der Regel 3 Sekunden nach Claudes letztem `Stop`.
  - **`/clear` leert die Liste nicht:** Die Agenten rechnen weiter und melden sich in der neuen Session. Die Liste bleibt bei `SessionStart` mit anderer Quelle als `startup` und bei `SessionEnd` mit Grund `clear` oder `resume`; sie leert sich mit `SessionStart` (`startup`), dem Ende von Claude (`SessionEnd` mit anderem Grund, Ende-Meldung), dem Ende der Shell, einem neuen Start, Pausieren, Schliessen und Einfrieren.
  - **Eigene Regeln für Fälle ohne `SubagentStop`:** `Stop` gleicht die Liste mit `background_tasks` ab (fehlende Agenten sind vorbei, unbekannte laufende kommen dazu), und eine `<task-notification>` über einen Agenten nimmt ihn heraus. Ein `SubagentStop` ohne bekannten Agenten (Helfer) zählt nicht.
  - **Esc:** Ereignisse aus Agenten beenden die Wartezeiten nach Esc und nach einer Antwort nicht; sonst bliebe Claude nach einer Unterbrechung auf „arbeitet“, solange ein Agent Ereignisse schickt. Esc auf die Rückfrage eines Agenten beendet das Warten nach derselben Wartezeit. Nach einer Unterbrechung kommt am Schluss kein grün, ausser Claude verarbeitet danach noch einen Bericht.
  - **Rückfragen:** Enter oder eine Ziffer auf die Rückfrage eines Agenten beendet das Warten sofort, ohne die Wartezeit mit der Prozess-Sonde. `PermissionRequest` aus einem Agenten setzt auch die Rückfallebene über `Notification` zurück.
  - **Dazu:** Ein Tab, in dem nur noch ein Agent rechnet, fragt vor dem Schliessen nach („arbeitet“).
- **Kern:**
  - `src/main/workspace/claude.ts`: `readHook` liest `agent_id`, `source`, die laufenden Agenten aus `background_tasks` und die `<task-id>` einer `<task-notification>`. Ereignisse mit `agent_id` beginnen keine Session und ändern die Zuordnung nicht.
  - `src/main/workspace/tabStatus.ts`: `ClaudeStatus` führt `agents`, `reportsDue`, `askingAgent` und `finishPending`; `shownActivity` ergibt den angezeigten Status, `awaitsAgentReports` und `statusAfterAgentReportsDue` die Frist. Reine Regeln, wie bisher.
  - `src/main/workspace/workspace.ts`: Frist als Zeitgeber des Kerns (`syncAgentReportWait`), angezeigter Status auch für die Rückfrage beim Schliessen und den Hinweis „wartet“, Esc und Antwort für Rückfragen aus Agenten.
  - Die Liste der Agenten wird nicht gespeichert.
- **Hook-Datei:** `SubagentStart` und `SubagentStop` in `HTTP_HOOK_EVENTS` (`src/main/hookFile.ts`) und in der Vorlage `spikes/claude-hooks/empfohlene-hook-datei.json`. Eine laufende Claude-Session kennt sie erst nach einem neuen Start oder Fortsetzen; das steht im Handbuch und gehört in den Changelog.
- **In der App geprüft** (Testmodus, eigener Datenordner, Debug-Port zufällig, CDP nur auf der eigenen Seite, cmd-Tab, Meldungen nur an die Schnittstelle der Test-App, Zeitgrenze 150 s):
  - `/claude/launch`, `SessionStart`, `UserPromptSubmit`, `PreToolUse` (`Agent`), `SubagentStart`, `PostToolUse` (`Agent`) und `Stop` mit dem Agenten in `background_tasks`: Der Tab zeigte das Symbol „arbeitet“ (`.st[data-s="working"]`, Animation `spark`), auch 5 s später, ohne Hinweis.
  - `SubagentStop`: nach 3,2 s (abgefragt alle 0,25 s) grün und der Hinweis „Claude ist fertig.“.
  - Die Standard-Shell im Testdatenordner war PowerShell 7; geprüft wurde in einem zusätzlich angelegten cmd-Tab, in die PowerShell wurde nichts getippt.
- **Tests:**
  - `test/workspace/agentStatus.test.ts` (28, Kern über die echte Schnittstelle und mit steuerbarer Uhr): alle Fälle der Akzeptanzkriterien, dazu der gemessene Ablauf mit Bericht vor `SubagentStop`, gestoppte Agenten, Hilfs-Agenten, `/clear`, Rückfragen aus Agenten, Esc und die Rückfrage beim Schliessen.
  - `test/workspace/hookFile.test.ts`: die neuen Ereignisse in Hook-Datei und Vorlage.
  - Gegenprobe: Ohne die Agenten im angezeigten Status schlagen 15 der neuen Tests fehl, ohne die Frist 4.
- **Offen bzw. ungeprüft:** ein Agent im Vordergrund (nicht erzeugbar mit Haiku), Esc während eines solchen Agenten, „Move to background and exit“ beim Beenden. Endete ein Agent ohne `SubagentStop` und ohne Meldung an Claude, bliebe der Tab bis zum nächsten `Stop` violett (im Handbuch genannt).
- Typecheck, `npm test` (60 Dateien, 1285 Tests) und der Build sind grün.
