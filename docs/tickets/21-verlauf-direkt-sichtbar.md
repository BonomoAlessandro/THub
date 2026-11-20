# 21 – Verlauf nach dem Neustart direkt sichtbar

Status: `erledigt (verworfen)` · Typ: AFK
Blockiert durch: 08
User Stories: 58
Spezifikation: „Wiederherstellen“ (normaler Tab)

> **Ergebnis (2026-11-20):** nicht eingebaut. Beim Start funktioniert `conptyInheritCursor` in allen vier Shells, beim Verändern der Fenstergrösse beschädigt ConPTY aber Trennlinie, Verlauf oder Shell-Zeilen. Der Verlauf bleibt im Scrollback. Befunde: `docs/spikes/verlauf-sichtbar.md`.

## Was gebaut wird

Heute steht der wiederhergestellte Verlauf eines normalen Tabs nach einem Neustart im Scrollback: Sichtbar ist nur der neue Prompt, der alte Inhalt erscheint erst nach einmal Hochscrollen. Grund: ConPTY leert beim Start der Shell den sichtbaren Bereich. Der Nutzer möchte den Verlauf wie im Prototyp **direkt über dem neuen Prompt sehen**.

Ausprobiert wird die node-pty-Option `conptyInheritCursor` (Windows-Flag `PSEUDOCONSOLE_INHERIT_CURSOR`), die auch VS Code beim Wiederherstellen von Terminals nutzt: ConPTY fragt beim Start die Cursorposition ab (DSR) und beginnt darunter, statt den sichtbaren Bereich zu leeren.

1. **Ausprobieren** mit echten Shells (PowerShell 7, Windows PowerShell, cmd, Git Bash) und einem Terminal-Abbild (zum Beispiel `@xterm/headless`) in einem eigenen Versuchsaufbau:
   - Bleibt der Verlauf samt Trennlinie sichtbar, und steht der neue Prompt direkt darunter?
   - Was passiert beim **Verkleinern und Vergrössern** (Spalten und Zeilen), auch mehrfach hintereinander? Werden alte Zeilen überschrieben oder verschoben?
   - Langer Verlauf (mehr Zeilen als sichtbar): Der Rest liegt im Scrollback, das Ende ist sichtbar.
   - Wird die Cursor-Abfrage zuverlässig beantwortet? Die Antwort kommt von xterm.js im Renderer über den normalen Eingabeweg; der Startauftrag kommt laut Vertrag erst nach „Ansicht bereit“. Was passiert, wenn die Antwort ausbleibt (hängt der Start)?
2. **Entscheiden nach Ergebnis:**
   - **Funktioniert es sauber:** für wiederhergestellte normale Tabs einbauen (neue Tabs und Claude-Tabs unverändert). Der Verlauf wird dann in den sichtbaren Bereich geschrieben statt mit Leerzeilen in den Scrollback geschoben. Spezifikation („Wiederherstellen“) nachführen.
   - **Funktioniert es nicht sauber:** beim heutigen Verhalten bleiben. Befunde in `docs/spikes/verlauf-sichtbar.md` festhalten, damit klar ist, warum.

## Akzeptanzkriterien

Nicht erfüllt und nicht weiterverfolgt: Das Ticket ist nach dem Versuch verworfen (siehe oben).

- [ ] Versuchsergebnisse für alle vier Shells dokumentiert (`docs/spikes/verlauf-sichtbar.md`), inklusive Verkleinern und Vergrössern.
- [ ] Falls eingebaut: automatischer Test mit echter Shell und Terminal-Abbild (Teststelle 2), der prüft, dass nach dem Start und nach einem Verkleinern und Vergrössern die letzten Verlaufszeilen und die Trennlinie noch über dem Prompt stehen; Kern- bzw. Renderer-Tests angepasst.
- [ ] Ein ausbleibende Antwort auf die Cursor-Abfrage lässt den Start nicht hängen (Zeitlimit oder Rückfall auf das heutige Verhalten).
- [ ] Typecheck, alle Tests, Build und `npm run test:shells` grün.

## Abnahme von Hand

- [ ] Befehle ausführen, THub schliessen und neu starten: Der alte Inhalt steht ausgegraut direkt über dem neuen Prompt, ohne Scrollen.
- [ ] Danach das Fenster verkleinern, vergrössern und maximieren: Der alte Inhalt bleibt lesbar und wird nicht überschrieben.
