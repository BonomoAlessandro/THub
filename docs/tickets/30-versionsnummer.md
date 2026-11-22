# 30 – Versionsnummer

Status: `offen` · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-22. Jeder Installer heisst bisher „THub Setup 0.1.0.exe“, und nirgends ist zu sehen, welcher Stand installiert ist. Fehler, die der Nutzer meldet, lassen sich so keinem Stand zuordnen.
Spezifikation: „Versionsnummer“ (neu), dazu User Stories 92 und 93

## Was gebaut wird

- **Eine Quelle:** `version` in `package.json`. Daraus kommen der Name des Installers, die Dateieigenschaften von `THub.exe` (Datei- und Produktversion) und die Version unter „Installierte Apps“; das erledigt electron-builder.
- **Schema:** `Haupt.Neben.Korrektur` (Semantic Versioning).
  - Der erste Installer mit diesem Ticket ist **2.0.0**: Die Spezifikation heisst „THub 2“, und 0.1.0 war das alte Grundgerüst.
  - Neue Funktionen erhöhen die zweite Stelle (2.1.0), reine Korrekturen die dritte (2.0.1). Die erste Stelle nur bei einem grossen Umbau wie „THub 2“.
- **Anzeige im Einstellungsdialog:** eine gedämpfte Zeile unten, etwa „THub 2.0.0 · e8e865a“.
  - Dahinter steht der Commit, aus dem gebaut wurde (kurze Kennung). `build.mjs` setzt ihn beim Bauen ein. War der Arbeitsstand beim Bauen nicht sauber, steht „+ Änderungen“ dahinter. Ohne Git fehlt die Kennung, der Build scheitert nicht.
  - Unpaketiert (`npm start`, `npm run dev`) steht zusätzlich „Entwicklung“.
  - Ein Klick kopiert die Zeile in die Zwischenablage, Tooltip „Version kopieren“, zum Einfügen in eine Fehlermeldung. Im Testmodus in die eigene Zwischenablage, nicht in die echte.
- **Befehlspalette:** „Version kopieren“ mit derselben Wirkung.
- **`CHANGELOG.md`** im Repository: je Version das Datum und in wenigen Zeilen, was neu ist und was korrigiert wurde, mit den Ticketnummern. Der erste Eintrag ist 2.0.0 mit dem Stand aller Tickets 01 bis 30.
- **Ablauf, wenn ein Agent einen Installer für den Nutzer baut** (neue Spielregel in `docs/tickets/README.md` und Abschnitt in `docs/entwicklung.md`):
  1. Hat sich seit dem letzten Installer etwas an der App geändert, Version nach dem Schema erhöhen und `CHANGELOG.md` ergänzen.
  2. Committen; der Arbeitsstand ist danach sauber.
  3. Tag `v<Version>` auf diesen Commit setzen.
  4. Erst dann `npm run dist`, damit der Installer genau diesem Commit entspricht.
  5. Gepusht werden Commit und Tag zusammen, wenn der Nutzer pushen lässt.
- **Doku:** Spezifikation, `docs/entwicklung.md` (Version, Ablauf, Tag), Spielregeln, Handbuch (wo die Version steht), README (kurzer Hinweis).

## Akzeptanzkriterien

- [ ] Ein Test prüft die Zeile im Einstellungsdialog aus Version, Commit, „+ Änderungen“ und „Entwicklung“ (reine Funktion ohne DOM), auch ohne Commit.
- [ ] Ein Test prüft, dass „Version kopieren“ in der Palette dasselbe kopiert wie der Klick auf die Zeile.
- [ ] In der App im Testmodus (CDP auf der eigenen Seite): Der Einstellungsdialog zeigt „THub 2.0.0“, die Kennung von `git rev-parse --short HEAD` und „Entwicklung“; ein Klick legt die Zeile in die Zwischenablage des Testmodus.
- [ ] `npm run dist` erzeugt „THub Setup 2.0.0.exe“ (nicht ausführen). Datei- und Produktversion von `release\win-unpacked\THub.exe` sind 2.0.0 (`(Get-Item …).VersionInfo` in PowerShell).
- [ ] `CHANGELOG.md` mit dem Eintrag 2.0.0; Tag `v2.0.0` auf dem Commit, aus dem der Installer gebaut ist.
- [ ] Spezifikation, `docs/entwicklung.md`, Spielregeln, Handbuch und README beschreiben Version und Ablauf.
- [ ] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] Nach der Installation zeigt der Einstellungsdialog „THub 2.0.0“ mit Kennung, ohne „Entwicklung“; ein Klick kopiert die Zeile.
- [ ] Unter „Installierte Apps“ steht THub mit der Version 2.0.0.
- [ ] Ein Installer mit höherer Version installiert sich über 2.0.0, ohne dass Tabs, Einstellungen oder Claude-Sessions verloren gehen.

## Hinweise

- Ausserhalb dieses Tickets: Auto-Update und eine Prüfung auf neue Versionen (bleiben ausserhalb, siehe Spezifikation), eine eigene Seite „Über THub“.
- Die App-Kennung `ch.custom.thub` bleibt; nur so ersetzt ein neuer Installer die bestehende Installation, statt eine zweite anzulegen.
