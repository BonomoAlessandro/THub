# 38 – Balken mit Modell, Verbrauch und Limits

Status: `erledigt` (2026-11-27, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-27. Ganz unten im Fenster soll ein Balken stehen. Er zeigt das Claude-Modell, wie viel der aktuellen Session (5-Stunden-Fenster) verbraucht ist und wann sie zurückgesetzt wird. Dazu zeigt er, was die Session über die API gekostet hätte, das Wochenlimit und dessen Reset.
Spezifikation: User Stories 106 bis 109 (neu), „Oberfläche (Renderer)“ → „Verbrauchsbalken (Ticket 38)“ (neu)

## Entscheidung

Der Nutzer hat am 2026-11-27 gewählt:
- **Der Balken ersetzt Claudes Statuszeile in THub-Tabs.** In Claude-Tabs, die THub startet, zeigt Claude keine eigene Statuszeile mehr. Die Angaben stehen im Balken, und das Terminal gewinnt die Zeilen der Statuszeile (beim Nutzer 4 bis 6). Ausserhalb von THub bleibt alles wie bisher.
- **Kompakt mit Mini-Balken:** eine Zeile, kleine Fortschrittsbalken für Session und Woche, der Reset als Uhrzeit.
- **Nur in Claude-Tabs:** Der Balken erscheint nur, wenn der angezeigte Tab ein Claude-Tab ist. In normalen Terminals gibt es keinen Balken, das Terminal reicht bis unten.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ (Terminal)                                                                               │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ✱ Opus 5.5 │ Session ▰▰▰▱▱▱▱▱ 38 %  Reset 15:40 │ API $4.12 │ Woche ▰▰▱▱▱▱▱▱ 21 %  Reset Mo 09:00 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Verworfen:
- **Claudes Statuszeile durchreichen:** THub hätte den Befehl des Nutzers selbst ausführen müssen. Statuszeilen aus Projekteinstellungen wären dabei verloren gegangen.
- **Umschalten** zwischen Ersetzen und Durchreichen.
- **Nur Zahlen**, ohne Balken.
- **Restzeit** („noch 2 h 10 min“) statt Uhrzeit. Die Restzeit steht nur im Tooltip.

## Woher die Daten kommen

- **Statuszeilen-Befehl:** Claude Code ruft ihn auf und gibt ihm auf stdin ein JSON mit, unter anderem:
  - `model` (`id`, `display_name`);
  - `cost.total_cost_usd`, die Kosten der Session zum Listenpreis der API, von Claude Code selbst berechnet;
  - bei einem Abo `rate_limits`, darin `five_hour` und `seven_day` mit `used_percentage` und `resets_at` (Unix-Sekunden). Dazu kommen je nach Konto weitere Schlüssel, etwa Wochenlimits pro Modell und `extra_usage`.
  - Was der Befehl ausgibt, zeigt Claude als Statuszeile an.
- **Vorlage:** die Statuszeile des Nutzers, ein Python-Skript, das genau diese Felder liest (Befehl in `statusLine` von `~/.claude/settings.json`). Laut seinen Kommentaren heisst `used_percentage` in manchen Versionen `utilization`, und Werte können `null` sein.
- **Weg zu THub**, wie beim curl-Hook für `SessionStart` (`curlForward` in `src/main/hookFile.ts`):
  - Die Hook-Datei, die der Starter Claude mit `--settings` mitgibt, bekommt einen Eintrag `statusLine`.
  - Sein Befehl leitet das JSON mit dem `curl.exe` von Windows an die lokale Schnittstelle weiter, mit Tab und Token aus der Umgebung.
  - THub antwortet leer, Claude zeigt also keine Statuszeile.
  - Weil `--settings` vor den Einstellungen des Nutzers gilt, ersetzt das dessen Statuszeile, aber nur in Sessions, die THub startet.
- **Die Limits gelten für das ganze Konto:** Claude kennt sie aus der letzten Antwort der API. THub nimmt den neuesten Stand aus allen Claude-Tabs.

## Was gebaut wird

1. **Zuerst messen** mit dem installierten Claude Code (Version notieren), Befunde in `docs/spikes/claude-hooks.md`, redigierte Beispiel-Nutzdaten unter `spikes/claude-hooks/samples/`:
   - **Ausführung des Befehls:** Wie führt Claude Code unter Windows den Befehl einer Statuszeile aus (über welche Shell, mit Exec-Form wie bei Hooks oder nur als Zeichenkette)? Funktioniert `curl.exe` mit `--variable %THUB_TAB_ID=` usw. darin?
   - **Felder:** Welche kommen an, mit welchen Namen? Ab wann gibt es `rate_limits` (erst nach der ersten Antwort der API)? Wie sieht es ohne Abo mit API-Schlüssel aus?
   - **Takt:**
     - Wann ruft Claude den Befehl auf: beim Start, nach jeder Nachricht, im Leerlauf?
     - Was bewirkt `refreshInterval`?
     - Wie wirkt eine leere Ausgabe auf die Fläche unter dem Eingabefeld (keine Zeile oder eine leere)?
   - **Kosten:** Fängt `cost.total_cost_usd` nach einem Fortsetzen (`--resume`) wieder bei 0 an? Was passiert nach `/clear`?
   - **`--settings`:** Ersetzt der Eintrag dort wirklich die Statuszeile aus den Einstellungen des Nutzers und eines Projekts?
   - **Kosten der Messung:** `--model haiku`, höchstens etwa 5 Prompts. Aufbau wie im Spike zu den Tickets 10 bis 13, mit eigenem Empfänger.
2. **Hook-Datei** (`src/main/hookFile.ts`): ein Eintrag `statusLine`, der das JSON mit `curl.exe` an einen neuen Endpunkt der lokalen Schnittstelle weiterleitet (Vorschlag: `POST /claude/statusline`).
   - Tab und Token wie beim curl-Hook; ohne passenden Tab oder Token antwortet THub leer.
   - Die Antwort ist leer, Claude zeigt also keine Statuszeile.
   - Ohne `curl.exe` setzt THub keinen Eintrag `statusLine`. Die Statuszeile des Nutzers bleibt dann, und der Balken zeigt keine Daten von Claude (im Handbuch nennen).
   - Ist der Balken in den Einstellungen aus, setzt THub ebenfalls keinen Eintrag `statusLine`. Neu gestartete Claude-Sessions zeigen dann wieder die eigene Statuszeile.
   - Eine laufende Claude-Session übernimmt die Änderung erst nach einem neuen Start.
3. **Workspace-Kern**, als reine Regeln mit Tests:
   - **Pro Claude-Tab:** Modell (Anzeigename, Kennung) und Kosten der Session aus der letzten Meldung. Beides entfällt mit der Claude-Zuordnung.
   - **Für das Konto:**
     - Session- und Wochenlimit mit Prozent und Reset, weitere Limits für den Tooltip.
     - Dazu der Zeitpunkt der Meldung und der Tab, aus dem sie kam.
     - Eine neuere Meldung ersetzt eine ältere, egal aus welchem Tab.
   - **Tolerant lesen:**
     - `utilization` statt `used_percentage`.
     - Werte `null`, als Zeichenkette oder ausserhalb von 0 bis 100.
     - fehlende `rate_limits`.
     - `resets_at` in Sekunden.
     - Unbrauchbares wird ignoriert, nie ein Fehler.
   - **Gespeichert** werden nur die Limits des Kontos samt Zeitpunkt, ohne neue Schema-Version (wie Ticket 28). Nach einem Neustart zeigt der Balken den letzten Stand, auch solange alle Claude-Tabs pausiert sind. Modell und Kosten werden nicht gespeichert.
   - **Reset vorbei:** Ist `resets_at` vorbei, gilt das Limit als zurückgesetzt. Der Balken zeigt 0 %, gedämpft, bis eine neue Meldung kommt.
4. **Balken in der Oberfläche:**
   - **Nur in Claude-Tabs:** Der Balken erscheint nur, wenn der angezeigte Tab ein Claude-Tab ist (auch pausiert und in einer Gruppe). Wird aus einem Tab ein Claude-Tab oder umgekehrt, oder wechselt der angezeigte Tab, kommt oder geht der Balken. Das Terminal passt dann seine Grösse an, wie bei jeder Änderung der Fenstergrösse.
   - **Lage:** ganz unten über die volle Breite, unter dem Terminal.
   - **Aussehen:**
     - Eine Zeile, etwa 24 px hoch, Schrift der Oberfläche, nicht des Terminals.
     - Hell und dunkel nach den bestehenden Design-Tokens, keine neue Akzentfarbe.
     - Mini-Balken mit 8 Segmenten.
     - Ab 90 % ist ein Limit hervorgehoben, mit einer bestehenden Farbe für Warnungen.
   - **Inhalt**, von links:
     - das Symbol des Claude-Tabs und der Anzeigename des Modells;
     - „Session“ mit Mini-Balken, Prozent und „Reset HH:MM“;
     - „API $x.xx“, mit zwei Nachkommastellen;
     - „Woche“ mit Mini-Balken, Prozent und „Reset <Wochentag> HH:MM“.
     - Liegt ein Reset nicht am selben Tag, steht der Wochentag davor („Reset Mo 00:40“).
   - **Daten:** Modell und Kosten kommen vom angezeigten Claude-Tab. Hat er noch keine (frisch gestartet oder pausiert), entfallen beide. Die Limits stehen immer da, sobald es irgendeinen Stand gibt.
   - **Ohne Daten:** gedämpft „Noch keine Angaben von Claude“. Ohne Abo (keine `rate_limits`) stehen nur Modell und Kosten da.
   - **Schmales Fenster:** Zuerst entfallen die Resets, dann die Mini-Balken, zuletzt „API“. Prozente und Modell bleiben. Die Zeile bricht nie um.
   - **Tooltip:**
     - Modell-Kennung;
     - die Restzeit bis zu jedem Reset;
     - weitere Limits (etwa Wochenlimits pro Modell) und Zusatznutzung, falls vorhanden;
     - „Stand HH:MM aus Tab <Name>“.
     - Ein Hinweis, dass die Limits aus der letzten Antwort an Claude stammen: Verbrauch an einem anderen Ort zeigt der Balken erst nach der nächsten Antwort.
   - **Aktualisieren:** Die Uhrzeiten und das Gedämpfte nach einem Reset richten sich nach der Uhr, mindestens einmal pro Minute. Sonst nur bei neuen Meldungen.
5. **Einstellungen:** ein Schalter „Verbrauchsbalken anzeigen“, standardmässig an. Aus heisst: kein Balken und kein Eintrag `statusLine` (siehe Punkt 2).
6. **Hinweise im Fenster** (Tickets 32 und 35): Der Stapel bleibt über dem Balken und verdeckt ihn nicht. Die Regeln zum Ausweichen über der Eingabe gelten weiter. Ohne Claudes Statuszeile ist der Bereich unter dem Eingabefeld kleiner.
7. **Doku:**
   - Handbuch: ein Abschnitt „Verbrauchsbalken“ unter „Bedienung“ und eine Zeile unter „Claude Code in THub“, dass THub die Statuszeile ersetzt und warum.
   - Spezifikation, `docs/entwicklung.md` (Hook-Datei, Endpunkt) und Changelog. Im Changelog steht auch, dass Claude in THub keine eigene Statuszeile mehr zeigt.

## Akzeptanzkriterien

- [x] Die Befunde der Messung stehen in `docs/spikes/claude-hooks.md`, mit Version und redigiertem Beispiel-JSON einer Statuszeile.
- [x] Tests der Hook-Datei:
  - mit `curl.exe` ein Eintrag `statusLine`, der an den neuen Endpunkt weiterleitet;
  - ohne `curl.exe` und bei ausgeschaltetem Balken kein Eintrag `statusLine`.
- [x] Tests der lokalen Schnittstelle: Der Endpunkt prüft das Token, nimmt das JSON an und antwortet leer, auch bei unbrauchbarem Inhalt.
- [x] Kern-Tests mit steuerbarer Uhr:
  - Modell und Kosten pro Tab; sie entfallen mit der Claude-Zuordnung;
  - der neueste Stand der Limits aus zwei Tabs gewinnt;
  - tolerantes Lesen (`utilization`, `null`, Zeichenketten, fehlende `rate_limits`);
  - ein vorbeigegangener Reset ergibt 0 %, gedämpft;
  - Speichern und Laden der Limits; eine ältere THub liest den Zustand weiter.
- [x] Tests der Anzeige (reine Funktionen):
  - Reset am selben Tag und an einem anderen Tag, auch über Mitternacht;
  - Mini-Balken bei 0, 38, 90 und 100 %;
  - was bei schmalem Fenster in welcher Reihenfolge entfällt;
  - Kosten mit zwei Nachkommastellen;
  - Text ohne Daten und ohne Abo.
- [x] In der App im Testmodus über CDP auf der eigenen Seite:
  - Meldungen an den neuen Endpunkt der Test-App (Adresse, Token und Tab wie in `docs/entwicklung.md`, „Testmodus“) ergeben einen Balken mit Modell, Session, Kosten und Woche.
  - Ein Wechsel auf einen normalen cmd-Tab blendet den Balken aus, und das Terminal reicht bis unten. Zurück im Claude-Tab ist der Balken wieder da, und die Grösse des Terminals stimmt.
  - Ein zweiter Claude-Tab ohne eigene Meldung zeigt die Limits, aber weder Modell noch Kosten.
  - Nach einem Neustart der Test-App zeigt ein pausierter Claude-Tab die Limits wieder.
  - Bildschirmfotos hell und dunkel per `PrintWindow`, breit und schmal, und ein Hinweis über dem Balken.
- [x] Echtes Claude Code in einem Tab der Test-App (Aufbau aus Ticket 35, ohne Verbindung zur API): Claude zeigt keine Statuszeile, und THub bekommt das JSON der Statuszeile (mindestens das Modell).
- [x] Die bisherigen Tests laufen weiter, auch die Lage der Hinweise aus den Tickets 32 und 35.
- [x] Handbuch, Spezifikation, `docs/entwicklung.md` und Changelog beschreiben das Verhalten. (Den Eintrag im Changelog ergänzt der Koordinator beim Zusammenführen.)
- [x] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

Mit echtem Claude Code, nach einem neuen Start von Claude im Tab.

- [ ] Der Balken zeigt das Modell, den Verbrauch der Session mit Reset, die Kosten und die Woche mit Reset. Die Werte stimmen mit `/usage` in Claude überein.
- [ ] Claude zeigt in THub keine eigene Statuszeile mehr. Ausserhalb von THub zeigt Claude die eigene Statuszeile wie bisher.
- [ ] Wechsel zwischen zwei Claude-Tabs mit verschiedenen Modellen: Modell und Kosten wechseln mit.
- [ ] In einem normalen Terminal gibt es keinen Balken. Beim Wechsel zwischen Claude-Tab und Terminal springt nichts unschön.
- [ ] Ein schmales Fenster: Der Balken bricht nicht um.
- [ ] Aussehen hell und dunkel; ein Hinweis verdeckt den Balken nicht.
- [ ] Der Schalter in den Einstellungen blendet den Balken aus. Nach einem neuen Start von Claude zeigt Claude wieder die eigene Statuszeile.

## Hinweise

- **Ausserhalb dieses Tickets:**
  - Limits direkt bei Anthropic abfragen, etwa mit den Zugangsdaten aus `~/.claude`. THub liest keine Zugangsdaten.
  - Kosten über mehrere Sessions oder Tage zusammenzählen.
  - Kontext-Auslastung, Git-Zweig und andere Angaben einer Statuszeile.
- Die Spielregeln aus [`README.md`](README.md) gelten, besonders: geerbte `THUB_*` entfernen, den Testmodus verwenden, nie Meldungen an die echte App schicken.
- Die Messung mit echtem Claude Code braucht das Konto des Nutzers. Nur Haiku verwenden und das Beispiel-JSON vor dem Einchecken redigieren (Pfade, Session-Kennungen, Kontoangaben).
- Für jeden Start von Claude und der App eine harte Zeitgrenze setzen (Erfahrung aus Ticket 35).
- Fundstellen:
  - Hook-Datei: `src/main/hookFile.ts`;
  - lokale Schnittstelle: `src/main/localApi.ts`;
  - Claude-Zuordnung: `src/main/workspace/claude.ts`;
  - Lage der Hinweise: `src/renderer/toasts/stackPlacement.ts` und `src/renderer/terminal/inputArea.ts`;
  - gespeicherter Zustand: `src/main/workspace/schema.ts`.

## Hinweise aus der Umsetzung

- **Messung** (Claude Code 2.1.332, 2 Prompts mit Haiku, Befunde in `docs/spikes/claude-hooks.md`, Abschnitt „Statuszeile (Ticket 38)“, Skript `spikes/claude-hooks/statuszeile.mjs`, Beispiel `spikes/claude-hooks/samples/StatusLine.json`):
  - Claude führt den Befehl einer Statuszeile wie einen Befehls-Hook ohne `args` aus: mit Git Bash, ohne Git Bash mit PowerShell. Eine Exec-Form gibt es für `statusLine` nicht (`args` und `shell` fallen weg).
  - Die Weiterleitung mit `curl.exe` klappt als Zeichenkette, gemessen in Claude über Git Bash und ohne Claude in Git Bash, Windows PowerShell und PowerShell 7.
  - Der Eintrag aus `--settings` geht der Statuszeile des Nutzers und der eines Projekts vor; eine leere Ausgabe ergibt keine Zeile.
  - Claude ruft den Befehl beim Start, nach jeder Antwort, nach `/clear` und bei einer neuen Grösse des Terminals auf, nicht im Leerlauf. `rate_limits` steht manchmal schon im ersten Aufruf, sonst ab der ersten Antwort; nach `--resume` fehlt es beim Start.
  - Kosten: Nach `--resume` setzt Claude die Kosten der Session fort (nicht 0), nach `/clear` beginnt eine neue Session bei 0.
- **Rückmeldung des Nutzers während der Umsetzung:** Dass THub Claudes eigene Statuszeile ersetzt, ist zweitrangig; Pflicht ist, dass der Balken in jedem Claude-Tab Modell, Session mit Reset, Kosten und Woche mit Reset zeigt. Einen Umweg (den Befehl des Nutzers selbst ausführen, Einstellungsdateien lesen oder ändern) sollte es nicht geben. Die Messung zeigt, dass der Eintrag aus `--settings` ohne Umweg vorgeht, mit und ohne eigene Statuszeile des Nutzers; es bleibt also bei der Lösung aus dem Ticket. Der gedämpfte Rückfall-Hinweis ist „Noch keine Angaben von Claude“; einen eigenen Hinweis „eigene Statuszeile aktiv?“ braucht es nicht, weil das nur ohne `curl.exe`, mit eigenem `--settings`, mit `disableAllHooks` oder mit verwalteten Einstellungen vorkommt (im Handbuch genannt).
- **Abweichungen vom Ticket:**
  - **Befehl als Zeichenkette statt wie `curlForward`:** Der Vorschlag ging von der Exec-Form des curl-Hooks aus; die gibt es für `statusLine` nicht. Der Befehl steht deshalb als Zeichenkette da, mit `C:/Windows/System32/curl.exe` (mit `/`, ohne Anführungszeichen) und jedem Argument mit Sonderzeichen in einfachen Anführungszeichen (`statusLineCommand` in `hookFile.ts`). Lässt sich der Pfad zu `curl.exe` so nicht schreiben (etwa mit Leerzeichen), gibt es wie ohne `curl.exe` keinen Eintrag.
  - **Zwei Hook-Dateien:** `claude-hooks.json` mit und `claude-hooks-ohne-statuszeile.json` ohne `statusLine`. `/claude/launch` liefert nach der Einstellung die eine oder die andere. So muss THub die Datei beim Umschalten nicht neu schreiben, und eine laufende Session bleibt sicher bei ihrer (Claude beobachtet die Datei aus `--settings` ohnehin nicht).
  - **„Eine neuere Meldung ersetzt eine ältere“** gilt pro Limit, nicht nach der Ankunft: Claude schickt die Limits aus seiner letzten Antwort bei jedem Aufruf mit, auch Stunden später nach einer neuen Grösse des Terminals (gemessen). Sonst überschriebe ein Tab, der lange nichts gemacht hat, den neuen Stand eines anderen. Ein späterer Reset (neues Fenster) gilt immer, im selben Fenster der höhere Verbrauch; eine Meldung mit lauter älteren Ständen ändert nichts, auch nicht „Stand … aus Tab …“.
  - **Weitere Limits:** Claude Code 2.1.332 schickt in `rate_limits` nur `five_hour`, `seven_day` und hinter einem Gateway `spend_limit`; Wochenlimits pro Modell oder `extra_usage` kommen in der Statuszeile nicht vor. THub liest jeden weiteren Schlüssel mit Anteil trotzdem und zeigt ihn im Tooltip (bekannte Namen übersetzt, etwa „Ausgabenlimit“, „Woche Opus“, „Zusatznutzung“).
  - **„Zuletzt „API““** heisst: Der ganze Eintrag mit den Kosten entfällt, nicht nur das Wort.
  - **Lage:** Der Balken ist 26 px hoch statt etwa 24; die Terminal-Karte rückt dafür bis an ihn (ihr Rand von 7 px unten entfällt), das Terminal verliert also 19 px, gut eine Zeile.
  - Die Einstellung steht im Abschnitt „Darstellung“ des Einstellungsdialogs.
- **Kern:** reine Regeln in `src/main/workspace/usage.ts` (`readStatusLine`, `nextTabUsage`, `newerLimit`, `mergeLimits`, `normalizeAccountLimits`), angewendet in `claudeStatusLine` des Kerns. Modell und Kosten liegen in der Laufzeit des Tabs und entfallen mit der Claude-Zuordnung und beim Schliessen. Die Limits stehen als `usageLimits` im Zustand. Ob ein Reset vorbei ist, entscheidet `shownLimit` in `src/shared/usage.ts`; der Kern-Test prüft das mit der steuerbaren Uhr.
- **Vertrag:** `WorkspaceSnapshot.usage` und das Ereignis `usage` (`UsageSnapshot`), `Settings.usageBar`, `ClaudeReceiver.claudeStatusLine`, `LocalApiInfo.hookFileWithoutStatusLine`.
- **Oberfläche:** `src/renderer/usage/usageItems.ts` (Zeile, Stufen, Uhrzeiten, Mini-Balken, Tooltip, Wahl der Stufe) und `UsageBar.tsx` (misst die vier Stufen unsichtbar im Balken, Uhr im Minutentakt, Tooltip über dem Balken; `Tooltip.tsx` kann dafür `placement="above"`). Der Stapel der Hinweise rechnet mit der Höhe des Balkens (`StackMeasures.bottomBar`).
- **Ältere THub:** Die eingefrorene Kopie des Lesers aus 0.3.1 (`test/workspace/fixtures/schema-0.3.1.ts`) holte den Typ `Settings` aus dem heutigen Code und wäre mit `usageBar` nicht mehr übersetzt worden; der Typ ist dort jetzt ebenfalls eingefroren. Der Test zeigt: Sie liest den Zustand weiter und lässt `usageLimits` und `usageBar` weg.
- **In der App geprüft** (Testmodus, eigener Datenordner, CDP nur auf der eigenen Seite, `--disable-features=CalculateNativeWinOcclusion`, cmd-Tabs, Skalierung 150 %, Fenstergrösse über `SetWindowPos` ohne Aktivierung, Bildschirmfotos per `PrintWindow`):
  - Meldungen an die eigene Schnittstelle (`/claude/launch`, `SessionStart`, `UserPromptSubmit`, `/claude/statusline` mit Opus 5.5, $4.1234, Session 38 %, Woche 21 %): Balken „Opus 5.5 │ Session ▰▰▰▱▱▱▱▱ 38 % Reset 13:27 │ API $4.12 │ Woche ▰▰▱▱▱▱▱▱ 21 % Reset Mo 09:00“, 26 px, Stufe 0. Die Antwort auf die Meldung war leer (200).
  - Wechsel auf einen cmd-Tab: kein Balken, die Terminal-Karte endet 7 px über dem Fensterrand, 46 statt 45 Zeilen. Zurück im Claude-Tab: Balken wieder da, 45 Zeilen, die genau in die Fläche passen.
  - Ein zweiter Claude-Tab ohne eigene Meldung: Session und Woche, weder Modell noch Kosten.
  - Hinweis „fertig“ für einen anderen Tab: Unterkante 18 px über dem Balken.
  - Session bei 93 %: Mini-Balken und Prozent orange. Schmal: bei 1000, 820 und 700 px alles, bei der kleinsten Fenstergrösse (600 px, Innenbreite 614) ohne Resets; die Zeile bricht nie um (eine Zeile hoch).
  - Tooltip über dem Balken mit Modell-Kennung, Kosten, Restzeiten, „Stand 11:20 aus Tab „api““ und dem Hinweis zu den Limits. Dabei gefunden und behoben: Der Tooltip erbte vom Balken `white-space: nowrap`, der Hinweis lief über den Rand.
  - Neustart der Test-App mit dem normalen Tab aktiv: Der Claude-Tab kam pausiert zurück, der Kern hatte die Limits geladen, und beim Anzeigen stand der Balken mit Session und Woche da, ohne Modell und Kosten. (Der Ordner von `claude.exe` war für die Test-App nicht im PATH, damit das Fortsetzen kein echtes Claude startete.)
  - **Echtes Claude Code** (Aufbau aus Ticket 35, ohne Verbindung zur API, über den Starter von THub gestartet): Mit einer eigenen Statuszeile in der Konfiguration („NUTZER-STATUSZEILE“) zeigte Claude keine Statuszeile, und THub bekam über den echten Befehl der Hook-Datei (Git Bash, `curl.exe`) Modell „Haiku 5.5“ und Kosten $0.00; der Balken zeigte „Haiku 5.5 │ API $0.00“ (ohne Abo keine Limits). Mit ausgeschaltetem Balken und neu gestartetem Claude: kein Balken, und Claude zeigte „NUTZER-STATUSZEILE“. Ohne eigene Statuszeile in der Konfiguration: ebenso keine Statuszeile, und THub bekam Modell und Kosten.
  - Bildschirmfotos hell und dunkel, breit und schmal, mit Hinweis und Tooltip, liegen ausserhalb des Repos.
- **Grenzen:** Ohne Git Bash nimmt Claude PowerShell; das liess sich in Claude selbst nicht prüfen (siehe Spike). Ein Konto mit Gateway-Ausgabenlimit ist nicht geprüft. Die Werte gegen `/usage` und das Aussehen mit echtem Abo stehen in der Abnahme von Hand.
