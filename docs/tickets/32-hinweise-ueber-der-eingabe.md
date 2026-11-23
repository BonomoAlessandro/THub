# 32 – Hinweise weichen der Eingabe aus

Status: `offen` · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-23. Die Hinweise unten rechts liegen genau über dem Eingabefeld von Claude und über der Prompt-Zeile einer Shell, sobald diese unten angekommen ist. Getippter Text, der bis nach rechts reicht, verschwindet hinter der Karte. Besonders störend ist das beim Hinweis mit offenen Punkten: Er erscheint auch im sichtbaren Tab und bleibt stehen, während der Nutzer die Punkte beantwortet.
Spezifikation: „Hinweise im Fenster“ (User Story 95, neu) und „Claude-Status“ → „Hinweise im Fenster“ → „Lage über der Eingabe“ (neu)

## Entscheidung

Der Nutzer hat am 2026-11-23 gewählt: Der Stapel bleibt unten rechts, steht aber **immer über der Eingabe**, unabhängig davon, wie weit der Text nach rechts reicht. So liegt er in einem Claude-Tab ruhig ein paar Zeilen höher als heute und springt beim Tippen nicht.

Verworfen:
- **Erst ausweichen, wenn der Text in den Bereich der Karte reicht:** verdeckt weniger von Claudes Antwort, springt dafür mitten im Tippen.
- **Beim Tippen durchsichtig, nach einer Pause zurück:** Die offenen Punkte verschwinden genau dann, wenn man sie beantwortet, und in jeder Tipp-Pause ist der Text wieder verdeckt.
- **Hinweise anderswo hinsetzen** (etwa oben rechts): Der Nutzer will sie unten rechts.
- **Terminal verkleinern, solange Hinweise stehen:** Das ändert die Grösse der Shell, und Claude zeichnet alles neu.

## Was gebaut wird

- **Grundregel:** Der Stapel der Hinweise verdeckt nie die Eingabe im sichtbaren Tab. Gemeint sind die Zeilen vom Anfang der Eingabe bis zur Zeile mit dem Cursor. Er liegt in einem der beiden freien Bänder rechts:
  1. **unter der Eingabe** (zwischen der Cursorzeile und dem unteren Fensterrand), wenn der ganze Stapel dort Platz hat. Das ist der heutige Platz, etwa bei einer Shell mit dem Prompt weit oben.
  2. sonst **über der Eingabe** (zwischen der Titelleiste und dem Anfang der Eingabe), wenn der ganze Stapel dort Platz hat. Das ist der Normalfall in einem Claude-Tab und in einer Shell mit dem Prompt in der letzten Zeile.
  3. sonst im **grösseren der beiden Bänder**. Dort scrollt die Spalte wie bisher.

  Innerhalb des Bands steht der Stapel unten, der neueste Hinweis oben, wie heute. Zur Eingabe bleibt etwa eine halbe Zeile Abstand, zum Fensterrand und zur Titelleiste derselbe wie heute. Steht die Eingabe nicht im Bild (Tab ohne Terminal, im Verlauf nach oben gescrollt), liegt der Stapel wie heute.
- **Wo die Eingabe steht:**
  - **Cursorzeile:** die Zeile mit dem Cursor von xterm.js im sichtbaren Ausschnitt (Cursor im Puffer abzüglich der Scroll-Position). Shells setzen den Cursor ohnehin an die Eingabe. Claude Code tut das laut seinem Changelog ebenfalls, damit die Eingabe mit IME an der richtigen Stelle landet. Das ist vor der Umsetzung kurz zu belegen (siehe Hinweise), und das Ergebnis kommt in die Hinweise aus der Umsetzung.
  - **Anfang der Eingabe:**
    - Zeilen, die xterm.js als umbrochen markiert (`isWrapped`), gehören zur Zeile darüber. Der Anfang ist die erste nicht umbrochene Zeile ab der Cursorzeile aufwärts. Das deckt lange Befehle in einer Shell ab.
    - Claude umbricht selbst (ohne `isWrapped`) und zeichnet über dem Eingabefeld eine waagrechte Linie. Liegt höchstens etwa die halbe Terminalhöhe über der Cursorzeile eine Zeile, die (ohne Leerzeichen) nur aus Rahmenzeichen besteht (Unicode-Block „Box Drawing“, U+2500 bis U+257F) und mindestens die halbe Breite einnimmt, gilt die nächste solche Zeile als Anfang. Die Linie selbst bleibt also frei. Das gilt in jedem Tab, nicht nur in Claude-Tabs, und deckt sowohl die Linie aus `─` als auch einen Rahmen aus `╭──╮` ab.
    - Gibt es nichts davon, ist die Cursorzeile der Anfang.
  - Alles unter der Cursorzeile (Rahmen unter dem Eingabefeld, Claudes Statuszeile) bleibt frei, weil der Stapel nur im Band über der Eingabe ausweicht oder ganz darunter Platz hat.
- **Ruhig bleiben:** Claude zeichnet seine Oberfläche laufend neu (Spinner, gestreamte Antwort) und setzt den Cursor dabei kurz an andere Stellen. Der Stapel darf dabei nicht zucken.
  - Vorschlag: Die Lage höchstens einmal pro Bild auswerten, nachdem xterm.js die Ausgabe verarbeitet hat. Der Stapel bewegt sich erst, wenn die neue Lage etwa 100 ms unverändert war.
  - Ausgelöst wird die Auswertung durch Ausgabe, Cursorbewegung, Scrollen, Wechsel des Tabs, Grösse des Fensters, Schriftgrösse und einen neuen oder weggenommenen Hinweis (die Höhe des Stapels ändert sich).
- **Bewegung:** Der Stapel gleitet mit der Standard-Übergangszeit (180 ms, Ease aus dem Design) an den neuen Platz, bei reduzierter Bewegung ohne Animation. Ein neuer Hinweis gleitet wie bisher herein, und zwar am aktuellen Platz des Stapels.
- **Maus:** Solange die Maus auf einer Karte steht, bleibt der Stapel stehen, damit `×` und Klick nicht wegrutschen. Danach rückt er nach. Neben den Karten geht die Maus wie bisher ans Terminal.
- **Gilt für alle Hinweise:** wartet, fertig, offene Punkte und den Fehler beim Wachhalten.
- **Die Berechnung ist eine reine Funktion ohne DOM:** einmal das Finden des Eingabe-Anfangs aus den Zeilen (Text und `isWrapped`) und der Cursorzeile, einmal die Wahl des Bands aus den Massen (Höhe von Fenster, Titelleiste und Zeilen, Lage des Terminals, Eingabe, Höhe des Stapels). Die Oberfläche liest nur Masse und Zeilen aus xterm.js aus und setzt das Ergebnis. Die Zellhöhe kommt über die öffentliche Schnittstelle oder aus der Höhe des Terminal-Elements geteilt durch die Zeilenzahl, nicht aus internen Feldern von xterm.js.
- **Doku:**
  - Handbuch „Hinweise im Fenster“: ein Satz, dass die Hinweise über der Eingabe stehen.
  - In der Spezifikation die Präzisierungen aus der Umsetzung, etwa wie Claude den Cursor setzt und welche Zeichen seine Linie hat.

## Akzeptanzkriterien

- [ ] Tests für den Eingabe-Anfang (reine Funktion):
  - lange Shell-Zeile über drei Zeilen (`isWrapped`) → erste der drei;
  - Claude-Eingabe über drei Zeilen unter einer Linie aus `─` → die Linie;
  - alter Rahmen `╭──╮` → dessen obere Zeile;
  - Linie weiter weg als die halbe Terminalhöhe oder schmaler als die halbe Breite → Cursorzeile;
  - eine Linie in Claudes Antwort weiter oben zählt nicht, die nächste über dem Cursor gewinnt;
  - ohne Linie und ohne Umbruch → Cursorzeile.
- [ ] Tests für die Wahl des Bands (reine Funktion):
  - Prompt in der letzten Zeile → über der Eingabe, Unterkante mit Abstand über ihrem Anfang;
  - Claude-Eingabe mit drei Zeilen Rahmen und Statuszeile darunter → über der Linie;
  - Prompt oben → unten wie heute;
  - Stapel zu hoch für beide Bänder → das grössere;
  - Eingabe nicht im Bild → unten wie heute.
- [ ] Ein Test mit einer Folge von Cursorständen, wie Claude sie beim Neuzeichnen erzeugt (kurz hoch, dann zurück an die Eingabe): Der Stapel bleibt stehen. Ein Test, dass der Stapel unter der Maus stehen bleibt und danach nachrückt.
- [ ] In der App im Testmodus über CDP auf der eigenen Seite, in einem cmd-Tab:
  - Ausgabe bis zum unteren Rand erzeugen, sodass der Prompt in der letzten Zeile steht, und einen Hinweis auslösen (etwa mit `THUB_TEST_KEEPAWAKE_FAIL=1` und einem Klick auf den Schalter, oder über Hook-Ereignisse an die eigene Schnittstelle der Test-App) → die Unterkante der Karte liegt über der Oberkante der Cursorzeile;
  - einen langen Befehl tippen, der umbricht → die Karte liegt über seiner ersten Zeile;
  - nach `cls` → der Stapel liegt wieder unten wie heute.
  - Bildschirmfotos hell und dunkel per `PrintWindow`.
- [ ] Die bisherigen Prüfungen der Hinweise (Tickets 14, 22, 27, 31) laufen weiter.
- [ ] Handbuch und Spezifikation beschreiben das Verhalten.
- [ ] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] In einem Claude-Tab steht ein Hinweis mit offenen Punkten. Ein langer Prompt über mehrere Zeilen bleibt ganz sichtbar, der Hinweis steht über dem Eingabefeld samt Linie, und die Punkte bleiben lesbar.
- [ ] Während Claude arbeitet (Spinner, lange Antwort), zuckt der Stapel nicht. `×` und Klick treffen die Karte.
- [ ] In PowerShell mit dem Prompt in der letzten Zeile steht der Hinweis über der Prompt-Zeile, nach `cls` wieder ganz unten.
- [ ] Im Verlauf nach oben scrollen: Der Stapel geht nach unten. Zurück ans Ende: Er steht wieder über der Eingabe.
- [ ] Claude im Vollbild-Modus: Der Hinweis steht über dem Eingabefeld.

## Hinweise

- **Cursor in Claude Code belegen:** Das Changelog von Claude Code nennt Korrekturen, damit der Terminal-Cursor dem getippten Text folgt (etwa „Fixed the terminal cursor jumping from the `/skills` search box to the skill list while typing, which could hide the caret and put IME input in the wrong place“). Das spricht dafür, dass der Cursor auch im Eingabefeld an der Eingabe steht. Belegen, ohne Claude Code mit der Konfiguration des Nutzers zu starten, zum Beispiel durch lesendes Durchsuchen des installierten Claude Code wie in Ticket 25. Lässt es sich nicht belegen, kommt es in die Abnahme von Hand. Die Linie über dem Eingabefeld fängt den Fall ohnehin ab, solange der Cursor irgendwo im Eingabefeld steht.
- Ausserhalb dieses Tickets: Mehrzeilige Eingaben in einer Shell mit eigenen Fortsetzungszeilen (PowerShell `>>`, Shift+Enter in PSReadLine) zählen nur ab der Cursorzeile und ihren umbrochenen Vorgängern. Prompt-Marken der Shell-Integration (OSC 133) gibt es nicht und kommen nicht dazu.
