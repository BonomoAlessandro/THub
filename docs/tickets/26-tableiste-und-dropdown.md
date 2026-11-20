# 26 – Tab-Leiste, neue Tabs am Ende, Dropdown im dunklen Design

Status: `offen` · Typ: AFK
Blockiert durch: –
Herkunft: Abnahme von Hand (Ticket 19), „Die Tableiste“, „Neue Tabs“ und „Dropdown in den Einstellungen“ in [docs/abnahme.md](../abnahme.md)
Spezifikation: „Oberfläche (Renderer)“, Design-Tokens

## Was gebaut wird

- **Höhere Tabs, Klickfläche bis an den oberen Rand.**
  - Die Tabs bleiben Karten wie im freigegebenen Design, werden aber etwas höher: `--tab-h` von 30 px auf 34 px. Die Titelleiste bleibt 44 px hoch, sofern nichts dagegen spricht.
  - Unsichtbar reicht die Klickfläche jedes Tabs bis ganz an den oberen Fensterrand, damit ein Klick knapp über einem Tab nicht ins Leere geht. Das gilt für Klick, Rechtsklick und Ziehen; Tooltip und Hover gelten dann auch dort.
  - Im maximierten Fenster bis zur obersten Pixelreihe. Im nicht maximierten Fenster bleibt der Rand zum Grössenziehen von Windows oben frei (Verhalten wie Chrome).
  - Mit `WM_NCHITTEST` prüfen, dass die freie Fläche weiterhin zum Verschieben dient und oben die Grösse ziehbar bleibt.
- **Neue Tabs am Ende.**
  - `+`, `Ctrl+Shift+T`, Pfeil-Menü (Shell oder „Neues Terminal in …“) und Palette öffnen den neuen Tab am Ende der Leiste, nicht neben dem aktiven.
  - Ausnahmen bleiben: „Duplizieren“ legt rechts neben der Quelle an (Ticket 16), und ein wieder geöffneter Tab kommt an seine alte Stelle (Ticket 15).
- **Dropdown im dunklen Design.** Die aufgeklappte Liste „Standard-Shell“ in den Einstellungen ist im dunklen Design weiss. Sie soll dem Design folgen, etwa über `color-scheme` je nach aktivem Design, und auch bei „System“ stimmen. Andere native Bedienelemente gleich mitprüfen.

## Akzeptanzkriterien

- [ ] Kern-Test: Neue Tabs landen am Ende, auch wenn der erste Tab aktiv ist. Duplizieren und Wiederöffnen behalten ihre Position (bestehende Tests grün).
- [ ] Im Testmodus geprüft: Ein Klick in die Fläche über einem Tab trifft im maximierten Fenster den Tab. Die freie Fläche bleibt HTCAPTION; im nicht maximierten Fenster bleibt oben der Rand zum Grössenziehen.
- [ ] CDP-Screenshots der Tab-Leiste in hell und dunkel sowie des aufgeklappten Dropdowns im dunklen Design. Ist ein natives Popup per CDP nicht zu fotografieren, genügt der Nachweis über die berechneten Stile.
- [ ] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Die Tabs sind etwas höher; ein Klick knapp über einem Tab (im maximierten Fenster ganz oben) wählt ihn.
- [ ] Mit dem ersten Tab aktiv auf `+` → der neue Tab erscheint am Ende.
- [ ] Im dunklen Design ist die aufgeklappte Liste „Standard-Shell“ dunkel und lesbar.
