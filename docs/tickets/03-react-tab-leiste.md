# 03 – React-Oberfläche mit Tab-Leiste

Status: `erledigt` (2026-11-19, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 01, 02
User Stories: 10, 14, 15, 17, 18, 19, 72, 73
Spezifikation: „Oberfläche (Renderer)“ (Bestandteile, Tastenkürzel), „Tab-Namen“ (Umbenennen), „Architektur im Überblick“ (Vertrag zwischen Renderer und Kern)

## Was gebaut wird

Die Oberfläche wird mit **React und TypeScript** neu gebaut. Die Seitenleiste wird durch eine **Tab-Leiste oben** ersetzt, gestaltet wie im Prototyp. Die eigene Titelleiste und das Design-System folgen in Ticket 04; bis dahin sitzt die Tab-Leiste unter dem normalen Windows-Rahmen.

- Tabs anzeigen, anklicken, mit `×` schliessen, per Doppelklick oder `F2` inline umbenennen; Tooltip mit vollem Namen, aktuellem Ordner und Shell.
- Bei vielen Tabs werden die Tabs schmaler und die Leiste scrollbar.
- `+` öffnet ein neues Terminal; das Pfeil-Menü kommt in Ticket 05.
- Neue Tabs erscheinen **rechts neben dem aktiven Tab**; diese Regel steht im Kern.
- Ein xterm.js pro Tab. Inaktive Terminals werden ausgeblendet, nicht zerstört. Jede Ansicht meldet dem Kern „bereit“ mit ihrer Grösse.
- Alle bestehenden Tastenkürzel funktionieren weiter, `Ctrl+K` wird nicht abgefangen. Kopieren und Einfügen (Rechtsklick, `Ctrl+Shift+C/V`) bleibt, ebenso „beliebige Taste startet die beendete Shell neu“.

## Akzeptanzkriterien

- [x] Der Renderer ist eine React-Anwendung, gebündelt mit esbuild; `npm start`, `npm run dev`, `npm run dist` und der Typecheck funktionieren.
- [x] Kern-Test: Ein neuer Tab wird rechts neben dem aktiven eingefügt, und die Reihenfolge übersteht einen Neustart.
- [x] Die Seitenleiste ist entfernt. Die Einstellung des Standardordners fehlt vorübergehend; sie kommt in Ticket 05 zurück.
- [x] Alle heute vorhandenen Tastenkürzel aus der Spezifikation funktionieren. `Ctrl+K` erreicht die Shell.

Nachtrag:
- Seit Ticket 26 erscheinen neue Tabs am Ende der Leiste statt rechts neben dem aktiven; das Kriterium galt bis dahin.

## Abnahme von Hand

- [ ] Tab-Leiste sieht aus wie im Prototyp; Überlauf mit 20 Tabs funktioniert.
- [ ] Umbenennen per Doppelklick und `F2`: Enter übernimmt, Escape bricht ab, der Fokus geht danach zurück ins Terminal.
- [ ] `exit` in einer Shell, danach eine Taste → die Shell startet neu.
