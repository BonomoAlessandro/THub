# 25 – Links und Rechtsklick im Terminal

Status: `in Arbeit` · Typ: AFK
Blockiert durch: –
Herkunft: Abnahme von Hand (Ticket 19), „Links in Claude“ und „Kopieren mit rechter Maustaste“ in [docs/abnahme.md](../abnahme.md)
Spezifikation: „Oberfläche (Renderer)“, Kopieren und Einfügen

## Was gebaut wird

- **Links ohne gestrichelte Linie.** Claude gibt URLs als OSC-8-Links aus (etwa `http://localhost:3100/#/search-input`). xterm.js unterstreicht sie gestrichelt. Diese Linie fällt weg. Beim Überfahren zeigt eine durchgezogene Unterstreichung mit Hand-Zeiger, dass sich der Link öffnen lässt.
- **Ctrl+Klick öffnet einen Link im Standardbrowser**, wie im Windows Terminal. Das gilt für OSC-8-Links und für erkannte URLs im Klartext (etwa die Adresse eines Dev-Servers); für Letztere das offizielle xterm-Addon für Web-Links, passend zu xterm.js 6.
  - Nur `http:` und `https:`.
  - Ohne Ctrl passiert nichts, damit beim Markieren nichts aus Versehen aufgeht.
  - Keine Rückfrage per `window.confirm`.
  - Der Hauptprozess prüft die Adresse und öffnet sie mit `shell.openExternal`. Im Testmodus öffnet er nichts und schreibt die Adresse nur in die Ausgabe.
- **Rechtsklick fügt in Claude nur einmal ein.** Heute fügt ein Rechtsklick in einem Claude-Tab den Text doppelt ein, in einer normalen Shell einmal.
  - Vermutete Ursache: Claude schaltet die Mausmeldung ein (DECSET 1000/1002/1006). Dann geht der Rechtsklick als Mausereignis an Claude, das selbst einfügt, und THub fügt zusätzlich ein.
  - Die Ursache zuerst belegen, etwa am installierten `claude` oder mit einem Stub, der die Mausmeldung einschaltet und die empfangenen Bytes protokolliert, dann beheben.
  - Naheliegende Regel wie im Windows Terminal: Hat das Programm die Mausmeldung eingeschaltet, gehört der Rechtsklick dem Programm. Mit gedrückter Shift-Taste kopiert bzw. fügt THub trotzdem ein.

## Akzeptanzkriterien

- [ ] Für OSC-8-Links rendert keine gestrichelte Unterstreichung mehr (Test am DOM oder an der Konfiguration von xterm.js).
- [ ] Ctrl+Klick auf einen http(s)-Link ruft das Öffnen im Hauptprozess genau einmal auf; ohne Ctrl, oder bei `file:`, `javascript:` und Ähnlichem, nicht. Getestet mit einem gefälschten `shell.openExternal`.
- [ ] Die Ursache des doppelten Einfügens ist belegt. Ein Test zeigt, dass ein Rechtsklick bei eingeschalteter Mausmeldung genau einmal einfügt und ohne Mausmeldung wie bisher kopiert bzw. einfügt.
- [ ] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Claude gibt eine URL aus → keine gestrichelte Linie; Ctrl+Klick öffnet sie im Browser, ein normaler Klick nicht.
- [ ] Eine Dev-Server-Adresse in einer normalen Shell → Ctrl+Klick öffnet sie.
- [ ] Rechtsklick in Claude fügt die Zwischenablage genau einmal ein; in PowerShell und cmd verhält sich der Rechtsklick wie bisher.
