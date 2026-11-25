# 35 – Hinweise: Abstand zur Eingabe und Lage in Claude-Tabs

Status: `erledigt` (2026-11-25, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: –
Herkunft: Rückmeldung des Nutzers am 2026-11-25 zu Version 0.3.0 (Ticket 32). Die Hinweise stehen jetzt über der Eingabe, aber in Claude-Tabs meist direkt über dem Eingabefeld ohne genügenden Abstand; in seltenen Fällen springt der Hinweis hin und her. In den Shells passt die Lage. Der Abstand zur Eingabe soll so gross sein wie der Abstand zum rechten Fensterrand.
Spezifikation: „Claude-Status“ → „Hinweise im Fenster“ → „Lage über der Eingabe“ und „Abstand und Claude-Tabs (Ticket 35)“ (neu)

## Befund vor der Umsetzung

- **Abstand:** `placeStack` lässt zur Eingabe eine halbe Zeile (bei Schriftgrösse 14 rund 9 px), zum rechten Fensterrand stehen 18 px (`padding-right` von `.toasts`, gleich `EDGE_BOTTOM`).
- **Nur in cmd geprüft:** Ticket 32 wurde in der echten App nur in einem cmd-Tab geprüft. Für Claude gibt es nur Tests mit nachgebauten Bildschirmen.
- **Bereich unter Claudes Eingabefeld:** Unter der Cursorzeile stehen in einem Claude-Tab die untere Linie, die Statuszeile und Hinweise wie der Modus. Beim Nutzer gibt die Statuszeile 4 bis 6 Zeilen aus (`statusLine` in seinen Claude-Einstellungen: Überschrift und mehrere Balken). Damit hat eine einzelne Karte unter der Cursorzeile oft gerade Platz. Dann wählt `placeStack` das Band „unter der Eingabe“ und verdeckt die Statuszeile, obwohl die Spezifikation sagt, dass sie frei bleibt. Ändert sich die Höhe der Statuszeile oder des Stapels, wechselt der Stapel nach oben und wieder zurück. Das ist eine mögliche Ursache für das Springen und in der Umsetzung zu belegen oder zu widerlegen.
- Installiert ist inzwischen Claude Code 2.1.332; Ticket 32 hat 2.1.330 untersucht.

## Was gebaut wird

- **Abstand wie rechts:** Zwischen der untersten Karte und der Eingabe bleibt derselbe Abstand wie zwischen den Karten und dem rechten Fensterrand (18 px). Beide Werte kommen aus einer gemeinsamen Konstante, damit sie gleich bleiben.
  - Gemessen wird zur **sichtbaren** Oberkante der Eingabe. In einem Claude-Tab ist das die Linie über dem Eingabefeld. Das Zeichen `─` steht nicht am oberen Rand seiner Zeile, sondern etwa in der Mitte. Wo genau xterm.js (DOM-Renderer, Schrift `--font-mono`) die Linie zeichnet, ist in der App zu messen, etwa per Bildschirmfoto. Ohne Linie zählt die Oberkante der ersten Eingabezeile.
  - Spiegelbildlich gilt der Abstand nach unten, wenn der Stapel unter der Eingabe steht.
  - Zur Titelleiste (10 px) und zum unteren Fensterrand (18 px) bleibt es, wie es ist.
- **Unter der Eingabe nur auf freiem Platz:** Zum geschützten Bereich gehören auch die nicht leeren Zeilen unter der Cursorzeile bis zur letzten nicht leeren Zeile im sichtbaren Ausschnitt. In Claude sind das die untere Linie, die Statuszeile, der Modus und die Vorschlagsliste beim Tippen; in PowerShell zum Beispiel eine Liste der Vorhersagen. Der Stapel steht unter der Eingabe nur, wenn er unter der letzten nicht leeren Zeile ganz Platz hat, also wie bisher bei einem Prompt weit oben. Sonst steht er über dem Anfang der Eingabe.
- **Kein Springen:** Der Stapel bleibt im Band, in dem er steht, solange er dort ganz Platz hat und nichts Geschütztes verdeckt. Er wechselt nur, wenn das nicht mehr gilt (etwa nach `cls` oder wenn die Eingabe nach unten gewandert ist). Steht er zuvor frei (keine Eingabe im Bild), gilt die bisherige Reihenfolge: unten, sonst oben, sonst das grössere Band. Weitere Ursachen für das Springen in Claude-Tabs mit der echten Darstellung von Claude Code suchen (siehe Hinweise) und beheben, zum Beispiel: Die Linie wird in manchen Bildern nicht erkannt, oder der Cursor steht länger als 100 ms woanders.
- **Spezifikation:** Ticket 32 sagt „eine halbe Zeile“ Abstand. Das wird durch diese Regeln ersetzt. Die Präzisierungen aus der Umsetzung kommen in den neuen Abschnitt.
- **Handbuch:** prüfen, ob der Satz zu den Hinweisen noch stimmt.

## Akzeptanzkriterien

- [x] Tests (reine Funktionen) für den Abstand:
  - Prompt in der letzten Zeile → die Unterkante der Karte liegt 18 px über der Oberkante der Prompt-Zeile.
  - Claude-Eingabe unter einer Linie → die Unterkante liegt 18 px über der gemessenen Lage der Linie.
  - Prompt oben → Stapel unten wie heute.
- [x] Tests für den Bereich unter der Eingabe:
  - Claude-Eingabe mit Linie, Statuszeile mit fünf Zeilen und Modus darunter, eine Karte, die darunter Platz hätte → der Stapel steht über der Linie, nicht darunter.
  - Shell mit leeren Zeilen unter dem Prompt → unten wie heute.
  - Vorschlagsliste unter dem Prompt → sie bleibt frei.
- [x] Tests gegen das Springen:
  - Die Statuszeile wechselt zwischen zwei und sechs Zeilen, der Stapel bleibt stehen.
  - Die Höhe des Stapels ändert sich, der Stapel wechselt das Band nur, wenn er im bisherigen keinen Platz mehr hat.
  - Weitere Tests für jede Ursache, die die Untersuchung findet.
- [x] Echte Darstellung von Claude Code (siehe Hinweise) in einem xterm.js ohne Bildschirm:
  - `findInput` erkennt die Linie über dem Eingabefeld.
  - Der Cursor steht im Eingabefeld, auch beim Tippen, mit mehrzeiliger Eingabe und mit offener Vorschlagsliste (`/`).
  - Die Lage des Stapels verdeckt weder Eingabefeld noch Statuszeile.
  - Die Ergebnisse stehen in den Hinweisen aus der Umsetzung.
- [x] In der App im Testmodus über CDP auf der eigenen Seite:
  - In einem cmd-Tab mit dem Prompt in der letzten Zeile ist der Abstand Karte–Prompt gleich dem Abstand Karte–rechter Rand.
  - In einem Tab mit einem Bildschirm wie in Claude ist der Abstand Karte–Linie gleich dem Abstand Karte–rechter Rand, und die Zeilen unter dem Eingabefeld bleiben frei. Den Bildschirm liefert die echte Ausgabe von Claude Code oder eine Aufzeichnung davon, die in den Tab geschrieben wird.
  - Bildschirmfotos hell und dunkel per `PrintWindow`.
- [x] Die bisherigen Tests der Tickets 14, 22, 27, 31 und 32 laufen weiter; Tests aus Ticket 32, die eine halbe Zeile Abstand erwarten, sind auf die neue Regel umgestellt.
- [x] Spezifikation und Handbuch beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Claude-Tab mit Statuszeile: Der Hinweis steht über dem Eingabefeld, der Abstand zur Linie ist so gross wie der zum rechten Rand. Die Statuszeile bleibt sichtbar.
- [ ] Claude arbeitet, ein zweiter Hinweis kommt dazu, die Statuszeile ändert sich: Der Stapel springt nicht.
- [ ] PowerShell mit dem Prompt in der letzten Zeile: gleicher Abstand über der Prompt-Zeile; nach `cls` wieder ganz unten.

## Hinweise

- **Echte Darstellung von Claude Code ohne die Konfiguration des Nutzers:**
  - Das installierte `claude` (`%USERPROFILE%\.local\bin\claude.exe`) in einem eigenen Pseudoterminal (node-pty) starten und die Ausgabe in ein xterm.js ohne Bildschirm schreiben (`@xterm/headless`, wie die Tests in `inputArea.test.ts`).
  - Dabei gilt:
    - `CLAUDE_CONFIG_DIR` zeigt auf einen Temp-Ordner. Das echte `%USERPROFILE%\.claude` und `%USERPROFILE%\.claude.json` werden weder gelesen noch geändert.
    - Kein echter Zugang. Damit Claude ohne Anmeldung das Eingabefeld zeigt, genügen in der Regel ein Platzhalter für `ANTHROPIC_API_KEY`, im Temp-Ordner eine Konfiguration mit abgeschlossenem Onboarding, freigegebenem Platzhalter-Schlüssel und als vertrauenswürdig markiertem Arbeitsordner sowie `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` und `DISABLE_AUTOUPDATER=1`.
    - Arbeitsordner ist ein leerer Temp-Ordner.
    - Nie einen Prompt absenden, nur tippen und wieder löschen.
    - `THUB_*` vorher entfernen.
  - Die Statuszeile im Temp-Ordner nachbilden: ein Befehl, der wie beim Nutzer eine Überschrift und vier Balken-Zeilen ausgibt.
  - Lässt sich das Eingabefeld so nicht erreichen, nachgebaute Bildschirme nach dem Aufbau verwenden, den Ticket 32 belegt hat, und den Grund in die Hinweise aus der Umsetzung schreiben.
- Der Abstand zwischen zwei Karten (10 px) bleibt.

## Hinweise aus der Umsetzung

- **Echte Darstellung erreicht.** Das installierte Claude Code 2.1.332 lief in einem eigenen Pseudoterminal (node-pty, mitgelieferte ConPTY wie in der App, darin `cmd /d`), die Ausgabe ging in ein xterm.js in Node. `@xterm/headless` ist nicht installiert; `@xterm/xterm` läuft in Node ohne Bildschirm genauso, wie schon in `inputArea.test.ts`.
  - Umgebung: `CLAUDE_CONFIG_DIR`, `HOME` und `USERPROFILE` in einem Temp-Ordner; Platzhalter-Schlüssel, in `.claude.json` freigegeben; Onboarding abgeschlossen, Arbeitsordner vertrauenswürdig; `ANTHROPIC_BASE_URL` auf einen geschlossenen Port von `127.0.0.1`, damit auch ein versehentliches Abschicken nirgends ankäme; `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_AUTOUPDATER=1`; `CLAUDE_CODE_HIDE_CWD=1`, damit kein Pfad im Bild steht; geerbte `CLAUDE*`, `ANTHROPIC*` und `THUB_*` entfernt.
  - Statuszeile nachgebildet: eine Überschrift und Balken, Zeilenzahl aus einer Datei, mit `statusLine.refreshInterval: 1` jede Sekunde neu.
  - Nur getippt und gelöscht: kurzer und langer (umbrechender) Text, eingefügter mehrzeiliger Text (eingeklammertes Einfügen), Cursor nach links und oben, `/` und `/he` mit Vorschlagsliste, `Esc`. Nie Enter. Beendet mit zweimal `Ctrl+C`, danach der eigene Prozessbaum mit Zeitgrenze; kein `claude.exe` blieb zurück.
  - Zwei Läufe: im Vollbild (Standard in 2.1.332, alternativer Bildschirm) und ohne (`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`). Die Skripte liegen nicht im Repo.
- **Ergebnisse der echten Darstellung:**
  - In allen 633 Bildern mit Eingabefeld (326 im Vollbild, 307 ohne; ausgewertet nach jedem Stück Ausgabe) stand der Cursor zwischen den beiden Linien, und `findInput` erkannte die Linie darüber. Das gilt beim Tippen, bei umbrochener und mehrzeiliger Eingabe, beim Bewegen im Text und bei offener Vorschlagsliste.
  - Mit den neuen Regeln (Masse wie in der App, eine Karte von 117 px) verdeckte der Stapel in keinem Bild Eingabefeld, Statuszeile oder Modus und wechselte nie das Band.
  - Aufbau: Im Vollbild sind Eingabefeld, Statuszeile und Modus unten verankert; wird die Statuszeile höher, rückt das Eingabefeld hoch. Ohne Vollbild wächst die Statuszeile nach unten. Die Vorschlagsliste steht im Vollbild über dem Eingabefeld, ohne Vollbild darunter. Rechts über der Linie steht zeitweise ein Hinweis von Claude („◐ medium · /effort“, „ctrl+g to edit in Notepad“). Claude überschreibt Altes teils mit Leerzeichen; solche Zeilen zählen als leer.
- **Ursache des Springens: Verdacht bestätigt.** In der App im Testmodus lief echtes Claude Code im Vollbild in einem cmd-Tab, mit einem Hinweis (eine Karte, 117 px; Schrift 14, Zeile 16 px, Fenster 1219 × 770 CSS-Pixel). Mit dem Stand von Ticket 32 stand der Stapel bei sechs Zeilen Statuszeile unter der Eingabe, auf der Statuszeile, und bei zwei bis fünf Zeilen über der Eingabe. Jeder Wechsel zwischen fünf und sechs Zeilen liess ihn springen (`data-band` above → below → above …). Unter der Cursorzeile stehen im Vollbild die untere Linie, die Statuszeile und der Modus; mit 4 bis 6 Zeilen Statuszeile passt eine Karte dort gerade so oder gerade nicht. Ebenso wechselt der Stapel, wenn eine zweite Karte dazukommt oder geht. Andere Ursachen (Linie nicht erkannt, Cursor woanders) zeigten die Aufzeichnungen nicht.
- **Abstand gemessen:**
  - Mit der halben Zeile lag die Karte 14 px über Claudes Linie (Bildschirmfoto), zum rechten Rand 18 px.
  - Wo die Linie in ihrer Zeile steht, wurde per Bildschirmfoto gemessen: Schriftgrössen 11 bis 24, Skalierung 100, 150 und 200 % (`--force-device-scale-factor` nur für den eigenen Prozess). Das oberste Pixel der Linie liegt bei 39 bis 46 % der Zeilenhöhe. Gerechnet wird mit `RULE_TOP = 0.43`, höchstens 0,7 px daneben.
  - Neuer Stand in der App: Karte–Linie 17,8 px (bis zum obersten, halb deckenden Pixel der Linie; bis zur voll deckenden Linie 18,4 px), Karte–Prompt-Zeile in cmd 18,0 px, Karte–rechter Rand 18,0 px.
- **Umsetzung:**
  - `findInput` liefert zusätzlich `startIsRule` (der Anfang ist eine Linie) und `endRow` (letzte nicht leere Zeile im Bild, mindestens die Cursorzeile). Darunter fragt es die Zeilen von unten bis zur ersten nicht leeren ab.
  - `placeStack` misst zur sichtbaren Oberkante (`RULE_TOP` bei einer Linie) und lässt `edge` Abstand; unter der Eingabe beginnt das Band `edge` unter `endRow`. Das Band, in dem der Stapel steht, kommt als zweites Argument und gilt zuerst, solange der Stapel dort ganz Platz hat. `useStackPlacement` reicht das angezeigte Band herein (`null`, solange keine Karte stand).
  - Der gemeinsame Wert ist die CSS-Variable `--toast-edge` (tokens.css, 18 px): `.toasts` nimmt sie für den Innenabstand rechts und unten und für die Breite, `useStackPlacement` liest sie wie `--titlebar-h` und gibt sie als `edge` in die Rechnung. `EDGE_BOTTOM` gibt es nicht mehr.
  - Unter der Eingabe beginnt die Spalte jetzt immer genau an der letzten geschützten Zeile (bisher bei passendem Stapel mit 10 px Innenabstand darüber); sichtbar ändert das nichts.
  - `TerminalView.inputGeometry` braucht keine Änderung.
- **Tests:** `test/renderer/inputArea.test.ts` (21, davon 4 auf dem Puffer eines echten xterm.js), `test/renderer/stackPlacement.test.ts` (29). Die Bildschirme in `test/support/claudeScreens.ts` sind der Aufzeichnung nachgebaut (Vollbild und ohne). Die Aufzeichnung selbst liegt nicht im Repo: Sie enthält Claudes Begrüssung und Texte und hängt an einer Version.
- **Abweichung „der Stapel bleibt stehen“:** Ohne Vollbild bleibt er beim Wechsel der Statuszeile wirklich stehen. Im Vollbild rückt Claudes Eingabefeld selbst mit der Statuszeile hoch und runter; der Stapel bleibt dann im Band über der Eingabe und gleitet mit, immer 18 px über der Linie. Er springt nicht mehr zwischen den Bändern. Die Tests prüfen beides.
- **In der App geprüft** (Testmodus, CDP auf der eigenen Seite, reduzierte Bewegung emuliert, `--disable-features=CalculateNativeWinOcclusion`), mit echtem Claude Code in einem cmd-Tab:
  - cmd mit dem Prompt in der letzten Zeile: über dem Prompt, Abstand 18,0 px wie rechts; nach `cls` unten, 18,0 px über dem Fensterrand.
  - Claude im Vollbild, Statuszeile nacheinander 5, 4, 6, 4, 6, 2, 6, 5 Zeilen: immer über der Linie, Abstand 17,8 px, Statuszeile und Modus frei, `data-band` blieb durchgehend `above`.
  - Claude ohne Vollbild, dieselbe Folge: ebenso.
  - Bildschirmfotos hell und dunkel per `PrintWindow` (cmd und Claude im Vollbild und ohne).
- **Bildschirmfotos bei 150 %:** Das Skript für `PrintWindow` muss sich als DPI-bewusst melden, sonst ist das Bild abgeschnitten. Steht jetzt in `docs/entwicklung.md` unter „Testmodus“, zusammen mit dem Start von echtem Claude Code in einem Tab der Test-App.
- **Bekannte Grenzen:**
  - Claudes Vorschlagsliste im Vollbild und der zeitweise Hinweis rechts über der Linie stehen über der Eingabe; der Stapel kann sie rechts teilweise verdecken.
  - Wie Claude beim Arbeiten zeichnet (Spinner, gestreamte Antwort), liess sich ohne abgeschickten Prompt nicht aufzeichnen; die Ruhe aus Ticket 32 (100 ms) bleibt, die Prüfung steht in der Abnahme von Hand.
  - `RULE_TOP` ist für Cascadia Mono gemessen. Mit einer anderen Schrift kann der Abstand um etwa einen Pixel abweichen.
- Typecheck, `npm test` (56 Dateien, 1179 Tests) und der Build sind grün.
