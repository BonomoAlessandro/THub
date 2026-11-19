# 06 – Shells erkennen und pro Tab wählen

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 05
User Stories: 6–9, 75 (Standard-Shell)
Spezifikation: „Shell-Erkennung“, „Gespeicherter Zustand“ (Übernahme aus Version 1)

## Was gebaut wird

- **Shell-Erkennung** im Hauptprozess:
  - erkannt werden PowerShell 7, Windows PowerShell, cmd, Git Bash (Standard-Installationsort und Registry) und jede installierte WSL-Distribution;
  - Distributionen `docker-desktop*` werden ausgeblendet;
  - stabile Kennungen `pwsh`, `powershell`, `cmd`, `gitbash`, `wsl:<Distribution>`.
- **Standard-Shell:** PowerShell 7, falls vorhanden, sonst Windows PowerShell. Neues Feld „Standard-Shell“ im Einstellungsdialog.
- **Pfeil-Menü:** listet zusätzlich die erkannten Shells; ein Klick öffnet einen Tab mit dieser Shell im Standardordner.
- **Pro Tab:** Der Tab speichert seine Shell-Kennung und startet nach einem Neustart wieder mit ihr. Fehlt die Shell, fällt er auf die Standard-Shell zurück und zeigt einen Hinweis im Terminal.
- **WSL-Tabs** starten mit `wsl.exe -d <Distribution> --cd <Windows-Pfad>`.

## Akzeptanzkriterien

- [ ] Der Kern bekommt die Liste der erkannten Shells übergeben. Kern-Tests mit verschiedenen Listen:
  - Wahl der Standard-Shell mit und ohne PowerShell 7;
  - ein Tab behält seine Shell über einen Neustart;
  - Rückfall bei fehlender Shell inklusive Hinweis;
  - der Startauftrag enthält Programm und Argumente der gewählten Shell;
  - ein WSL-Tab startet mit `--cd` und dem Ordner.
- [ ] Die in Ticket 01 übernommenen Shell-Kennungen aus Version 1 passen zu den erkannten Kennungen.

## Abnahme von Hand

- [ ] Auf diesem Rechner erscheinen PowerShell 7, Windows PowerShell, cmd, Git Bash und WSL (Ubuntu) im Menü, `docker-desktop` nicht. Alle starten im richtigen Ordner.
- [ ] Einen Git-Bash-Tab anlegen, TermHub neu starten → wieder Git Bash.

## Hinweise

- Die Erkennung selbst hängt von der Maschine ab und wird von Hand geprüft. Automatisch getestet wird, wie der Kern mit der erkannten Liste umgeht.
