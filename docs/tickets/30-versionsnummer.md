# 30 – Versionsnummer

Status: `erledigt` (2026-11-22, Version 0.2.0, Tag `v0.2.0`; Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-22. Jeder Installer heisst bisher „THub Setup 0.1.0.exe“, und nirgends ist zu sehen, welcher Stand installiert ist. Fehler, die der Nutzer meldet, lassen sich so keinem Stand zuordnen.
Spezifikation: „Versionsnummer“ (neu), dazu User Stories 92 und 93

## Was gebaut wird

- **Eine Quelle:** `version` in `package.json`. Daraus kommen der Name des Installers, die Dateieigenschaften von `THub.exe` (Datei- und Produktversion) und die Version unter „Installierte Apps“; das erledigt electron-builder.
- **Schema:** `Haupt.Neben.Korrektur` (Semantic Versioning).
  - Der erste Installer mit diesem Ticket ist **0.2.0**. Ursprünglich war 0.2.0 geplant („THub 2“); der Nutzer wollte am 2026-11-22 noch eine 0.x-Version, mindestens 0.0.2. 0.0.2 selbst wäre niedriger als die installierte 0.1.0, deshalb 0.2.0.
  - Solange THub in Entwicklung ist, bleibt die erste Stelle 0: neue Funktionen erhöhen die zweite Stelle (0.3.0), reine Korrekturen die dritte (0.2.1). 1.0.0 erst, wenn der Nutzer THub für fertig erklärt.
- **Anzeige im Einstellungsdialog:** eine gedämpfte Zeile unten, etwa „THub 0.2.0 · e8e865a“.
  - Dahinter steht der Commit, aus dem gebaut wurde (kurze Kennung). `build.mjs` setzt ihn beim Bauen ein. War der Arbeitsstand beim Bauen nicht sauber, steht „+ Änderungen“ dahinter. Ohne Git fehlt die Kennung, der Build scheitert nicht.
  - Unpaketiert (`npm start`, `npm run dev`) steht zusätzlich „Entwicklung“.
  - Ein Klick kopiert die Zeile in die Zwischenablage, Tooltip „Version kopieren“, zum Einfügen in eine Fehlermeldung. Im Testmodus in die eigene Zwischenablage, nicht in die echte.
- **Befehlspalette:** „Version kopieren“ mit derselben Wirkung.
- **`CHANGELOG.md`** im Repository: je Version das Datum und in wenigen Zeilen, was neu ist und was korrigiert wurde, mit den Ticketnummern. Der erste Eintrag ist 0.2.0 mit dem Stand aller Tickets 01 bis 31 (Ticket 31 wurde vorher umgesetzt).
- **Ablauf, wenn ein Agent einen Installer für den Nutzer baut** (neue Spielregel in `docs/tickets/README.md` und Abschnitt in `docs/entwicklung.md`):
  1. Hat sich seit dem letzten Installer etwas an der App geändert, Version nach dem Schema erhöhen und `CHANGELOG.md` ergänzen.
  2. Committen; der Arbeitsstand ist danach sauber.
  3. Tag `v<Version>` auf diesen Commit setzen.
  4. Erst dann `npm run dist`, damit der Installer genau diesem Commit entspricht.
  5. Gepusht werden Commit und Tag zusammen, wenn der Nutzer pushen lässt.
- **Doku:** Spezifikation, `docs/entwicklung.md` (Version, Ablauf, Tag), Spielregeln, Handbuch (wo die Version steht), README (kurzer Hinweis).

## Akzeptanzkriterien

- [x] Ein Test prüft die Zeile im Einstellungsdialog aus Version, Commit, „+ Änderungen“ und „Entwicklung“ (reine Funktion ohne DOM), auch ohne Commit.
- [x] Ein Test prüft, dass „Version kopieren“ in der Palette dasselbe kopiert wie der Klick auf die Zeile.
- [x] In der App im Testmodus (CDP auf der eigenen Seite): Der Einstellungsdialog zeigt „THub 0.2.0“, die Kennung von `git rev-parse --short HEAD` und „Entwicklung“; ein Klick legt die Zeile in die Zwischenablage des Testmodus.
- [x] `npm run dist` erzeugt „THub Setup 0.2.0.exe“ (nicht ausführen). Datei- und Produktversion von `release\win-unpacked\THub.exe` sind 0.2.0 (`(Get-Item …).VersionInfo` in PowerShell).
- [x] `CHANGELOG.md` mit dem Eintrag 0.2.0; Tag `v0.2.0` auf dem Commit, aus dem der Installer gebaut ist.
- [x] Spezifikation, `docs/entwicklung.md`, Spielregeln, Handbuch und README beschreiben Version und Ablauf.
- [x] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] Nach der Installation zeigt der Einstellungsdialog „THub 0.2.0“ mit Kennung, ohne „Entwicklung“; ein Klick kopiert die Zeile.
- [ ] Unter „Installierte Apps“ steht THub mit der Version 0.2.0.
- [ ] Ein Installer mit höherer Version installiert sich über 0.2.0, ohne dass Tabs, Einstellungen oder Claude-Sessions verloren gehen.

## Hinweise

- Ausserhalb dieses Tickets: Auto-Update und eine Prüfung auf neue Versionen (bleiben ausserhalb, siehe Spezifikation), eine eigene Seite „Über THub“.
- Die App-Kennung `ch.custom.thub` bleibt; nur so ersetzt ein neuer Installer die bestehende Installation, statt eine zweite anzulegen.

## Hinweise aus der Umsetzung

- Version und Herkunft: `build.mjs` setzt Commit und „+ Änderungen“ als `__THUB_BUILD__` ein (`src/main/buildInfo.ts`), der Hauptprozess gibt sie mit `app.getVersion()` und `app.isPackaged` über `IPC.appInfo` weiter (`loadAppInfo` im Preload). Die Zeile baut `versionLabel` (`src/renderer/version.ts`), kopiert wird mit `copyVersion` (`commands.ts`) aus Einstellungen und Palette. `package.json` und `package-lock.json` auf 0.2.0.
- Tests: `test/renderer/version.test.ts` (Zeile mit und ohne Commit, „+ Änderungen“, „Entwicklung“), `test/renderer/paletteCommands.test.ts` („Version kopieren“ kopiert dieselbe Zeile wie `copyVersion`, das der Klick auf die Zeile aufruft).
- Geprüft in der App im Testmodus über CDP (7 Prüfungen), einmal aus dem sauberen Commit 15682fe (noch mit 2.0.0: „THub 2.0.0 · 15682fe · Entwicklung“) und nach dem Wechsel auf 0.2.0 mit Änderungen, die noch nicht committet waren („THub 0.2.0 · 15682fe + Änderungen · Entwicklung“): Commit gleich `git rev-parse --short HEAD`, Tooltip, Klick kopiert in die Zwischenablage des Testmodus mit kurzer Rückmeldung, „Version kopieren“ in der Palette kopiert dasselbe. Bildschirmfoto der Zeile im Dialog.
- Probe-Installer aus dem sauberen Commit 15682fe, noch mit 2.0.0: Name `THub Setup 2.0.0.exe`, `THub.exe` mit Dateiversion 2.0.0 und Produktversion 2.0.0.0 (Windows ergänzt die vierte Stelle). Dieser Probe-Installer wurde gelöscht. Der Installer für den Nutzer entsteht aus dem Merge-Commit mit Tag `v0.2.0` und heisst `THub Setup 0.2.0.exe`.
- **Version 0.2.0 statt 2.0.0:** Der Nutzer wollte am 2026-11-22 noch eine 0.x-Version, mindestens 0.0.2. 0.0.2 selbst wäre niedriger als die installierte 0.1.0; ein Installer mit niedrigerer Version über einer höheren ist zu vermeiden. Deshalb 0.2.0, die nächste Nebenversion nach 0.1.0.
