# 27 – Offene Punkte nur, wenn es wirklich welche gibt; Klick schliesst den Hinweis

Status: `erledigt` (2026-11-20, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: –
Herkunft: Abnahme von Hand (Ticket 19), „Offene Punkte“ und „Nachrichten“ in [docs/abnahme.md](../abnahme.md)
Spezifikation: „Offene Punkte aus Claudes Antworten“ (ändert Entscheidungen aus Ticket 22)

## Was gebaut wird

Heute erscheint fast nach jedem Prompt ein Hinweis „Offene Punkte“. Gedacht war er für den Fall, dass Claude wirklich etwas Offenes hat, das nicht übersehen werden soll. Claude soll nicht bei jeder Antwort etwas finden oder erfinden.

- **Strengere Anweisung an Claude** (Antwort auf `SessionStart`). Neuer Wortlaut, in der Spezifikation festhalten:

  > Hinweis von THub: Nur wenn du für den nächsten Schritt eine Entscheidung, Antwort oder Handlung des Nutzers brauchst, die du nicht selbst treffen oder erledigen kannst, schreibe sie am Ende der Antwort unter der Überschrift ‚Offene Punkte‘ als kurze Aufzählung, ein Punkt pro Zeile. Das ist die Ausnahme: Die meisten Antworten haben keine offenen Punkte, dann lass den Abschnitt weg. Keine Angebote für weitere Arbeit, keine Vorschläge, keine Zusammenfassung und nichts erfinden, nur um den Abschnitt zu füllen.

- **Nur noch der ausdrückliche Abschnitt zählt.**
  - Die Regel „endet der letzte Absatz mit einer Frage, gilt sie als offener Punkt“ fällt weg; Angebote wie „Soll ich auch noch …?“ lösten sie oft aus.
  - Eine Überschrift ohne Aufzählung darunter ergibt keinen Hinweis mehr.
  - Die übrigen Erkennungsregeln (Varianten der Überschrift, Code-Blöcke, Unterpunkte) bleiben.
- **Ein Klick auf den Hinweis schliesst ihn.** Er springt wie bisher in den Tab und verschwindet dabei; `×` schliesst ihn ohne Sprung. Das blosse Anzeigen des Tabs lässt ihn weiterhin stehen, und er übersteht weiterhin einen Neustart.

## Akzeptanzkriterien

- [x] Kern-Tests mit echten HTTP-Hook-Ereignissen:
  - `/hooks/SessionStart` liefert den neuen Wortlaut (bei eingeschalteter Einstellung);
  - `Stop` mit Schlussfrage ohne Abschnitt ergibt keinen Hinweis;
  - mit Abschnitt ergibt er wie bisher genau die Punkte;
  - ein Klick auf den Hinweis aktiviert den Tab und entfernt den Hinweis, auch aus dem gespeicherten Zustand;
  - das Anzeigen des Tabs allein lässt ihn stehen.
- [x] Die Tests der Erkennung sind an die neuen Regeln angepasst; Beispiele mit Schlussfrage stehen ausdrücklich als „kein Hinweis“ drin.
- [x] README und Spezifikation beschreiben das neue Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Nach einigen normalen Prompts in Claude (nach `/clear` oder in einer neuen Session, damit der neue Wortlaut gilt) erscheinen nur noch selten Hinweise, und nur bei echten Rückfragen.
- [ ] Ein Klick auf einen Hinweis „Offene Punkte“ öffnet den Tab und schliesst den Hinweis.
