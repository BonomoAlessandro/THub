# 23 – Fortsetzen ohne Starter endet nicht in einer Endlosschleife

Status: `erledigt` (2026-11-20, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: –
User Stories: 28, 60, 63
Spezifikation: „Wiederherstellen“ und die Abschnitte zu Starter und Ausführungsrichtlinie

Beim Lesen des Codes für das README (Ticket 19) gefunden; ein Sonderfall.

## Problem

Ein erfasster Claude-Tab wird nach einem Neustart fortgesetzt, aber der Starter läuft diesmal nicht. Das passiert, wenn
- eine Gruppenrichtlinie (AllSigned/Restricted) erst nach dem Erfassen dazugekommen ist und THub deshalb `THUB_STARTER` weglässt,
- `starter.ps1` fehlt oder
- die lokale Schnittstelle nicht starten konnte.

Dann führt der Startbefehl `claude --resume <Kennung>` direkt aus (`resume.ts:31-47`), ohne Hooks und ohne Ende-Meldung des Starters. Folgen:
- Nach `/exit` bleibt der Tab ein Claude-Tab, bis die Shell endet (`claudeExit` kommt nie).
- Weil `hadPrompt` gesetzt bleibt, setzt THub dieselbe Session **bei jedem weiteren Neustart wieder fort**.

## Was gebaut wird

Kommt nach einem von THub abgesetzten Fortsetzen innerhalb einer grosszügigen Frist (Vorschlag: 30 s, über die Uhr des Kerns) keine Meldung `/claude/launch` des Starters für diesen Tab, schliesst der Kern daraus, dass Claude ohne Erfassung läuft:
- Die Claude-Zuordnung des Tabs fällt weg. Der Tab ist ein normales Terminal, wie bei einem `claude`, das ohne Starter getippt wurde. Die Session läuft in der Shell ungestört weiter.
- Beim nächsten Neustart wird nichts fortgesetzt.
- Kommt die Meldung später doch noch (sehr langsames Profil), stellt sie die Zuordnung wie üblich wieder her (`linkAfterLaunch`).
- Die Frist beginnt erst, wenn THub den Startbefehl zum Fortsetzen tatsächlich absetzt: beim zuletzt aktiven Claude-Tab gleich beim Start, bei einem pausierten Tab erst, wenn er geöffnet wird. Ein pausierter, nie geöffneter Tab behält seine Zuordnung.

## Akzeptanzkriterien

- [ ] Kern-Tests mit der falschen Uhr:
  - Fortsetzen ohne Start-Meldung → nach der Frist keine Claude-Zuordnung mehr, nach einem Neustart kein Fortsetzen;
  - Start-Meldung innerhalb der Frist → nichts ändert sich;
  - Start-Meldung erst nach der Frist → die Zuordnung ist wieder da;
  - Beenden oder Einfrieren während der Frist → kein Effekt;
  - ein pausierter Tab startet die Frist erst beim Öffnen.
- [ ] Bestehende Tests zum Fortsetzen (`resume.test.ts`, Shell-Tests) bleiben grün.

## Abnahme von Hand

- [ ] Unter einer Ausführungsrichtlinie AllSigned (z.B. auf einem Testbenutzer): Claude-Tab erfassen, Richtlinie setzen, THub neu starten → die Session läuft weiter; nach `/exit` und einem weiteren Neustart wird sie nicht wieder fortgesetzt.
