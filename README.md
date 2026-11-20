# THub

THub ist ein Terminal-Fenster für Windows mit Tabs. Es merkt sich alle Terminals über jeden Neustart hinweg und versteht [Claude Code](https://claude.com/claude-code): Am Tab siehst du, ob Claude gerade arbeitet, auf dich wartet oder fertig ist, und nach einem Neustart geht die Claude-Session im selben Tab weiter. Ohne Claude Code ist THub ein schlichtes Terminal-Fenster mit Tabs.

## Was THub kann

- **Mehrere Terminals in einem Fenster.** PowerShell 7, Windows PowerShell, Eingabeaufforderung (cmd), Git Bash und WSL; THub erkennt selbst, was installiert ist.
- **Alles kommt zurück.** Beim nächsten Start sind alle Tabs wieder da, mit Namen, Shell und dem zuletzt benutzten Ordner. Der frühere Inhalt steht ausgegraut darüber.
- **Claude Code ohne Einrichtung.** Du tippst wie gewohnt `claude`. THub erkennt die Session, zeigt ihren Status am Tab und setzt sie nach einem Neustart fort. Deine `~/.claude/settings.json` bleibt unberührt.
- **Hinweise unten rechts.** Wenn Claude in einem anderen Tab auf dich wartet oder fertig ist, und wenn eine Antwort offene Fragen an dich enthält. Ein Klick springt in den Tab.
- **Schnell bedienbar.** Tabs umbenennen, per Ziehen umsortieren, duplizieren, schliessen und wieder öffnen. Eine Befehlspalette mit Suche über alle Tabs. Ein Standardordner für neue Terminals, helles und dunkles Design.

## Installieren

THub läuft unter Windows 10 und 11 (64 Bit). Claude Code ist optional.

Den Installer baust du selbst; dafür brauchst du [Node.js](https://nodejs.org/) (getestet mit Version 24) und Git:

```powershell
git clone https://github.com/BonomoAlessandro/THub.git
cd THub
npm install
npm run dist
```

Danach liegt der Installer unter `release\THub Setup <Version>.exe`. Er ist nicht signiert; Windows zeigt deshalb beim ersten Start eine SmartScreen-Warnung („Weitere Informationen“ → „Trotzdem ausführen“). Für den eigenen Benutzer braucht die Installation keine Administratorrechte.

## Verwenden

1. **Terminal öffnen:** `+` öffnet ein Terminal im Standardordner. Der Pfeil daneben bietet die anderen Shells und die zuletzt benutzten Ordner an.
2. **Tabs ordnen:** Ein Doppelklick oder `F2` benennt einen Tab um, ein Rechtsklick öffnet sein Menü (Duplizieren, Ordner im Explorer öffnen, Pfad kopieren, Schliessen), und mit der Maus lässt er sich an eine andere Stelle ziehen.
3. **Einstellen:** Das Zahnrad oben rechts öffnet die Einstellungen: Standardordner, Standard-Shell, Design, Schriftgrösse und Hinweise.
4. **Claude starten:** In einem Tab `claude` tippen. Am Tab zeigt dann ein Symbol, was los ist:

   | Symbol | Bedeutung |
   |---|---|
   | violetter Stern, dreht sich | Claude arbeitet |
   | oranger Punkt mit Ring | Claude wartet auf dich, etwa auf eine Freigabe |
   | blauer Punkt | im Tab laufen noch Prozesse, etwa ein Dev-Server |
   | grüner Punkt | Claude ist fertig geworden, während du woanders warst |
   | graues Pause-Symbol | die Session wird beim Öffnen des Tabs fortgesetzt |

5. **Einfach schliessen:** Fenster zu, Rechner aus. Beim nächsten Start ist alles wieder da: Der zuletzt aktive Claude-Tab läuft gleich weiter, die anderen beim ersten Anklicken.

### Die wichtigsten Tastenkürzel

| Kürzel | Wirkung |
|---|---|
| `Ctrl+Shift+T` | neues Terminal |
| `Ctrl+Shift+W` | Tab schliessen (fragt nur nach, wenn noch etwas läuft) |
| `Ctrl+Shift+Z` | zuletzt geschlossenen Tab wieder öffnen |
| `Ctrl+Tab`, `Ctrl+1` … `9` | Tab wechseln |
| `Ctrl+Shift+P` | Befehlspalette |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | kopieren / einfügen (oder Rechtsklick ins Terminal) |
| `Ctrl` + Klick | Link im Browser öffnen |

Alle Kürzel zeigt THub selbst an: Befehlspalette → „Tastenkürzel anzeigen“.

## Mehr dazu

- [Handbuch](docs/handbuch.md): die ganze Bedienung, alle Tastenkürzel, wie THub mit Claude Code zusammenarbeitet, bekannte Grenzen
- [Aufbau und Entwicklung](docs/entwicklung.md): Architektur, Tests, Entwicklung und Testmodus
- [Spezifikation](docs/specs/termhub-v2.md) und [Tickets](docs/tickets/README.md)

## Entwickeln

```powershell
npm install
npm start              # bauen und starten (eigener Datenordner, berührt eine installierte THub nicht)
npm test               # Unit- und Kern-Tests
npm run test:shells    # Tests mit den echten Shells
```

Details in [docs/entwicklung.md](docs/entwicklung.md).
