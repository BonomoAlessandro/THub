# THub

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
npm run dist       # Installer bauen -> release\THub Setup <version>.exe
```

Unpaketiert (`npm start`, `npm run dev`) verwendet THub den Datenordner `%APPDATA%\THub-dev` und berührt die installierte App (`%APPDATA%\THub`) nicht. Die Einzelinstanz-Sperre hängt am Datenordner: Die Entwicklungsversion läuft neben einer installierten THub, aber nur einmal.

**Umstieg vom alten Namen:** Bis 2026-11-19 hiess die App „TermHub“. Hat der Datenordner von THub noch keine `state.json`, übernimmt THub beim Start einmalig `state.json` und `history\` aus `%APPDATA%\TermHub` (unpaketiert aus `%APPDATA%\TermHub-dev`); der alte Ordner bleibt unverändert. Wegen der neuen App-Kennung `ch.custom.thub` bleibt eine installierte TermHub 0.1.0 eine eigene Installation und lässt sich wie gewohnt deinstallieren.

## Aufbau

```
src/
  shared/types.ts           Vertrag Renderer ↔ Kern: Schnappschuss, Änderungsereignisse, Befehle, IPC-Kanäle
  main/main.ts              Electron-Hauptprozess: Einzelinstanz, Fenster, IPC ↔ Workspace-Kern, geordnetes Beenden
  main/workspace/
    workspace.ts            Workspace-Kern: die gesamte Tab-Logik, ohne Electron
    ports.ts                Ports des Kerns: Terminal-Backend, Speicher, Uhr, Prozess-Sonde, System
    schema.ts               Gespeicherter Zustand (Version 2) und Übernahme aus Version 1
    folders.ts              Tab-Namen nach dem Ordner und Liste der zuletzt benutzten Ordner
    windowPlacement.ts      Wo das Fenster beim Start öffnet (gespeichert, zentriert oder maximiert)
    claude.ts               Claude-Zuordnung pro Tab: Vertrag von Starter und Hooks, Regeln
  main/localApi.ts          Lokale Schnittstelle: HTTP-Server auf 127.0.0.1 für Starter und Claude-Hooks
  main/hookFile.ts          Hook-Datei für Claude Code (claude-hooks.json im Datenordner)
  main/ptyManager.ts        Terminal-Backend: startet/beendet die Shells über node-pty (eine pro Tab)
  main/shellEnv.ts          Umgebung der Shells: ohne geerbte THUB_*/TERMHUB_* und Interna des Dev-Starts
  main/store.ts             Speicher: entprelltes, atomares Schreiben nach state.json; Verlauf pro Tab unter history\
  main/dataFolder.ts        Datenordner (THub bzw. THub-dev) und einmalige Übernahme aus dem alten Ordner
  main/system.ts            Uhr, System und (vorerst leere) Prozess-Sonde für den Betrieb
  main/shells.ts            Feste Shell-Liste (pwsh, powershell, cmd), bis die Shell-Erkennung kommt
  main/theme.ts             Design hell/dunkel: folgt Windows (nativeTheme), zieht Fensterfarbe, Fensterknöpfe und Oberfläche nach
  preload/preload.ts        Stellt dem Renderer die API `window.thub` bereit
  renderer/                 React-Oberfläche: zeigt an und schickt Befehle, die Tab-Logik liegt im Kern
    main.tsx                Einstieg; übernimmt zuerst das Design (hell/dunkel), dann wird gezeichnet
    theme.ts                Design übernehmen und live wechseln, Terminal-Farbschema aus den Design-Variablen
    App.tsx                 Fenster: Tab-Leiste und Terminal-Fläche, Tastenkürzel
    useWorkspace.ts         Schnappschuss und Ereignisse des Kerns
    shortcuts.ts            Zuordnung der Tastenkürzel (alles andere geht ans Terminal)
    tabs/                   Titelleiste mit Tab-Leiste: Tabs, Symbol-Platz, Umbenennen, Tooltip, Überlauf, Zieh-Fläche,
                            Pfeil-Menü „Neues Terminal in …“
    popup/                  Menü und Dialog wie im Prototyp, Bedienung mit der Tastatur (menuKeys.ts)
    settings/               Einstellungsdialog
    terminal/               Ein xterm.js pro Tab, inaktive ausgeblendet; meldet „Ansicht bereit“;
                            Verlauf serialisieren und ausgegraut wiederherstellen (history.ts)
    styles/tokens.css       Design-Variablen und Terminal-Farbschemata aus dem Prototyp
    styles/app.css
test/
  support/                  Test-Gerüst: nachgemachte Ports, simulierter Neustart, Temp-Ordner
  workspace/                Kern-Tests (Teststelle 1)
  renderer/                 Zuordnung der Tastenkürzel und der Tasten im Menü; Verlauf mit echtem xterm.js in Node
  main/                     Hauptprozess ohne Electron: Design hell/dunkel, Datenordner und Übernahme, Umgebung der Shells
build.mjs                   esbuild-Skript, schreibt nach dist/
```

**Menüs und Dialoge über der Titelleiste:** Die Titelleiste ist die Zieh-Fläche des Fensters (`-webkit-app-region: drag`). Was darüber liegt oder hineinragt (Pfeil-Menü, Abdunkelung eines Dialogs, Tooltip), braucht `-webkit-app-region: no-drag`, sonst verschiebt ein Klick dort das Fenster. Menüs bleiben links der nativen Fensterknöpfe (`navigator.windowControlsOverlay`). Solange ein Menü oder Dialog offen ist (`usePopupOpen`), ruhen die Tastenkürzel der App.

Der Hauptprozess ist die einzige Quelle der Wahrheit für den Zustand. Der Workspace-Kern besitzt die Tab-Logik: Der Renderer bekommt einen Schnappschuss und danach Änderungsereignisse und schickt nur Befehle. Shells startet nur der Kern, und zwar erst, wenn der Renderer die Ansicht des Tabs mit Spalten und Zeilen als bereit gemeldet hat.

Gespeichert wird in `%APPDATA%\THub\state.json`, im Schema Version 2. Eine Datei der Version 1 wird beim Start übernommen, eine unlesbare als `state.json.corrupt-<Zeit>` beiseitegelegt.

```json
{
  "version": 2,
  "settings": { "defaultCwd": "", "theme": "system", "fontSize": 14, "notifications": true },
  "tabs": [
    { "id": "…", "name": "Mein Projekt", "nameIsManual": true, "shellId": "powershell", "startCwd": "C:\\…" }
  ],
  "activeTabId": "…",
  "recentDirs": ["C:\\…\\Mein Projekt"],
  "closedTabs": [],
  "window": { "bounds": { "x": 200, "y": 100, "width": 1200, "height": 760 }, "maximized": false }
}
```

Der Inhalt jedes Terminals liegt daneben in `%APPDATA%\THub\history\<Tab-Kennung>.json` (`{ "version": 1, "savedAt": …, "content": "…" }`): die letzten etwa 1000 Zeilen, serialisiert mit Farben, ohne den Bildschirm von Vollbildprogrammen wie `vim` oder `less`. Gesichert wird alle 30 Sekunden für Tabs mit neuer Ausgabe, beim Beenden (THub wartet höchstens 2 Sekunden auf den Renderer) und bei einer Windows-Abmeldung (sofort, mit dem zuletzt gesicherten Stand). Beim Schliessen eines Tabs wird seine Datei gelöscht.

## Was das Grundgerüst kann

- Mehrere Terminals (PowerShell) als Tabs in einer Tab-Leiste oben; neue Tabs erscheinen rechts neben dem aktiven
- Neue Tabs heissen wie ihr Ordner, im Benutzerordner wie der Benutzer, auf einem Laufwerk wie das Laufwerk (`D:`); bei Gleichstand mit „ 2“, „ 3“ usw. Der Name wird beim Anlegen festgelegt und ändert sich danach nicht von selbst; ein von Hand vergebener Name wird nie überschrieben. Aus Version 1 übernommene Tabs behalten ihre Namen.
- Pfeil neben `+`: „Neues Terminal in …“ mit den zuletzt benutzten Ordnern (Name, darunter der Pfad) und „Ordner wählen …“ (Ordner-Dialog von Windows). Zuletzt benutzt sind die Startordner neuer Tabs und der letzte Ordner eines Tabs beim Schliessen: höchstens acht, neueste zuerst, ohne Doppelte; angeboten werden nur Ordner, die es noch gibt. Bedienung auch mit Pfeiltasten, Enter und Escape.
- Zahnrad: Einstellungen mit dem Standardordner. „Ändern …“ öffnet den Ordner-Dialog, „Zurücksetzen“ stellt auf den Benutzerordner zurück. `+` und `Ctrl+Shift+T` öffnen neue Terminals dort; offene Tabs bleiben, wo sie sind. Escape oder „Fertig“ schliesst den Dialog, der Fokus geht zurück ins Terminal.
- Bei vielen Tabs werden die Tabs schmaler und die Leiste scrollbar (auch mit dem Mausrad)
- Tooltip mit Name, Ordner und Shell; Schliessen mit `×` oder der mittleren Maustaste
- Tabs umbenennen (Doppelklick auf den Tab oder `F2`; Enter übernimmt, Escape bricht ab)
- Beim Beenden werden alle Tabs gespeichert und beim nächsten Start in ihrem Verzeichnis neu gestartet; der zuletzt aktive Tab wird wieder angezeigt
- Eigene Titelleiste ohne Windows-Rahmen: Die Tabs sitzen direkt in der Titelleiste, rechts die nativen Fensterknöpfe mit den Andock-Layouts von Windows 11. Die freie Fläche neben den Tabs (mindestens 56 px, auch bei vielen Tabs) verschiebt das Fenster, Doppelklick maximiert.
- Der frühere Inhalt jedes Terminals steht nach einem Neustart ausgegraut über der neuen Eingabezeile, mit der Trennlinie „Wiederhergestellt · <Datum, Uhrzeit der Sicherung>“; er liegt im Scrollback, eine Mausrad-Bewegung nach oben zeigt ihn. Nach einem Absturz fehlen höchstens die letzten etwa 30 Sekunden.
- Hell oder dunkel nach dem Design von Windows, auch die Terminalfläche und die Fensterknöpfe; ein Wechsel in Windows wirkt sofort
- Beendete Shell (z.B. `exit`): Hinweis im Terminal, beliebige Taste startet sie neu
- Kopieren/Einfügen: Rechtsklick (mit Auswahl kopieren, sonst einfügen), `Ctrl+Shift+C` / `Ctrl+Shift+V`
- Das Fenster öffnet mit gespeicherter Grösse, Position und Maximiert-Zustand; beim allerersten Start maximiert. Liegt es ausserhalb aller Bildschirme (etwa nach dem Abziehen eines Monitors), öffnet es zentriert auf dem Hauptbildschirm.
- Nur eine Instanz: Ein zweiter Start holt das bestehende Fenster nach vorne, auch aus minimiertem Zustand, und beendet sich sofort.

### Lokale Schnittstelle und Claude-Zuordnung (Grundlage)

Beim Start öffnet THub einen kleinen HTTP-Server nur auf `127.0.0.1`, auf einem zufälligen freien Port und mit einem pro Start zufälligen Token. Jedes Terminal bekommt `THUB_TAB_ID`, `THUB_API` (Adresse) und `THUB_TOKEN`. Über diese Schnittstelle melden der `claude`-Starter (folgt in Ticket 11) und die Hooks von Claude Code, welche Claude-Session in welchem Tab läuft; THub merkt sich das als Claude-Zuordnung im gespeicherten Zustand (Session-Kennung, Ordner, bestätigt, hatte Prompt).

- Endpunkte: `POST /claude/launch`, `/claude/started`, `/claude/exit` und `/hooks/<Ereignis>`. Ohne gültiges Token (`X-THub-Token`) antwortet der Server mit 403. Hook-Antworten sind immer sofort leer; THub hört nur zu und beeinflusst Claude nie.
- Die Hook-Datei `claude-hooks.json` schreibt THub bei jedem Start neu in seinen Datenordner, nach der im Spike geprüften Vorlage (`spikes/claude-hooks/empfohlene-hook-datei.json`). `SessionStart` läuft über `curl.exe`, weil Claude dafür keine HTTP-Hooks kennt. Die globale Claude-Konfiguration bleibt unberührt.
- Beendet THub sich selbst (App beenden, Tab schliessen, Windows-Abmeldung), wird die Zuordnung eingefroren: Spätere Ereignisse ändern sie nicht mehr.
- Ein zweiter Start öffnet keinen Server und schreibt keine Hook-Datei.

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

- **Was heisst „wiederherstellen“?** Aktuell: neue Shell im *Startverzeichnis* der Session, darüber der frühere Inhalt ausgegraut. Nicht erhalten bleiben: laufende Programme und ein später per `cd` gewechseltes Verzeichnis.
- **Shell-Auswahl:** fest `powershell.exe` (in `state.json` änderbar). PowerShell 7, cmd, Git Bash, WSL? Pro Session wählbar?
- **Schliessen:** ohne Rückfrage. Bestätigung, wenn noch ein Programm läuft?
- **Darstellung:** Sidebar vs. Tabs oben, Reihenfolge per Drag & Drop, Gruppen, Farben/Icons, Theme, Schriftgrösse
- **Fenster:** mehrere Fenster, Split-Ansicht (mehrere Terminals nebeneinander)
- **Installation/Updates:** Installer (NSIS) für den eigenen Benutzer, Auto-Update, Autostart, Code-Signing
