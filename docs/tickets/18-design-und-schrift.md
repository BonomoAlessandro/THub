# 18 – Design-Wahl und Schriftgrösse

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 05
User Stories: 74, 75 (Design, Schriftgrösse), 76, 77
Spezifikation: „Gespeicherter Zustand“ (Einstellungen), „Oberfläche (Renderer)“ (Design, Tastenkürzel)

## Was gebaut wird

- Neues Feld **„Design“** im Einstellungsdialog: System (Standard), Hell oder Dunkel. Die Wahl gilt sofort für Oberfläche, Terminalfläche und Fensterknöpfe. Bei „System“ folgt THub weiter live der Windows-Einstellung.
- Neues Feld **„Schriftgrösse im Terminal“** (8 bis 32) im Einstellungsdialog.
- **Tastenkürzel** für die Schriftgrösse, für alle Tabs zugleich:
  - `Ctrl` + Mausrad, `Ctrl` `+` / `Ctrl` `-`, `Ctrl` `0` setzt zurück.
  - `+` und `-` werden über das erzeugte Zeichen erkannt, nicht über die Tastenposition: Schweizer Tastatur (`+` auf Shift+1) und Ziffernblock funktionieren.
  - Der eingebaute Zoom von Chromium und die Zoom-Kürzel des Entwicklermenüs sind abgeschaltet.
  - Nach einer Änderung passen die Terminals Spalten und Zeilen an, und die Shells erfahren die neue Grösse.
- Beide Einstellungen überstehen einen Neustart.

## Akzeptanzkriterien

- [ ] Kern-Tests: Design und Schriftgrösse werden gespeichert und überstehen einen Neustart; die Schriftgrösse bleibt zwischen 8 und 32.
- [ ] Die Tastenkürzel erreichen die Shell nicht. `Ctrl` + Mausrad scrollt nicht gleichzeitig den Terminal-Inhalt und zoomt nicht die ganze Oberfläche.

## Abnahme von Hand

- [ ] Umschalten zwischen System, Hell und Dunkel wirkt sofort ohne Neustart; bei „System“ zieht ein Wechsel in Windows sofort mit.
- [ ] Auf einer Schweizer Tastatur funktionieren `Ctrl` `+` (Shift+1), `Ctrl` `-` und die Ziffernblock-Tasten.
- [ ] Nach einer Grössenänderung laufen Claude und andere Vollbild-Programme ohne Darstellungsfehler weiter.
