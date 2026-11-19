# TermHub

Desktop-App für Windows: mehrere benannte Terminal-Sessions in einem Fenster, die beim nächsten Start automatisch wieder geöffnet werden.

> Stand: Grundgerüst. Die Details werden noch ausspezifiziert (siehe „Offene Punkte“).

## Stack

| Teil | Technik |
|---|---|
| App-Hülle | [Electron](https://www.electronjs.org/) |
| Terminal-Darstellung | [xterm.js](https://xtermjs.org/) (`@xterm/xterm`, `@xterm/addon-fit`) |
| Shell-Prozesse | [node-pty](https://github.com/microsoft/node-pty) über Windows ConPTY |
| Build | esbuild (Bundling), TypeScript (nur Typecheck), electron-builder (NSIS-Installer) |

## Entwicklung

```powershell
npm install
npm start          # bauen + App starten
npm run dev        # wie start, mit Sourcemaps und unminifiziert
npm run typecheck  # TypeScript prüfen
npm test           # Kern-Tests mit Vitest
npm run dist       # Installer bauen -> release\TermHub Setup <version>.exe
```

Unpaketiert (`npm start`, `npm run dev`) verwendet TermHub den Datenordner `%APPDATA%\TermHub-dev` und berührt die installierte App (`%APPDATA%\TermHub`) nicht.

## Aufbau

```
src/
  shared/types.ts           Vertrag Renderer ↔ Kern: Schnappschuss, Änderungsereignisse, Befehle, IPC-Kanäle
  main/main.ts              Electron-Hauptprozess: Fenster, IPC ↔ Workspace-Kern, geordnetes Beenden
  main/workspace/
    workspace.ts            Workspace-Kern: die gesamte Tab-Logik, ohne Electron
    ports.ts                Ports des Kerns: Terminal-Backend, Speicher, Uhr, Prozess-Sonde, System
    schema.ts               Gespeicherter Zustand (Version 2) und Übernahme aus Version 1
  main/ptyManager.ts        Terminal-Backend: startet/beendet die Shells über node-pty (eine pro Tab)
  main/store.ts             Speicher: entprelltes, atomares Schreiben nach state.json
  main/system.ts            Uhr, System und (vorerst leere) Prozess-Sonde für den Betrieb
  main/shells.ts            Feste Shell-Liste (pwsh, powershell, cmd), bis die Shell-Erkennung kommt
  preload/preload.ts        Stellt dem Renderer die API `window.termhub` bereit
  renderer/index.html       Fenster-Layout: Sidebar mit Tabs + Terminal-Bereich
  renderer/renderer.ts      Anzeige: Schnappschuss und Ereignisse des Kerns, Befehle, Tastenkürzel
  renderer/terminalView.ts  Ein xterm.js-Terminal pro Tab, meldet „Ansicht bereit“
  renderer/styles.css
test/
  support/                  Test-Gerüst: nachgemachte Ports, simulierter Neustart, Temp-Ordner
  workspace/                Kern-Tests (Teststelle 1)
build.mjs                   esbuild-Skript, schreibt nach dist/
```

Der Hauptprozess ist die einzige Quelle der Wahrheit für den Zustand. Der Workspace-Kern besitzt die Tab-Logik: Der Renderer bekommt einen Schnappschuss und danach Änderungsereignisse und schickt nur Befehle. Shells startet nur der Kern, und zwar erst, wenn der Renderer die Ansicht des Tabs mit Spalten und Zeilen als bereit gemeldet hat.

Gespeichert wird in `%APPDATA%\TermHub\state.json`, im Schema Version 2. Eine Datei der Version 1 wird beim Start übernommen, eine unlesbare als `state.json.corrupt-<Zeit>` beiseitegelegt.

```json
{
  "version": 2,
  "settings": { "defaultCwd": "", "theme": "system", "fontSize": 14, "notifications": true },
  "tabs": [
    { "id": "…", "name": "Mein Projekt", "nameIsManual": true, "shellId": "powershell", "startCwd": "C:\\…" }
  ],
  "activeTabId": "…",
  "recentDirs": [],
  "closedTabs": []
}
```

## Was das Grundgerüst kann

- Mehrere Terminals (PowerShell) öffnen, in der Sidebar auflisten und zwischen ihnen wechseln
- Sessions umbenennen (Doppelklick auf den Namen oder `F2`)
- Beim Beenden werden alle Sessions gespeichert und beim nächsten Start in ihrem Verzeichnis neu gestartet; die zuletzt aktive Session wird wieder angezeigt
- Standardverzeichnis unten in der Sidebar wählbar; neue Terminals starten dort
- Beendete Shell (z.B. `exit`): Hinweis im Terminal, beliebige Taste startet sie neu
- Kopieren/Einfügen: Rechtsklick (mit Auswahl kopieren, sonst einfügen), `Ctrl+Shift+C` / `Ctrl+Shift+V`

### Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `Ctrl+Shift+T` | Neues Terminal |
| `Ctrl+Shift+W` | Aktive Session schliessen |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Nächste / vorherige Session |
| `Ctrl+PageDown` / `Ctrl+PageUp` | Nächste / vorherige Session |
| `Ctrl+1` … `Ctrl+9` | Zur n-ten Session springen |
| `F2` | Aktive Session umbenennen |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Kopieren / Einfügen |

## Offene Punkte (zum Ausspezifizieren)

- **Was heisst „wiederherstellen“?** Aktuell: neue Shell im *Startverzeichnis* der Session. Nicht erhalten bleiben: der Inhalt/Scrollback, laufende Programme und ein später per `cd` gewechseltes Verzeichnis.
- **Shell-Auswahl:** fest `powershell.exe` (in `state.json` änderbar). PowerShell 7, cmd, Git Bash, WSL? Pro Session wählbar?
- **Default-Verzeichnis:** global für alle; pro Session überschreibbar? Was passiert mit bestehenden Sessions, wenn es geändert wird?
- **Schliessen:** ohne Rückfrage. Bestätigung, wenn noch ein Programm läuft?
- **Darstellung:** Sidebar vs. Tabs oben, Reihenfolge per Drag & Drop, Gruppen, Farben/Icons, Theme, Schriftgrösse
- **Fenster:** Grösse/Position merken, mehrere Fenster, Split-Ansicht (mehrere Terminals nebeneinander)
- **Installation/Updates:** Installer (NSIS) für den eigenen Benutzer, Auto-Update, Autostart, Code-Signing
