# 35 – Hinweise: Abstand zur Eingabe und Lage in Claude-Tabs

Status: `ready-for-agent` · Typ: AFK
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

- [ ] Tests (reine Funktionen) für den Abstand:
  - Prompt in der letzten Zeile → die Unterkante der Karte liegt 18 px über der Oberkante der Prompt-Zeile.
  - Claude-Eingabe unter einer Linie → die Unterkante liegt 18 px über der gemessenen Lage der Linie.
  - Prompt oben → Stapel unten wie heute.
- [ ] Tests für den Bereich unter der Eingabe:
  - Claude-Eingabe mit Linie, Statuszeile mit fünf Zeilen und Modus darunter, eine Karte, die darunter Platz hätte → der Stapel steht über der Linie, nicht darunter.
  - Shell mit leeren Zeilen unter dem Prompt → unten wie heute.
  - Vorschlagsliste unter dem Prompt → sie bleibt frei.
- [ ] Tests gegen das Springen:
  - Die Statuszeile wechselt zwischen zwei und sechs Zeilen, der Stapel bleibt stehen.
  - Die Höhe des Stapels ändert sich, der Stapel wechselt das Band nur, wenn er im bisherigen keinen Platz mehr hat.
  - Weitere Tests für jede Ursache, die die Untersuchung findet.
- [ ] Echte Darstellung von Claude Code (siehe Hinweise) in einem xterm.js ohne Bildschirm:
  - `findInput` erkennt die Linie über dem Eingabefeld.
  - Der Cursor steht im Eingabefeld, auch beim Tippen, mit mehrzeiliger Eingabe und mit offener Vorschlagsliste (`/`).
  - Die Lage des Stapels verdeckt weder Eingabefeld noch Statuszeile.
  - Die Ergebnisse stehen in den Hinweisen aus der Umsetzung.
- [ ] In der App im Testmodus über CDP auf der eigenen Seite:
  - In einem cmd-Tab mit dem Prompt in der letzten Zeile ist der Abstand Karte–Prompt gleich dem Abstand Karte–rechter Rand.
  - In einem Tab mit einem Bildschirm wie in Claude ist der Abstand Karte–Linie gleich dem Abstand Karte–rechter Rand, und die Zeilen unter dem Eingabefeld bleiben frei. Den Bildschirm liefert die echte Ausgabe von Claude Code oder eine Aufzeichnung davon, die in den Tab geschrieben wird.
  - Bildschirmfotos hell und dunkel per `PrintWindow`.
- [ ] Die bisherigen Tests der Tickets 14, 22, 27, 31 und 32 laufen weiter; Tests aus Ticket 32, die eine halbe Zeile Abstand erwarten, sind auf die neue Regel umgestellt.
- [ ] Spezifikation und Handbuch beschreiben das Verhalten.
- [ ] Typecheck, `npm test` und der Build sind grün.

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

(vom Agenten auszufüllen)
