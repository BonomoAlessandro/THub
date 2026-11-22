# 29 – Eigenes App-Symbol

Status: `offen` · Typ: HITL
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-22: THub zeigt bisher überall das Standardsymbol von Electron, weil weder electron-builder noch das Fenster ein eigenes Symbol bekommen.
Spezifikation: „App-Symbol“ (neu), dazu User Stories 90 und 91, „Oberfläche (Renderer)“ (Look), „Ausserhalb des Umfangs“

## Ablauf

1. **Entwürfe (mit dir):** Der Agent legt im Prototyp drei bis vier Entwürfe mit unterschiedlichen Motiven vor. Du wählst einen oder gibst Rückmeldung; er passt an, bis du einen Entwurf freigibst.
2. **Einbau (allein):** Danach baut der Agent das freigegebene Symbol ohne weitere Rückfragen ein und trägt die Entscheidungen in der Spezifikation nach.

## Was gebaut wird

- **Entwürfe im Prototyp:** eine eigene Seite (`prototype/icon.html`), lokal im Browser zu öffnen. Sie zeigt jeden Entwurf
  - in den Grössen 16, 24, 32, 48 und 256 px,
  - in einer nachgestellten Taskleiste von Windows 11, hell und dunkel, neben einigen typischen anderen Symbolen,
  - als Kachel wie in `Alt+Tab` und im Startmenü.
- **Vorgaben für die Gestaltung** (aus der Spezifikation):
  - passt zum Look von THub (Stil wie Warp, Linear oder Raycast);
  - ab 16 px lesbar, die kleinen Grössen von Hand nachgezogen statt nur verkleinert;
  - auf heller und dunkler Taskleiste gut erkennbar;
  - keine fremden Marken, auch nicht der Claude-Stern von den Tabs.
  - Ob das Symbol eine eigene Farbe bekommt, entscheidest du bei der Wahl; die Regel „keine Akzentfarbe“ gilt für die Oberfläche, nicht zwingend für das Symbol.
- **Dateien:** das freigegebene Symbol als SVG-Quelle im Repository, daraus eine `.ico` mit 16, 20, 24, 32, 40, 48, 64 und 256 px (und bei Bedarf eine PNG für das Fenster). Ein Skript im Repository erzeugt die `.ico` aus der Quelle neu; wo die Dateien liegen und wie man sie erzeugt, steht in `docs/entwicklung.md`.
- **Einbau:**
  - electron-builder bekommt das Symbol für `THub.exe` (und damit Taskleiste, `Alt+Tab`, Startmenü, Desktop-Verknüpfung), für Installer und Deinstaller und für den Eintrag unter „Installierte Apps“.
  - Das Fenster bekommt das Symbol über die Option `icon` von `BrowserWindow`, damit auch `npm start` nicht das Electron-Symbol zeigt.
- **Doku:** Spezifikation (Motiv, Farben, Grössen, Dateien) und `docs/entwicklung.md`.

## Akzeptanzkriterien

- [ ] `prototype/icon.html` lässt sich lokal im Browser öffnen und zeigt alle Entwürfe in allen oben genannten Ansichten, hell und dunkel.
- [ ] Ein Test liest die erzeugte `.ico` und findet genau die acht Grössen 16, 20, 24, 32, 40, 48, 64 und 256 px.
- [ ] Das Skript erzeugt die `.ico` aus der SVG-Quelle neu.
- [ ] Das Symbol, das Windows aus `release\win-unpacked\THub.exe` ausliest (etwa mit `[System.Drawing.Icon]::ExtractAssociatedIcon` in PowerShell, ohne die App zu starten), ist das neue und nicht das von Electron.
- [ ] `npm run dist` läuft durch und erzeugt den Installer mit dem neuen Symbol (nicht ausführen).
- [ ] Spezifikation und `docs/entwicklung.md` beschreiben Symbol, Dateien und das Erzeugen.
- [ ] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Du hast einen Entwurf freigegeben.
- [ ] Nach der Installation zeigen Installer, Taskleiste, `Alt+Tab`, Startmenü, Desktop-Verknüpfung und „Installierte Apps“ das neue Symbol, auf heller und auf dunkler Taskleiste.
- [ ] Ein an die Taskleiste angeheftetes THub zeigt das neue Symbol. Bleibt das alte stehen, THub lösen und neu anheften; das alte Symbol kommt dann aus dem Symbol-Zwischenspeicher von Windows, nicht aus THub.
- [ ] In 16 px (Taskleiste bei 100 % Skalierung) ist das Motiv noch zu erkennen.

## Hinweise

- Der Agent startet die App für die Prüfungen wie immer nur im Testmodus und installiert nichts. Wie das Symbol in der echten Taskleiste aussieht, zeigt sich erst bei der Abnahme von Hand.
- Ausserhalb dieses Tickets: ein Symbol in der Titelleiste von THub selbst und Status-Overlays am Taskleisten-Symbol (siehe User Story 55).
