# Tickets für THub 2

Die Tickets zerlegen die [Spezifikation](../specs/termhub-v2.md) in Abschnitte, die sich einzeln umsetzen lassen. Jedes Ticket ist ein durchgehender Schnitt (Kern, Oberfläche, Tests) und lässt sich für sich prüfen.

## Spielregeln

- **AFK** (Status `ready-for-agent`): Ein Agent setzt das Ticket allein um.
  - Er erfüllt die Abschnitte **„Akzeptanzkriterien“**, die alle automatisch oder am Code prüfbar sind, und liefert einen lauffähigen Stand: `npm start`, bei Bedarf ein gebautes Paket.
  - Für den Abschnitt **„Abnahme von Hand“** liefert er eine kurze Prüfliste. Die Abnahme machst du **gesammelt am Schluss** (Ticket 19), nicht nach jedem Ticket. Bis dahin gilt ein Ticket als erledigt, wenn die automatischen Kriterien erfüllt sind und der Stand auf `main` ist.
  - Agenten installieren den Installer nicht über eine bestehende THub-Installation. Zum Prüfen dient das ungepackte Paket (`release/win-unpacked`) bzw. `npm start` mit eigenem Entwicklungs-Datenordner.
- **Der Desktop des Nutzers ist tabu:** Agenten senden keine echten Maus- oder Tastatureingaben, holen keine Fenster in den Vordergrund und ändern keine Systemeinstellungen (auch nicht vorübergehend, etwa das Windows-Design). Geprüft wird über Tests, die Entwicklerwerkzeuge der App (Chrome DevTools Protocol), Fenster-Nachrichten ohne Fokuswechsel (z.B. `WM_NCHITTEST`) und Screenshots per `PrintWindow`. Was sich nur mit echter Bedienung prüfen lässt, kommt in die Prüfliste „Abnahme von Hand“.
- **Debug-Ports:** Für die Entwicklerwerkzeuge der App (`--remote-debugging-port`) immer einen zufälligen hohen Port verwenden, nie 9222 oder 9333; auf dem Rechner laufen andere Werkzeuge, die diese Ports nutzen. Nur mit Seiten der eigenen App verbinden.
- **HITL** (Status `ready-for-human`): Das Ticket braucht dich laufend, zum Beispiel für Rückmeldungen.
- Begriffe wie „Workspace-Kern“, „Port“, „Starter“, „Claude-Zuordnung“ oder „Einfrieren“ sind in der Spezifikation erklärt. Vor jedem Ticket die dort genannten Abschnitte lesen.

## Übersicht

| Nr. | Ticket | Typ | Blockiert durch | Stand |
|---|---|---|---|---|
| 01 | [Workspace-Kern mit Tests](01-workspace-kern-mit-tests.md) | AFK | – | erledigt |
| 02 | [Klickbarer Design-Prototyp](02-design-prototyp.md) | HITL | – | erledigt |
| 03 | [React-Oberfläche mit Tab-Leiste](03-react-tab-leiste.md) | AFK | 01, 02 | erledigt |
| 04 | [Titelleiste und Design hell/dunkel](04-titelleiste-design.md) | AFK | 03 | erledigt |
| 05 | [Ordner, Tab-Namen und Einstellungsdialog](05-ordner-und-einstellungen.md) | AFK | 04 | offen |
| 06 | [Shells erkennen und pro Tab wählen](06-shells.md) | AFK | 05 | offen |
| 07 | [Shell-Integration: Profil, aktueller Ordner, Startbefehl](07-shell-integration.md) | AFK | 06 | offen |
| 08 | [Verlauf normaler Tabs sichern und wiederherstellen](08-verlauf.md) | AFK | 03 | erledigt |
| 09 | [Fenster merken und nur eine Instanz](09-fenster-und-einzelinstanz.md) | AFK | 01 | erledigt |
| 10 | [Lokale Schnittstelle, Hook-Datei und Claude-Zuordnung](10-schnittstelle-und-zuordnung.md) | AFK | 01, 09 | erledigt |
| 11 | [Starter und `claude`-Ersatz](11-starter-und-ersatz.md) | AFK | 07, 10 | offen |
| 12 | [Claude-Sessions nach einem Neustart fortsetzen](12-claude-fortsetzen.md) | AFK | 08, 11 | offen |
| 13 | [Claude-Status und Prozess-Status am Tab](13-status-am-tab.md) | AFK | 11 | offen |
| 14 | [Hinweise im Fenster](14-hinweise.md) | AFK | 13 | offen |
| 15 | [Tabs schliessen mit Rückfrage und wieder öffnen](15-schliessen-und-wiederoeffnen.md) | AFK | 12, 13 | offen |
| 16 | [Rechtsklick-Menü und Umsortieren per Ziehen](16-rechtsklick-und-ziehen.md) | AFK | 15 | offen |
| 17 | [Befehlspalette](17-befehlspalette.md) | AFK | 15 | offen |
| 18 | [Design-Wahl und Schriftgrösse](18-design-und-schrift.md) | AFK | 05 | offen |
| 19 | [README und Abschluss-Prüfung auf einem frischen Rechner](19-readme-und-abschluss.md) | HITL | alle | offen |
| 20 | [Umbenennen in THub](20-umbenennen-thub.md) | AFK | 04, 08 | in Arbeit |

```mermaid
flowchart LR
  T01[01 Kern + Tests] --> T03[03 React + Tabs]
  T02[02 Prototyp] --> T03
  T01 --> T09[09 Fenster + Einzelinstanz]
  T03 --> T04[04 Titelleiste + Design]
  T03 --> T08[08 Verlauf]
  T04 --> T05[05 Ordner + Einstellungen]
  T05 --> T06[06 Shells]
  T05 --> T18[18 Design-Wahl + Schrift]
  T06 --> T07[07 Shell-Integration]
  T01 --> T10[10 Schnittstelle + Zuordnung]
  T09 --> T10
  T07 --> T11[11 Starter + Ersatz]
  T10 --> T11
  T08 --> T12[12 Claude fortsetzen]
  T11 --> T12
  T11 --> T13[13 Status am Tab]
  T13 --> T14[14 Hinweise]
  T12 --> T15[15 Schliessen + Wiederöffnen]
  T13 --> T15
  T15 --> T16[16 Rechtsklick + Ziehen]
  T15 --> T17[17 Befehlspalette]
  T14 --> T19[19 README + Abschluss]
  T16 --> T19
  T17 --> T19
  T18 --> T19
  T04 --> T20[20 Umbenennen in THub]
  T08 --> T20
```

**Parallel möglich:**
- 01 und 02 zu Beginn
- 08, 09 und 10 neben der Strecke 04 → 07
- 18, sobald 05 fertig ist
- 12 und 13
- 14 neben 15, danach 16 und 17

Tickets, die gleichzeitig am Workspace-Kern arbeiten, sollten nacheinander zusammengeführt werden.
