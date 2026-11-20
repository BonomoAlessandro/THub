# 19 – README und Abschluss-Prüfung auf einem frischen Rechner

Status: `in Arbeit` · Typ: HITL
Blockiert durch: alle anderen Tickets
User Stories: 37, 39, sowie alle als Abnahme
Spezifikation: „Weitere Hinweise“

## Was gebaut wird

- **README neu schreiben:**
  - Funktionen von THub 2, Bedienung und Tastenkürzel;
  - Aufbau: Workspace-Kern, Ports, lokale Schnittstelle, Shell-Integration und Starter, Renderer;
  - Tests: beide Testläufe, und warum sie keine laufende Instanz ansprechen;
  - Entwicklung inklusive eigenem Datenordner.
  - Die „Offenen Punkte“ verschwinden. Bekannte Grenzen (cmd nur am Zeilenanfang, kein Claude in WSL, kein Claude über den vollen Pfad) und was bewusst nicht dabei ist, stehen als kurzer Abschnitt mit Verweis auf die Spezifikation.
- **Installer bauen** und auf einem **zweiten Rechner** oder unter einem frischen Windows-Benutzer ohne THub-Daten prüfen.

## Akzeptanzkriterien

- [ ] Das README ist aktuell und beschreibt das tatsächliche Verhalten.

## Abnahme von Hand

- [ ] Die Prüflisten „Abnahme von Hand“ aller Tickets 01 bis 18 sind durchgeklickt; Abweichungen sind als neue Tickets erfasst.

- [ ] Auf dem frischen Rechner bzw. Benutzer, mit installiertem Claude Code:
  - Installation ohne Einrichtung oder Rückfrage, die Claude betrifft;
  - die erkannten Shells stimmen, PowerShell 7 ist Standard, falls vorhanden;
  - `claude` in einem Tab → die Status-Symbole funktionieren;
  - `~/.claude/settings.json` ist unverändert;
  - nach einem Neustart des Rechners ist alles wieder da: normale Tabs mit Verlauf im letzten Ordner, der aktive Claude-Tab läuft weiter, die anderen sind pausiert.
- [ ] Windows PowerShell 5.1: Fenstergrösse mehrmals ändern, dann tippen. Im Versuch zu Ticket 21 blieb die Shell einmal ohne Ausgabe hängen; falls es sich bestätigt, als Ticket erfassen.
- [ ] Ohne installiertes Claude Code funktioniert THub als normales Terminal-Fenster, ohne Fehlermeldungen beim Start.
- [ ] Hinter einem Firmen-Proxy (falls vorhanden) funktionieren Status und Fortsetzen.
- [ ] Ob die helle Terminalfläche mit Claude gut aussieht, ist entschieden und in der Spezifikation vermerkt.
- [ ] Gefundene Fehler sind als neue Tickets erfasst.
