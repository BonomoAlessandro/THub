# 20 – Umbenennen in THub

Status: `erledigt` (2026-11-19, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 04, 08 (nur, um Konflikte mit laufenden Branches zu vermeiden)
User Stories: –
Spezifikation: Hinweis „Name“ am Anfang

## Was gebaut wird

Die App heisst ab jetzt **THub** statt „TermHub“, durchgehend:

- **Sichtbar:** Produktname, Fenstertitel, Texte in der Oberfläche, Name des Installers und der Verknüpfungen, README.
- **App-Kennung und Paket:** `appId` auf `ch.custom.thub`, npm-Paketname `thub`. Eine bereits installierte TermHub 0.1.0 bleibt dadurch eine eigene Installation und kann deinstalliert werden.
- **Datenordner:** `%APPDATA%\THub`, in der Entwicklung `%APPDATA%\THub-dev`. **Einmalige Übernahme:** Gibt es beim Start noch keine Zustandsdatei im THub-Ordner, aber eine in `%APPDATA%\TermHub` bzw. `%APPDATA%\TermHub-dev`, wird sie (samt Verlaufsdateien) kopiert und danach normal verwendet. Der alte Ordner bleibt unangetastet.
- **Technische Namen:** Umgebungsvariablen `THUB_TAB_ID`, `THUB_API`, `THUB_TOKEN` (statt `TERMHUB_*`; geerbte `TERMHUB_*` und `THUB_*` werden beide entfernt), Kopfzeilen der Hooks `X-THub-Tab` und `X-THub-Token`, die Vorlage `spikes/claude-hooks/empfohlene-hook-datei.json` passend dazu, Bezeichner im Code (zum Beispiel die Preload-API).
- Der Ordner des Repositorys (`termhub`) bleibt; ihn umzubenennen ist eine Entscheidung des Nutzers ausserhalb dieses Tickets.

## Akzeptanzkriterien

- [ ] Im Quellcode, in Tests, im README und in der Paket-Konfiguration kommt „TermHub“ bzw. `TERMHUB` nur noch dort vor, wo bewusst der alte Name gemeint ist (Übernahme der alten Daten, Entfernen alter Umgebungsvariablen).
- [ ] Kern- bzw. Adapter-Test: Übernahme aus dem alten Datenordner, wenn der neue leer ist; keine Übernahme, wenn der neue schon eine Zustandsdatei hat.
- [ ] Typecheck, alle Tests und der Build laufen; `npm run dist` erzeugt „THub Setup <Version>.exe“ (nicht ausführen).

## Abnahme von Hand

- [ ] Fenstertitel und Taskleiste zeigen „THub“.
- [ ] Eine vorhandene TermHub-Entwicklungsinstallation (`%APPDATA%\TermHub-dev`) wird beim ersten Start übernommen: Tabs sind wieder da.
