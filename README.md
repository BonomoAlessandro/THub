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
npm run dist       # Installer bauen -> release\TermHub Setup <version>.exe
```

## Aufbau

```
src/
  shared/types.ts         Datentypen (Session, Settings, gespeicherter Zustand) und IPC-Kanalnamen
  main/main.ts            Electron-Hauptprozess: Fenster, IPC-Handler, geordnetes Beenden
  main/store.ts           Zustand im Speicher + entprelltes, atomares Speichern nach state.json
  main/ptyManager.ts      Startet/beendet die Shell-Prozesse (eine pro Session)
  preload/preload.ts      Stellt dem Renderer die API `window.termhub` bereit
  renderer/index.html     Fenster-Layout: Sidebar mit Sessions + Terminal-Bereich
  renderer/renderer.ts    UI-Logik: Sessions anlegen/wechseln/umbenennen/schliessen, Tastenkürzel
  renderer/terminalView.ts  Ein xterm.js-Terminal, gekoppelt an eine Session
  renderer/styles.css
build.mjs                 esbuild-Skript, schreibt nach dist/
```

Der Hauptprozess ist die einzige Quelle der Wahrheit für den Zustand; der Renderer ändert ihn nur über IPC.
Gespeichert wird in `%APPDATA%\TermHub\state.json`:

```json
{
  "version": 1,
  "settings": { "defaultCwd": "C:\\Users\\…", "shell": "powershell.exe" },
  "sessions": [{ "id": "…", "name": "Mein Projekt", "cwd": "C:\\…" }],
  "activeSessionId": "…"
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
