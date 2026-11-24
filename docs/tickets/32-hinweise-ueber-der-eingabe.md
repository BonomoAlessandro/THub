# 32 – Hinweise weichen der Eingabe aus

Status: `erledigt` (2026-11-24, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
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

- [x] Tests für den Eingabe-Anfang (reine Funktion):
  - lange Shell-Zeile über drei Zeilen (`isWrapped`) → erste der drei;
  - Claude-Eingabe über drei Zeilen unter einer Linie aus `─` → die Linie;
  - alter Rahmen `╭──╮` → dessen obere Zeile;
  - Linie weiter weg als die halbe Terminalhöhe oder schmaler als die halbe Breite → Cursorzeile;
  - eine Linie in Claudes Antwort weiter oben zählt nicht, die nächste über dem Cursor gewinnt;
  - ohne Linie und ohne Umbruch → Cursorzeile.
- [x] Tests für die Wahl des Bands (reine Funktion):
  - Prompt in der letzten Zeile → über der Eingabe, Unterkante mit Abstand über ihrem Anfang;
  - Claude-Eingabe mit drei Zeilen Rahmen und Statuszeile darunter → über der Linie;
  - Prompt oben → unten wie heute;
  - Stapel zu hoch für beide Bänder → das grössere;
  - Eingabe nicht im Bild → unten wie heute.
- [x] Ein Test mit einer Folge von Cursorständen, wie Claude sie beim Neuzeichnen erzeugt (kurz hoch, dann zurück an die Eingabe): Der Stapel bleibt stehen. Ein Test, dass der Stapel unter der Maus stehen bleibt und danach nachrückt.
- [x] In der App im Testmodus über CDP auf der eigenen Seite, in einem cmd-Tab:
  - Ausgabe bis zum unteren Rand erzeugen, sodass der Prompt in der letzten Zeile steht, und einen Hinweis auslösen (etwa mit `THUB_TEST_KEEPAWAKE_FAIL=1` und einem Klick auf den Schalter, oder über Hook-Ereignisse an die eigene Schnittstelle der Test-App) → die Unterkante der Karte liegt über der Oberkante der Cursorzeile;
  - einen langen Befehl tippen, der umbricht → die Karte liegt über seiner ersten Zeile;
  - nach `cls` → der Stapel liegt wieder unten wie heute.
  - Bildschirmfotos hell und dunkel per `PrintWindow`.
- [x] Die bisherigen Prüfungen der Hinweise (Tickets 14, 22, 27, 31) laufen weiter.
- [x] Handbuch und Spezifikation beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] In einem Claude-Tab steht ein Hinweis mit offenen Punkten. Ein langer Prompt über mehrere Zeilen bleibt ganz sichtbar, der Hinweis steht über dem Eingabefeld samt Linie, und die Punkte bleiben lesbar.
- [ ] Während Claude arbeitet (Spinner, lange Antwort), zuckt der Stapel nicht. `×` und Klick treffen die Karte.
- [ ] In PowerShell mit dem Prompt in der letzten Zeile steht der Hinweis über der Prompt-Zeile, nach `cls` wieder ganz unten.
- [ ] Im Verlauf nach oben scrollen: Der Stapel geht nach unten. Zurück ans Ende: Er steht wieder über der Eingabe.
- [ ] Claude im Vollbild-Modus: Der Hinweis steht über dem Eingabefeld.

## Hinweise

- **Cursor in Claude Code belegen:** Das Changelog von Claude Code nennt Korrekturen, damit der Terminal-Cursor dem getippten Text folgt (etwa „Fixed the terminal cursor jumping from the `/skills` search box to the skill list while typing, which could hide the caret and put IME input in the wrong place“). Das spricht dafür, dass der Cursor auch im Eingabefeld an der Eingabe steht. Belegen, ohne Claude Code mit der Konfiguration des Nutzers zu starten, zum Beispiel durch lesendes Durchsuchen des installierten Claude Code wie in Ticket 25. Lässt es sich nicht belegen, kommt es in die Abnahme von Hand. Die Linie über dem Eingabefeld fängt den Fall ohnehin ab, solange der Cursor irgendwo im Eingabefeld steht.
- Ausserhalb dieses Tickets: Mehrzeilige Eingaben in einer Shell mit eigenen Fortsetzungszeilen (PowerShell `>>`, Shift+Enter in PSReadLine) zählen nur ab der Cursorzeile und ihren umbrochenen Vorgängern. Prompt-Marken der Shell-Integration (OSC 133) gibt es nicht und kommen nicht dazu.

## Hinweise aus der Umsetzung

- **Cursor von Claude Code belegt** (nur lesend am installierten Claude Code 2.1.330, ohne es zu starten): Der Ink-Renderer hat eine Cursor-Deklaration (`setCursorDeclaration`, `onCursorDeclaration`). Eine Komponente meldet Knoten und Lage (`relativeX`, `relativeY`); nach jedem Bild setzt der Renderer den echten Terminal-Cursor dorthin, im Vollbild-Modus absolut, sonst relativ. Das Eingabefeld des Prompts meldet `caret = { line, column, visible }`, solange es den Fokus hat und den Cursor zeigt; ebenso Suchfelder, Auswahllisten (Rückfragen) und „Enter y/n“. Sichtbar ist der echte Cursor nur mit der Option `nativeCursor`, gesetzt wird er trotzdem. Der Rahmen des Prompts ist `borderStyle: "round"` ohne linken und rechten Rand: oben und unten eine volle Linie aus `─` (U+2500), ohne Ecken. Beides steht jetzt in der Spezifikation.
- Reine Rechnung: `findInput` und `isRuleLine` in `src/renderer/terminal/inputArea.ts`; `placeStack`, `freePlacement`, `samePlacement` und `SteadyPlacement` in `src/renderer/toasts/stackPlacement.ts`. Passt der Stapel in keines der beiden Bänder, endet die scrollbare Spalte auf der Seite der Eingabe genau an ihr (ohne den Innenabstand für den Schatten), damit gescrollte Karten die Eingabe nicht streifen.
- Oberfläche: `TerminalView` meldet Ausgabe (`onWriteParsed`), Cursor, Scrollen, Grösse und Schrift über `notifyTerminalChange` (`terminalViews.ts`) und liefert `inputGeometry()` (Oberkante und Höhe des Elements von xterm.js, Zeilenhöhe = Höhe / Zeilen). `useStackPlacement` (`src/renderer/toasts/useStackPlacement.ts`) wertet höchstens einmal pro Bild aus (`requestAnimationFrame`, im versteckten Fenster `setTimeout`), füttert `SteadyPlacement` und setzt `top`, `bottom`, `padding-top`, `padding-bottom` und `data-band` an `.toasts`; den Übergang (180 ms, `--ease`) macht `app.css`. Kommt die erste Karte (oder geht die letzte), wird sofort und ohne Übergang gesetzt. Ohne Karten wird nichts gemessen. Die Maus hält über `mouseenter`/`mouseleave` an `.toasts`; verschwindet die Karte unter der Maus, löst `:hover` das Halten.
- Tests: `test/renderer/inputArea.test.ts` (15, davon 3 auf dem Puffer eines echten xterm.js in Node) und `test/renderer/stackPlacement.test.ts` (14). Der DOM-Teil ist nicht in Vitest geprüft (keine DOM-Umgebung), sondern in der App.
- **Geprüft in der App im Testmodus über CDP** auf der eigenen Seite, in einem cmd-Tab, mit `THUB_TEST_KEEPAWAKE_FAIL=1` und einem Hinweis mit offenen Punkten aus dem vorbereiteten `state.json` (zwei Karten). Drei Läufe: Fenster versteckt (Seite `hidden`, Rückfall auf `setTimeout`, 21 von 21), Fenster für Chromium sichtbar (`--disable-features=CalculateNativeWinOcclusion`, `requestAnimationFrame`, 21 von 21) und sichtbar ohne emulierte reduzierte Bewegung (21 von 21, statt der Prüfung „kein Übergang“ die Prüfung, dass der Stapel gleitet). Geprüft: Prompt oben → Stapel unten wie bisher (Unterkante 18 px über dem Fensterrand); Prompt in der letzten Zeile → Unterkante eine halbe Zeile über der Cursorzeile, oben 10 px unter der Titelleiste; langer umbrechender Befehl → über seiner ersten Zeile; `cls` → wieder unten; Maus auf einer Karte (CDP-Mausereignis an die eigene Seite) → der Stapel bleibt trotz neuer Lage stehen, Maus weg → er rückt nach; im Verlauf nach oben gescrollt → unten wie bisher, zurück ans Ende → wieder über der Eingabe; der Stapel gleitet (Zwischenwerte der Unterkante über rund 100 ms bis auf einen halben Pixel); reduzierte Bewegung → kein Übergang. Bildschirmfotos hell und dunkel per `PrintWindow`.
- **ConPTY reicht in cmd `isWrapped` durch:** Beim Tippen eines langen Befehls sind die Folgezeilen in xterm.js als umbrochen markiert, ebenso bei einem Prompt, der wegen eines langen Pfads selbst über zwei Zeilen geht. Die Eingabe beginnt dann in der ersten Zeile des Prompts; der Stapel steht darüber.
- Bisherige Prüfungen der Hinweise: Die Kern-Tests der Tickets 14, 22, 27 und 31 laufen in `npm test` grün. In der App weiter geprüft: Fehler-Hinweis mit `role="alert"` und Klasse `error`, Schalter wieder aus (31); Klick schliesst ihn (31); Klick auf den Hinweis mit offenen Punkten nimmt ihn weg (27).
- Im versteckten Testfenster laufen weder Übergänge noch Animationen zu Ende, und `PrintWindow` zeigt nur den leeren Hintergrund. Für Messungen deshalb Layout-Werte (`offsetTop`, `offsetHeight`) statt `getBoundingClientRect` der Karten nehmen und reduzierte Bewegung emulieren; für Bildschirmfotos Chromium die Verdeckung nicht berechnen lassen (`docs/entwicklung.md`, „Testmodus“).
- Typecheck, `npm test` (55 Dateien, 1104 Tests) und der Build sind grün, auch `test/main/shellLaunch.test.ts` (Node 24.22.1).
- Bekannte Grenze: Die Lücke von 10 px zwischen zwei Karten gehört dem Terminal. Fährt die Maus dort durch, während eine neue Lage ansteht, rückt der Stapel nach.
