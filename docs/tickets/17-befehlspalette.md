# 17 – Befehlspalette

Status: `in Arbeit` · Typ: AFK
Blockiert durch: 15
User Stories: 70, 71, 72, 83
Spezifikation: „Oberfläche (Renderer)“, Tastenkürzel

## Was gebaut wird

- **`Ctrl+Shift+P`** öffnet die Befehlspalette wie im Prototyp. `Ctrl+K` bleibt unangetastet.
- **Unscharfe Suche** über:
  - **Tabs:** Tippen eines Namens springt zum Tab; angezeigt werden Name, Ordner und Status-Symbol.
  - **Befehle:** Neues Terminal, Neues Terminal in … (zuletzt benutzte Ordner und Ordner wählen), Umbenennen, Schliessen, Andere Tabs schliessen, Zuletzt geschlossen (die Liste aus Ticket 15), Einstellungen, Standardordner ändern.
- **Keine Claude-Befehle.**
- **Übersicht der Tastenkürzel:** neuer Befehl „Tastenkürzel anzeigen“ in der Palette und ein Link „Alle Tastenkürzel …“ im Einstellungsdialog öffnen einen Dialog im Stil der Einstellungen, gruppiert nach Tabs, Bearbeiten, Darstellung und Fenster. Kein eigenes Tastenkürzel dafür. Die Übersicht wird aus derselben Tabelle erzeugt, nach der die Tastenkürzel verarbeitet werden, damit sie nie veraltet.
- **Bedienung:** Pfeiltasten, Enter, Escape. Danach geht der Fokus zurück ins Terminal.

## Akzeptanzkriterien

- [ ] Die Übersicht der Tastenkürzel listet jedes von THub verarbeitete Kürzel genau einmal; ein Test stellt sicher, dass sie und die Verarbeitung aus derselben Tabelle kommen.
- [ ] Suche (am besten als reine Funktion getestet):
  - „termhb“ findet „termhub“, „api“ findet „api-gateway“, „neu term“ findet „Neues Terminal“;
  - bei gleich gutem Treffer stehen Tabs vor Befehlen.
- [ ] Jeder aufgeführte Befehl hat aus der Palette heraus dieselbe Wirkung wie über Maus oder Tastenkürzel, inklusive Rückfragen beim Schliessen.
- [ ] „Zuletzt geschlossen“ zeigt die Liste mit Namen und öffnet den gewählten Tab wieder.
- [ ] `Ctrl+Shift+P` wird nicht an die Shell weitergereicht; mit offener Palette erreichen Eingaben das Terminal nicht.

## Abnahme von Hand

- [ ] Mit 15 offenen Tabs per Palette zu einem Tab springen, ohne die Maus zu benutzen.
- [ ] Aussehen wie im Prototyp.
