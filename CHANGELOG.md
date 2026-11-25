# Änderungen

Was sich in jeder Version von THub geändert hat, neueste zuerst. Die Nummern in Klammern verweisen auf die Tickets in [docs/tickets](docs/tickets/README.md). Wie Versionen vergeben werden, steht in [docs/entwicklung.md](docs/entwicklung.md#version-und-installer). Welche Version installiert ist, zeigt THub unten in den Einstellungen.

## Unveröffentlicht

**Korrigiert**

- Die Hinweise halten zur Eingabe denselben Abstand wie zum rechten Fensterrand. In Claude-Tabs verdecken sie Statuszeile und Modus unter dem Eingabefeld nicht mehr und springen nicht mehr hin und her, wenn sich die Statuszeile ändert oder ein Hinweis dazukommt. (35)

## 0.3.0 – 2026-11-24

**Neu**

- `Ctrl+C` kopiert, wenn im Terminal etwas markiert ist, sonst bricht es ab wie bisher. `Ctrl+V` fügt ein, auch in Claude; in PowerShell fügt bei `Ctrl+V` wie bisher PowerShell selbst ein. (34)

**Geändert**

- Die Versionszeile in den Einstellungen zeigt nur noch die Version, ohne Commit. (30)
- Die Hinweise unten rechts verdecken nicht mehr, was man tippt: Steht die Eingabe unten, rücken sie darüber. (32)
- Der Countdown der „fertig“-Hinweise läuft, solange THub sichtbar ist, auch wenn ein anderes Programm den Fokus hat. (33)

## 0.2.0 – 2026-11-22

Erste Version mit Versionsnummer: THub 2 laut Spezifikation, Stand aller Tickets 01 bis 31. Davor hiess jeder Installer „0.1.0“, die Nummer des alten Grundgerüsts „TermHub“. Bis THub fertig ist, bleibt die erste Stelle 0.

**Neu**

- Tabs in einer eigenen Titelleiste: umbenennen, per Ziehen umsortieren, Rechtsklick-Menü, schliessen mit Rückfrage und wieder öffnen; `+` mit Pfeil-Menü für Shell und Ordner. (03, 04, 05, 15, 16)
- Shells werden erkannt (PowerShell 7, Windows PowerShell, cmd, Git Bash, WSL), mit Shell-Integration: Profil, aktueller Ordner, Startbefehl. (06, 07)
- Nach einem Neustart ist alles wieder da: Tabs, Ordner, Verlauf und Fenster; THub läuft nur einmal. (08, 09)
- Claude Code ohne Einrichtung: Erkennung über den `claude`-Ersatz und Hooks, Status am Tab, Fortsetzen nach einem Neustart. (10, 11, 12, 13)
- Hinweise unten rechts, auch für offene Punkte aus Claudes Antworten. (14, 22)
- Befehlspalette, Design hell/dunkel, Schriftgrösse. (17, 18)
- Der Name ist THub statt TermHub. (20)
- Rechner wach halten, mit den Stufen „nur Rechner“ und „Rechner und Bildschirm“. Scheitert es, schaltet THub es wieder aus und zeigt einen Fehler-Hinweis. (28, 31)
- Eigenes App-Symbol: zwei gestapelte Terminals in Graphit. (29)
- Versionsnummer unten in den Einstellungen, „Version kopieren“ für Fehlermeldungen, dieser Changelog. (30)

**Korrigiert**

- Fortsetzen ohne Starter endet nicht mehr in einer Endlosschleife. (23)
- PowerShell: flüssige Pfeiltasten, keine Befehlsvorschau. (24)
- Links und Rechtsklick im Terminal. (25)
- Tab-Leiste, neue Tabs am Ende, Farbe des Claude-Sterns und Auswahlliste im dunklen Design. (26)
- Offene Punkte nur, wenn es wirklich welche gibt; ein Klick schliesst den Hinweis. (27)
