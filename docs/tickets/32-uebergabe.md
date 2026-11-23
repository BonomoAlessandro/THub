# Ticket 32 – Übergabe (Zwischenstand, unfertig)

Stand 2026-11-23 abends, Branch `worktree-agent-af6a2a3471a394e2a` (abgezweigt von `main` 96dcc19). Im Worktree ist `node_modules` eine Junction auf das `node_modules` des Haupt-Checkouts (kein `npm install`).

## Fertig (mit Tests, grün)

- `src/renderer/terminal/inputArea.ts`: reine Funktion `findInput` (Cursorzeile → Anfang der Eingabe: `isWrapped` aufwärts; nächste Linie aus Rahmenzeichen U+2500–U+257F über mindestens die halbe Breite in höchstens halber Höhe über dem Cursor; der höhere Anfang gilt) und `isRuleLine`.
- `src/renderer/toasts/stackPlacement.ts`: `placeStack` (Band `free`/`below`/`above`, halbe Zeile Abstand zur Eingabe, Ränder 10/18 px wie bisher; passt der Stapel nirgends, endet die Spalte auf der Seite der Eingabe genau an ihr), `samePlacement`, `SteadyPlacement` (100 ms Ruhe, Halten unter der Maus, `jump` solange keine Karte steht).
- Tests: `test/renderer/inputArea.test.ts` (15, auch mit echtem xterm.js in Node), `test/renderer/stackPlacement.test.ts` (14, inkl. Folge von Cursorständen beim Neuzeichnen und Maus). Beide laufen grün.

## Angefangen

- `src/renderer/terminal/terminalViews.ts`: `notifyTerminalChange` / `onTerminalChange` (fertig).
- `src/renderer/terminal/TerminalView.ts`: meldet Änderungen bei `onWriteParsed`, `onCursorMove`, `onScroll`, `onResize`, `setFontSize`; neue Methode `inputGeometry()` (Zeilenhöhe = Höhe von `term.element` / Zeilen). Noch nicht typgeprüft.

## Fehlt noch

1. DOM-Teil: Hook `src/renderer/toasts/useStackPlacement.ts` mit einer Klasse, die misst (Fensterhöhe, `--titlebar-h`, `inputGeometry()` des aktiven Tabs, Stapelhöhe aus `offsetTop`/`offsetHeight` der Karten), auswertet, `SteadyPlacement` füttert und `top`, `bottom`, `padding-top`, `padding-bottom` und `data-band` an `.toasts` setzt. Plan:
   - Auswerten höchstens einmal pro Bild: `requestAnimationFrame`, wenn `document.visibilityState === 'visible'`, sonst `setTimeout(…, 0)`.
   - Auslöser: `onTerminalChange` (nur aktiver Tab), Wechsel des Tabs, `resize`, `visibilitychange`, Stapelhöhe nach jedem Zeichnen (`useLayoutEffect` ohne Abhängigkeiten).
   - War der Stapel leer (oder wird leer): sofort auswerten und ohne Übergang setzen (`transition: none`, Reflow, zurück), damit der erste Hinweis gleich am richtigen Platz erscheint.
   - `onMouseEnter`/`onMouseLeave` an `.toasts` → `hold(true/false)`.
2. In `Toasts.tsx` einbinden (Ref auf `.toasts`), in `app.css` an `.toasts` `transition: top, bottom, padding-top, padding-bottom` mit `var(--dur) var(--ease)`; reduzierte Bewegung schaltet Übergänge schon global ab. Kommentar: Ränder 10/18 px gleich `EDGE_TOP`/`EDGE_BOTTOM`.
3. Typecheck, `npm test`, `npm run build`.
4. Prüfung in der App im Testmodus über CDP (Helfer liegt nur im Scratchpad dieser Sitzung, neu schreiben): Datenordner mit vorbereitetem `state.json` (ein cmd-Tab, `defaultShellId: 'cmd'`), Start mit `THUB_TEST_HIDDEN=1`, `THUB_TEST_DATA_DIR`, `THUB_TEST_KEEPAWAKE_FAIL=1`, zufälligem Debug-Port, ohne geerbte `THUB_*`. Schreiben in die Shell über `window.thub.send({ type: 'writeToTab', … })`, Hinweis über `window.thub.send({ type: 'updateSettings', patch: { keepAwake: true } })`. Prüfen: Prompt unten → Karte über der Cursorzeile; langer umbrechender Befehl → über seiner ersten Zeile; `cls` → unten. Bildschirmfotos hell/dunkel per `PrintWindow`. Bisherige Prüfungen der Hinweise (14, 22, 27, 31) weiter.
5. Doku: Handbuch „Hinweise im Fenster“ (ein Satz), Spezifikation (Präzisierungen, Cursor von Claude, Zeichen der Linie), Ticket abhaken und „Hinweise aus der Umsetzung“, `docs/tickets/README.md` auf „erledigt“, `docs/entwicklung.md` (Renderer-Tabelle, Tests). Diese Übergabe-Datei danach löschen.

## Cursor von Claude Code (belegt, nur lesend am installierten 2.1.330)

- Der Ink-Renderer von Claude Code hat eine „Cursor-Deklaration“ (`setCursorDeclaration`, `onCursorDeclaration`): Eine Komponente meldet Knoten und Lage (`relativeX`, `relativeY`); nach jedem Bild setzt der Renderer den echten Terminal-Cursor dorthin (im Vollbild absolut, sonst relativ). Sichtbar ist der echte Cursor nur mit der Option `nativeCursor`, gesetzt wird er trotzdem.
- Das Eingabefeld des Prompts gibt `caret = { line: cursorLine, column: cursorColumn, visible: … }` weiter, solange es den Fokus hat und den Cursor zeigt; ebenso Suchfelder, Auswahllisten (Rückfragen) und „Enter y/n“.
- Rahmen des Prompts: `borderStyle: "round"`, `borderLeft: false`, `borderRight: false`, `borderBottom: true` → oben und unten eine volle Linie aus `─` (U+2500), ohne Ecken.

## Stolpersteine

- Im versteckten Testfenster ist `document.visibilityState` `hidden`: `requestAnimationFrame` läuft gar nicht, `setTimeout` ist auf rund 1 s gedrosselt. Deshalb der Rückfall auf `setTimeout` und in der Prüfung grosszügig warten. Animationen und Übergänge laufen dort vermutlich nicht weiter (vgl. Ticket 31); für Messungen über CDP reduzierte Bewegung emulieren (`Emulation.setEmulatedMedia` mit `prefers-reduced-motion: reduce`) oder Layout-Werte (`offsetTop`, gesetzte Styles) statt `getBoundingClientRect` nehmen.
- Gemessen im Testfenster (1100×700, Schrift 14): `.xterm` und `.xterm-screen` sind gleich hoch (624 px = 39 × 16), die Zeilenhöhe aus `term.element` stimmt also.
- Ob ConPTY beim Tippen eines langen Befehls in cmd die Zeilen als umbrochen (`isWrapped`) durchreicht, ist noch nicht in der App geprüft.

## Nächster Schritt

`useStackPlacement.ts` schreiben (Punkt 1), in `Toasts.tsx` und `app.css` einbinden, dann Typecheck und Tests.
