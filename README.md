# TermHub

Desktop-App für Windows: mehrere benannte Terminal-Sessions in einem Fenster, die beim nächsten Start automatisch wieder geöffnet werden.

> Stand: Grundgerüst. Die Details werden noch ausspezifiziert (siehe „Offene Punkte“).

## Stack

| Teil | Technik |
|---|---|
| App-Hülle | [Electron](https://www.electronjs.org/) |
| Oberfläche | [React](https://react.dev/) mit TypeScript, normales CSS mit Design-Variablen (hell/dunkel) |
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

Unpaketiert (`npm start`, `npm run dev`) verwendet TermHub den Datenordner `%APPDATA%\TermHub-dev` und berührt die installierte App (`%APPDATA%\TermHub`) nicht. Die Einzelinstanz-Sperre hängt am Datenordner: Die Entwicklungsversion läuft neben einer installierten TermHub, aber nur einmal.

## Aufbau

```
src/
  shared/types.ts           Vertrag Renderer ↔ Kern: Schnappschuss, Änderungsereignisse, Befehle, IPC-Kanäle
  main/main.ts              Electron-Hauptprozess: Einzelinstanz, Fenster, IPC ↔ Workspace-Kern, geordnetes Beenden
  main/workspace/
    workspace.ts            Workspace-Kern: die gesamte Tab-Logik, ohne Electron
    ports.ts                Ports des Kerns: Terminal-Backend, Speicher, Uhr, Prozess-Sonde, System
    schema.ts               Gespeicherter Zustand (Version 2) und Übernahme aus Version 1
    windowPlacement.ts      Wo das Fenster beim Start öffnet (gespeichert, zentriert oder maximiert)
  main/ptyManager.ts        Terminal-Backend: startet/beendet die Shells über node-pty (eine pro Tab)
  main/store.ts             Speicher: entprelltes, atomares Schreiben nach state.json
  main/system.ts            Uhr, System und (vorerst leere) Prozess-Sonde für den Betrieb
  main/shells.ts            Feste Shell-Liste (pwsh, powershell, cmd), bis die Shell-Erkennung kommt
  preload/preload.ts        Stellt dem Renderer die API `window.termhub` bereit
  renderer/                 React-Oberfläche: zeigt an und schickt Befehle, die Tab-Logik liegt im Kern
    main.tsx                Einstieg; übernimmt das Design von Windows (hell/dunkel)
    App.tsx                 Fenster: Tab-Leiste und Terminal-Fläche, Tastenkürzel
    useWorkspace.ts         Schnappschuss und Ereignisse des Kerns
    shortcuts.ts            Zuordnung der Tastenkürzel (alles andere geht ans Terminal)
    tabs/                   Tab-Leiste: Tabs, Symbol-Platz, Umbenennen, Tooltip, Überlauf
    terminal/               Ein xterm.js pro Tab, inaktive ausgeblendet; meldet „Ansicht bereit“
    styles/tokens.css       Design-Variablen und Terminal-Farbschemata aus dem Prototyp
    styles/app.css
test/
  support/                  Test-Gerüst: nachgemachte Ports, simulierter Neustart, Temp-Ordner
  workspace/                Kern-Tests (Teststelle 1)
  renderer/                 Zuordnung der Tastenkürzel
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
  "closedTabs": [],
  "window": { "bounds": { "x": 200, "y": 100, "width": 1200, "height": 760 }, "maximized": false }
}
```

## Was das Grundgerüst kann

- Mehrere Terminals (PowerShell) als Tabs in einer Tab-Leiste oben; neue Tabs erscheinen rechts neben dem aktiven
- Bei vielen Tabs werden die Tabs schmaler und die Leiste scrollbar (auch mit dem Mausrad)
- Tooltip mit Name, Ordner und Shell; Schliessen mit `×` oder der mittleren Maustaste
- Tabs umbenennen (Doppelklick auf den Tab oder `F2`; Enter übernimmt, Escape bricht ab)
- Beim Beenden werden alle Tabs gespeichert und beim nächsten Start in ihrem Verzeichnis neu gestartet; der zuletzt aktive Tab wird wieder angezeigt
- Hell oder dunkel nach dem Design von Windows beim Start, auch die Terminalfläche
- Der Standardordner lässt sich vorübergehend nicht einstellen; er kommt mit dem Einstellungsdialog zurück
- Beendete Shell (z.B. `exit`): Hinweis im Terminal, beliebige Taste startet sie neu
- Kopieren/Einfügen: Rechtsklick (mit Auswahl kopieren, sonst einfügen), `Ctrl+Shift+C` / `Ctrl+Shift+V`
- Das Fenster öffnet mit gespeicherter Grösse, Position und Maximiert-Zustand; beim allerersten Start maximiert. Liegt es ausserhalb aller Bildschirme (etwa nach dem Abziehen eines Monitors), öffnet es zentriert auf dem Hauptbildschirm.
- Nur eine Instanz: Ein zweiter Start holt das bestehende Fenster nach vorne, auch aus minimiertem Zustand, und beendet sich sofort.

### Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `Ctrl+Shift+T` | Neues Terminal |
| `Ctrl+Shift+W` | Aktiven Tab schliessen |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Nächster / vorheriger Tab |
| `Ctrl+PageDown` / `Ctrl+PageUp` | Nächster / vorheriger Tab |
| `Ctrl+1` … `Ctrl+9` | Zum n-ten Tab springen |
| `F2` | Aktiven Tab umbenennen |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Kopieren / Einfügen |

`Ctrl+K` und alle anderen Tasten gehen unverändert an die Shell.

## Offene Punkte (zum Ausspezifizieren)

- **Was heisst „wiederherstellen“?** Aktuell: neue Shell im *Startverzeichnis* der Session. Nicht erhalten bleiben: der Inhalt/Scrollback, laufende Programme und ein später per `cd` gewechseltes Verzeichnis.
- **Shell-Auswahl:** fest `powershell.exe` (in `state.json` änderbar). PowerShell 7, cmd, Git Bash, WSL? Pro Session wählbar?
- **Default-Verzeichnis:** global für alle; pro Session überschreibbar? Was passiert mit bestehenden Sessions, wenn es geändert wird?
- **Schliessen:** ohne Rückfrage. Bestätigung, wenn noch ein Programm läuft?
- **Darstellung:** Sidebar vs. Tabs oben, Reihenfolge per Drag & Drop, Gruppen, Farben/Icons, Theme, Schriftgrösse
- **Fenster:** mehrere Fenster, Split-Ansicht (mehrere Terminals nebeneinander)
- **Installation/Updates:** Installer (NSIS) für den eigenen Benutzer, Auto-Update, Autostart, Code-Signing
