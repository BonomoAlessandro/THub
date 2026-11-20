# 01 – Workspace-Kern mit Tests

Status: `erledigt` (2026-11-19, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: –
User Stories: Grundlage für alle; teilweise 56
Spezifikation: „Architektur im Überblick“ (inklusive Vertrag zwischen Renderer und Kern), „Gespeicherter Zustand (Schema Version 2)“, „Testentscheidungen“ (guter Test, Teststelle 1)

## Was gebaut wird

Das Fundament für alles Weitere. Für den Nutzer ändert sich nichts: Die bestehende Oberfläche mit der Seitenleiste funktioniert wie vorher, spricht aber mit dem neuen Kern.

- **Workspace-Kern:** Die Tab-Logik wandert aus den IPC-Handlern des Hauptprozesses und aus dem Renderer in einen eigenen Kern mit den fünf Ports aus der Spezifikation: Terminal-Backend, Speicher, Uhr, Prozess-Sonde, System. Im Kern heisst eine „Session“ ab jetzt **Tab**; eine „Claude-Session“ ist nur noch das, was Claude Code darunter versteht.
- **Neuer IPC-Vertrag**, auf den die alte Oberfläche schon umgestellt wird:
  - Der Renderer bekommt einen Schnappschuss und danach Änderungsereignisse.
  - Er meldet pro Tab „Ansicht bereit“ mit Spalten und Zeilen.
  - Der Kern erteilt die Startaufträge erst danach. Der Renderer startet keine Shells mehr selbst.
- **Schema Version 2** mit Übernahme aus Version 1 nach der Tabelle in der Spezifikation (Shell-Abbildung, Standardordner = Benutzerordner wird leer). Felder, die erst spätere Tickets nutzen, dürfen optional sein.
- **Eigener Datenordner für die Entwicklung:** Unpaketiert verwendet THub „THub-dev“ statt „THub“.
- **Vitest** als Testlauf und das Test-Gerüst für Teststelle 1: alle Ports nachgemacht, Hilfe zum Simulieren eines Neustarts, Tests in Temp-Ordnern ohne geerbte `THUB_*`-Variablen.

## Akzeptanzkriterien

- [x] `npm test` startet Vitest; der Typecheck bleibt grün.
- [x] Der Kern lässt sich in Node ohne Electron erzeugen, mit nachgemachtem Terminal-Backend (zeichnet Startaufträge auf, nimmt rohe Ausgabestücke und Prozessende entgegen), Speicher im Arbeitsspeicher, steuerbarer Uhr, steuerbarer Prozess-Sonde und nachgemachtem System.
- [x] Kern-Tests:
  - Tab anlegen, umbenennen (leere Namen werden ignoriert), aktivieren, schliessen; nach dem Schliessen wird der Nachbar aktiv.
  - Ein Startauftrag wird erst nach „Ansicht bereit“ erteilt, mit der gemeldeten Grösse.
  - Nach einem Neustart sind Tabs, Reihenfolge und aktiver Tab wieder da.
  - Rückfall auf Standardordner bzw. Benutzerordner, wenn der Ordner eines Tabs fehlt.
- [x] Übernahme aus Version 1 mit Tests: Sessions werden zu Tabs, Namen bleiben, `settings.shell` wird nach der Tabelle abgebildet, Standardordner gleich Benutzerordner wird leer.
- [x] Eine kaputte Zustandsdatei wird weiterhin beiseitegelegt statt überschrieben.
- [x] `npm start` verwendet den Datenordner „THub-dev“.

## Abnahme von Hand

- [ ] `npm start`: Terminals öffnen, umbenennen, schliessen, App beenden und neu starten. Alles verhält sich wie vor dem Umbau.
- [ ] Eine vorhandene Zustandsdatei aus Version 0.1.0 wird beim ersten Start übernommen (dazu einmal in den Entwicklungs-Datenordner kopieren).

## Hinweise

- Bestehende Bausteine (entprelltes, atomares Speichern; geordnetes Beenden der Shells) werden zu den Ports „Speicher“ und „Terminal-Backend“ ausgebaut, nicht neu geschrieben.
- Das Test-Gerüst setzt den Stil für alle späteren Tests: Es wird nur äusseres Verhalten über die Schnittstelle des Kerns geprüft.
