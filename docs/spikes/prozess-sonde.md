# Spike: Prozess-Sonde (Ticket 13)

Stand 19.11.2026 · Spike-Code in [`spikes/prozess-sonde/`](../../spikes/prozess-sonde/) · Rohdaten in [`spikes/prozess-sonde/ergebnisse/`](../../spikes/prozess-sonde/ergebnisse/)

Frage aus [Ticket 13](../tickets/13-status-am-tab.md) und dem Abschnitt „Claude-Status: Zustandsautomat pro Tab“ der [Spezifikation](../specs/termhub-v2.md): Wie bekommt der Hauptprozess etwa alle 1,5 Sekunden den Windows-Prozessbaum (PID, Eltern-PID, Programmname) für alle Terminals, ohne pro Abfrage einen Prozess zu starten? Die Lösung muss in Electron 45 unverpackt und mit electron-builder verpackt laufen, und der Installer muss auf einem Rechner ohne Visual-Studio-Build-Tools einfach funktionieren.

## Kurzfassung

**Empfehlung: `koffi` 3.3.8 (FFI mit vorkompilierten N-API-Binärdateien) und ein einziger Aufruf von `NtQuerySystemInformation(SystemProcessInformation)` pro Abfrage, asynchron über koffi in einem Worker-Thread.**

- Installation ohne Build-Tools: ja. Die Binärdatei kommt als optionale Abhängigkeit `@koromix/koffi-win32-x64` (auch `-arm64`) aus npm; das Installationsskript prüft nur, ob sie lädt. Geprüft mit absichtlich nicht auffindbarem Visual Studio und ohne CMake.
- Läuft in Electron 45 unverpackt und verpackt (electron-builder `--win dir`). Nötig sind ein `asarUnpack`-Eintrag (macht electron-builder auch von selbst) und `koffi` als `external` in `build.mjs`.
- Eine Abfrage dauert hier im Median **6,8 ms** (574 Prozesse, rund 8600 Threads). Das sind **7 ms CPU pro 1,5 s, also 0,5 % eines Kerns oder 0,02 % des ganzen Rechners** (20 logische Prozessoren). Asynchron blockiert sie den Hauptthread nur für das Auswerten des Puffers (0,5 ms). Die Kosten hängen nicht von der Zahl der Tabs ab.
- Der Aufruf liefert für jeden Prozess auch die **Startzeit**. Erst mit ihr lässt sich der Baum gegen PID-Wiederverwendung absichern. Das war auf diesem Rechner bei 5 Prozessen nötig.

Verworfen:
- `@vscode/windows-process-tree`: braucht bei `npm install` die Build-Tools (impliziter `node-gyp rebuild`), kappt die Liste bei 1024 Prozessen, liefert keine Startzeit und ist mit 25 ms die langsamste der Varianten im Prozess.
- Langlebige PowerShell mit `Get-CimInstance Win32_Process`: rund **560 ms CPU pro Abfrage**, davon 85 % im WMI-Dienst. Das sind **33–39 % eines Kerns, 1,7–2 % des ganzen Rechners**, also allein schon mehr als das Ziel aus dem Ticket (unter 1 % mit 20 Tabs). Dazu kommen rund 130 MB Arbeitsspeicher.

Wichtigste Erkenntnisse für die Regeln:
- `conhost.exe` bzw. `OpenConsole.exe` jedes Tabs hängt **neben** der Shell direkt unter dem TermHub-Hauptprozess, nicht unter der Shell. Unter der Shell erscheint `conhost.exe` nur bei Nachfahren mit eigener Konsole.
- Git Bash: `bin\bash.exe` (PID von node-pty) startet `usr\bin\bash.exe`. Darunter läuft **jeder** Befehl über ein Fork-Kind, das ebenfalls `bash.exe` heisst. **MSYS-Programme** (`sleep`, `ssh`, `vim`, `less` …) verlieren dabei ihren Windows-Elternprozess und sind über die Eltern-PID nicht mehr erreichbar. Zuordnen lassen sie sich über ihren Konsolen-Host.
- Kurzlebige Prompt-Helfer leben 30–620 ms. Die Regel „zwei aufeinanderfolgende Abfragen“ filtert sie sicher.

## Messumgebung und Vorgehen

- Windows 11 Pro 10.0.26200, Intel i7-12800H, 20 logische Prozessoren, Node 24.22, npm 11.19, Electron 45.4.1, node-pty 1.1.0. Visual Studio Build Tools 2019 sind installiert. Für die Installationsprüfungen wurde node-gyp deshalb auf eine nicht vorhandene Version gezwungen (`npm_config_msvs_version=2015`); es meldet dann „Could not find any Visual Studio installation to use“, wie auf einem Rechner ohne Build-Tools.
- Während der Messungen liefen andere Agenten und Claude-Sitzungen: 547–612 Prozesse, rund 8600 Threads. Die Werte schwanken deshalb um etwa ±20 %.
- Alle Messungen laufen im Electron-Hauptprozess ([`main.js`](../../spikes/prozess-sonde/main.js)):
  - **enger Lauf:** Abfragen direkt hintereinander, mindestens 5 s lang. Daraus kommen Dauer und CPU-Zeit pro Abfrage. Windows zählt CPU-Zeit in Schritten von 15,6 ms, kürzere Läufe wären zu ungenau.
  - **realistischer Lauf:** 30 s lang alle 1,5 s eine Abfrage, gegen 30 s Leerlauf gerechnet.
  - Für PowerShell zählt zusätzlich die CPU-Zeit des Kindprozesses und aller `WmiPrvSE.exe`. Sie stammt aus der NtQuerySystemInformation-Sonde, die die CPU-Zeiten aller Prozesse ohne Handle liefert.
- „% eines Kerns“ heisst CPU-Zeit pro Wandzeit. Der Task-Manager zeigt den Anteil am ganzen Rechner, also geteilt durch 20.

## Kandidaten

### 1. `@vscode/windows-process-tree` 0.8.0

- **Installation:** Das Paket hat ein `binding.gyp` und kein eigenes Installationsskript. npm führt deshalb von selbst `node-gyp rebuild` aus. Ohne Build-Tools bricht `npm install` ab, und das Paket wird wieder entfernt (geprüft).
- Zufällig liegt der Build-Ordner des Microsoft-Builds mit im npm-Paket: `build/Release/windows_process_tree.node` (x64, N-API), dazu rund 14 MB Objektdateien und Protokolle. Geprüft für 0.8.0; nach der Paketgrösse zu schliessen ist das seit 0.5.0 so.
  - Mit `npm install --ignore-scripts` oder `"allowScripts": { "@vscode/windows-process-tree": false }` (npm 11.19) bleibt diese Datei erhalten und funktioniert (geprüft, auch verpackt).
  - Das ist aber nicht zugesichert: Es gibt nur x64, und ältere npm-Versionen ignorieren `allowScripts` und bauen trotzdem.
- **Electron:** lädt unverpackt und verpackt. N-API, also kein Neubau für Electron nötig.
- **Funktion:** Toolhelp32 (ANSI-Variante) in einem Worker-Thread. Laut Quelltext (`src/process.cc`, `process_count < 1024`) **bricht die Liste nach 1024 Prozessen still ab**. Auf diesem Rechner sind es schon knapp 600. Keine Startzeit.
- **Verpackung:** electron-builder entpackt wegen der `.node`-Datei das ganze Paket (1,9 MB).

### 2. `koffi` 3.3.8 (FFI)

- **Installation:** Seit koffi 3 enthält das Hauptpaket keinen nativen Code mehr. Die Binärdatei kommt pro Plattform als optionale Abhängigkeit (`@koromix/koffi-win32-x64`, 1 MB; ebenso `-win32-arm64` und `-win32-ia32`).
  - Das Installationsskript (`cnoke --prebuild`) prüft nur, ob `require('koffi')` lädt. Nur wenn das scheitert, würde es mit CMake bauen.
  - Geprüft: Installation mit nicht auffindbarem Visual Studio und ohne CMake im PATH funktioniert, ebenso mit `--ignore-scripts`.
- **Laufzeit:** `koffi.node` importiert nur `KERNEL32.dll` und `ADVAPI32.dll` (statisch gelinkte C-Laufzeit), braucht also kein VC++-Redistributable. Gleiches gilt für node-pty und windows-process-tree. Geprüft mit [`pe-imports.js`](../../spikes/prozess-sonde/pe-imports.js).
- **Electron:** lädt unverpackt und verpackt. N-API (Version 8), also passend zu `npmRebuild: false`.
  - `koffi.view()` ist in Electron verboten (externe ArrayBuffer). Die Sonde übergibt deshalb einen gewöhnlichen `Buffer` als Zeiger und rechnet die Namenszeiger über die Pufferadresse in Versätze um.
- **Zwei Varianten gemessen:**
  - **Toolhelp32** ([`probes/toolhelp.js`](../../spikes/prozess-sonde/probes/toolhelp.js)): dokumentierte API, ein FFI-Aufruf pro Prozess, keine Startzeit.
  - **NtQuerySystemInformation, Klasse 5 `SystemProcessInformation`** ([`probes/ntqsi.js`](../../spikes/prozess-sonde/probes/ntqsi.js)): ein einziger Aufruf liefert PID, Eltern-PID, Name, Startzeit und CPU-Zeit aller Prozesse, ohne Handles zu öffnen.
    - Struktur und Klasse sind in `winternl.h` teilweise dokumentiert (die Eltern-PID heisst dort `Reserved2`) und seit NT stabil. Toolhelp32, der Task-Manager und Process Explorer bauen darauf auf.
    - Der Kernel sammelt dabei auch alle Threads ein. Deshalb kostet der Aufruf hier 6–7 ms; das Auswerten in JS kostet 0,4 ms.
- **Supply Chain:** ein einzelner Maintainer, Version exakt pinnen. Die Aufteilung in Plattformpakete gibt es seit 3.0 (Mai 2026).

### 3. Langlebige PowerShell mit `Get-CimInstance Win32_Process`

- [`probes/powershell-cim.js`](../../spikes/prozess-sonde/probes/powershell-cim.js): Ein Kindprozess (`powershell.exe` 5.1 oder `pwsh.exe`) wartet auf eine Zeile auf stdin, fragt CIM ab und schreibt eine Zeile zurück (CSV per StringBuilder oder `ConvertTo-Json`).
- Installation und Verpackung: nichts nötig.
- **Kosten:** 770–790 ms pro Abfrage und rund 560 ms CPU, davon rund 475 ms im WMI-Dienst `WmiPrvSE.exe` und 77–115 ms in PowerShell.
  - Bei 1,5 s Takt gemessen: 33 % (CSV), 37 % (JSON) bzw. 39 % (pwsh) eines Kerns, also 1,7–2 % des Rechners.
  - Der Kindprozess belegt 120–146 MB Arbeitsspeicher. Bis zur ersten Antwort vergehen rund 1,3 s.
- Weitere Nachteile: Die Last fällt in einem Dienst an, den der Task-Manager nicht TermHub zuschreibt. Eine Abfrage belegt mit rund 0,8 s mehr als die Hälfte des Takts. Sie hängt ausserdem am Zustand des WMI-Dienstes.
- **Verworfen.**

### 4. Weitere Möglichkeiten

| Möglichkeit | Ergebnis |
|---|---|
| NtQuerySystemInformation **Klasse 252** (`SystemBasicProcessInformation`) über koffi | Gefunden durch Ausprobieren auf Build 26200: nur PID, Eltern-PID, eine pro Systemstart eindeutige Sequenznummer und Name, ohne Threads. **0,27 ms pro Abfrage** (25-mal schneller). Undokumentiert, erst neuere Windows-11-Builds, das Layout ist erschlossen. Höchstens als spätere Optimierung mit Rückfall auf Klasse 5. |
| Forks mit Prebuilds, z. B. `@mohammedchaibi/windows-process-tree` | Einzelperson, wenige Downloads, Lieferkettenrisiko. Nicht weiter verfolgt. |
| `ps-list` (startet `fastlist.exe`), `pidtree`, `find-process`, `systeminformation` | Starten pro Abfrage einen Prozess (`wmic`, PowerShell oder eigene exe). Durch die Vorgabe ausgeschlossen. |
| `ffi-napi` / `ref-napi` | Nicht mehr gepflegt, keine Prebuilds für aktuelle Electron-Versionen, braucht Build-Tools. |
| `conpty_console_list.node` aus node-pty (`GetConsoleProcessList`) | Muss sich mit `AttachConsole` an die Konsole hängen; node-pty startet dafür jedes Mal einen eigenen Prozess. Im Hauptprozess nicht verwendbar. |
| Eigene kleine Hilfs-exe, die dauerhaft läuft | Würde funktionieren, ist aber eine unsignierte exe mehr im Paket. Gegenüber koffi kein Vorteil. |

## Messwerte

### Unverpackt (Electron 45, [`ergebnisse/bench-unpackaged.json`](../../spikes/prozess-sonde/ergebnisse/bench-unpackaged.json))

| Kandidat | Median | p95 | CPU pro Abfrage | bei 1,5 s: % eines Kerns | % des Rechners | Hauptthread blockiert |
|---|---:|---:|---:|---:|---:|---:|
| koffi + NtQuerySystemInformation (Kl. 5), asynchron | 7,5 ms | 10,9 ms | 7,4 ms | 0,50 % | 0,025 % | 0,5 ms (Auswertung) |
| koffi + NtQuerySystemInformation (Kl. 5), synchron | 6,8 ms | 8,5 ms | 7,0 ms | 0,46 % | 0,023 % | 6,8 ms |
| koffi + Toolhelp32 | 14,4 ms | 20,9 ms | 15,1 ms | 1,0 % | 0,05 % | 14,4 ms |
| koffi + Klasse 252 (undokumentiert) | 0,27 ms | 0,58 ms | 0,28 ms | 0,02 % | 0,001 % | 0,27 ms |
| `@vscode/windows-process-tree` | 25,0 ms | 30,5 ms | 25,1 ms | 1,7 % | 0,08 % | Umwandlung der Liste |
| `powershell.exe` + CIM, CSV | 768 ms | 867 ms | 551 ms | 33 % ¹ | 1,65 % ¹ | – |
| `powershell.exe` + CIM, JSON | 788 ms | 920 ms | 595 ms | 37 % ¹ | 1,86 % ¹ | – |
| `pwsh.exe` + CIM, CSV | 783 ms | 860 ms | 561 ms | 39 % ¹ | 1,95 % ¹ | – |

¹ Gemessen im realistischen Lauf (20 Abfragen in 30 s), inklusive `WmiPrvSE.exe` und gegen dessen Leerlauf gerechnet. Bei den Varianten im Prozess stimmt der realistische Lauf mit dem engen Lauf überein: Toolhelp 16 ms, Klasse 5 4–5 ms, windows-process-tree 20 ms CPU pro Abfrage über dem Leerlauf.

Weitere Zahlen:
- Erste Abfrage: Klasse 5 14 ms, Toolhelp 24 ms, windows-process-tree 29 ms, PowerShell 1,3 s (Start des Kindprozesses).
- Laden des Moduls: koffi unter 3 ms, windows-process-tree 6 ms.

### Verpackt (electron-builder `--win dir`, [`ergebnisse/bench-packaged.json`](../../spikes/prozess-sonde/ergebnisse/bench-packaged.json))

Alle Kandidaten laden aus `resources\app.asar`. Electron leitet `koffi.node` und `windows_process_tree.node` von selbst nach `app.asar.unpacked` um. Kurzer Lauf: Klasse 5 7,8 ms (synchron und asynchron), Klasse 252 0,32 ms, Toolhelp 16,4 ms, windows-process-tree 33,1 ms, PowerShell/CIM 638 ms. Die Abweichungen zum unverpackten Lauf liegen im Rauschen der Rechnerlast.

## Verpackung

Geprüft mit dem Spike-Paket ([`spikes/prozess-sonde/package.json`](../../spikes/prozess-sonde/package.json), `npmRebuild: false`, `electronDist` aus dem Hauptprojekt):

- electron-builder sammelt die optionale Abhängigkeit `@koromix/koffi-win32-x64` als Produktionsabhängigkeit ein. Pakete für andere Plattformen sind nicht installiert und fehlen deshalb auch im Paket.
- Entpackt (`app.asar.unpacked`) werden `node_modules/@koromix/koffi-win32-x64/**` (1,1 MB). Das JS-Ladeprogramm `node_modules/koffi` bleibt im asar.
- electron-builder entpackt Paketordner mit `.node`-, `.dll`- oder `.exe`-Dateien schon von selbst (`smartUnpack`, `app-builder-lib/out/asar/unpackDetector.js`). Der ausdrückliche `asarUnpack`-Eintrag dokumentiert die Absicht und passt zum bestehenden Eintrag für node-pty.
- esbuild kann koffi nicht bündeln („No loader is configured for ".node" files“, geprüft mit [`esbuild-check.mjs`](../../spikes/prozess-sonde/esbuild-check.mjs)). Als `external` lädt es zur Laufzeit aus `node_modules`.

## Beobachtete Prozessbäume

Aufgezeichnet mit [`trees.js`](../../spikes/prozess-sonde/trees.js): echte Shells über node-pty (ConPTY, wie `src/main/ptyManager.ts`) im Electron-Hauptprozess, Stand mit Pfaden, Befehlszeilen und Konsolen-Host in [`ergebnisse/trees.txt`](../../spikes/prozess-sonde/ergebnisse/trees.txt). Unten gekürzt; `[Host n]` ist der Konsolen-Host (PID von `conhost.exe`), an dem der Prozess hängt.

### PowerShell 7 über den WindowsApps-Alias

```
electron.exe (TermHub-Hauptprozess)
├─ conhost.exe          --headless --width 120 --height 30 --signal … --server …
└─ pwsh.exe             <== PID von node-pty                                    [Host conhost]
   │                    Pfad: C:\Program Files\WindowsApps\Microsoft.PowerShell_7.7.0.0_x64__8wekyb3d8bbwe\pwsh.exe
   │                    Befehl: C:\Users\<Benutzer>\AppData\Local\Microsoft\WindowsApps\pwsh.exe -NoLogo
   ├─ PING.EXE          ping -t localhost                                       [Host conhost]
   └─ PING.EXE          über Start-Process -WindowStyle Hidden                  [eigener Host]
      └─ conhost.exe    conhost.exe 0x4
```

- Die PID von node-pty ist die echte Shell. Der Alias erzeugt keinen Zwischenprozess: Der Pfad zeigt in den WindowsApps-Ordner, die Befehlszeile nennt den Alias.
- Kalter erster Start: `pwsh.exe` entstand erst 2,2 s nach `pty.spawn`. Danach waren es 0,1 s, und `pty.spawn()` blockierte den Hauptthread 150–220 ms (Windows PowerShell und cmd 60–140 ms).
- `conhost.exe` (ConPTY-Host) ist ein **Geschwister** der Shell unter dem Hauptprozess. Im Teilbaum der Shell erscheint `conhost.exe` nur unter einem Prozess mit eigener Konsole.

### Windows PowerShell 5.1 und cmd

```
electron.exe
├─ conhost.exe --headless …
└─ powershell.exe  <== PID von node-pty        bzw.   cmd.exe  <== PID von node-pty
   └─ PING.EXE                                         └─ PING.EXE
```

Keine Startkette: Die PID von node-pty ist die Shell.

### Git Bash (`C:\Program Files\Git\bin\bash.exe --login -i`)

```
electron.exe
├─ conhost.exe --headless …
└─ bash.exe     <== PID von node-pty            Pfad: Git\bin\bash.exe (Starter)
   └─ bash.exe                                  Pfad: Git\usr\bin\bash.exe, Befehl "…\bin\..\usr\bin\bash.exe" --login -i  (innerste Shell)
      ├─ bash.exe                               Fork-Kind (usr\bin\bash.exe, gleiche Befehlszeile)
      │  └─ PING.EXE                            ping -t localhost
      ├─ bash.exe                               Fork-Kind für "cmd //c "ping -t localhost" &"
      │  └─ cmd.exe /c "ping -t localhost"
      │     └─ PING.EXE
      └─ (sleep.exe fehlt!)

sleep.exe   Eltern-PID zeigt auf einen beendeten Prozess      [Host = conhost des Tabs]
```

- Die Startkette ist bestätigt: `bin\bash.exe` startet `usr\bin\bash.exe` nach 40–160 ms (unter Last länger; in einem Lauf war es beim ersten Blick noch nicht da). Beide heissen `bash.exe`; unterscheiden lassen sie sich nur über den Pfad oder die Stellung im Baum.
- Jeder Befehl läuft unter einem **Fork-Kind**, das ebenfalls `bash.exe` heisst (MSYS-Emulation von `fork()`).
  - Bei nativen Windows-Programmen (`ping`, `cmd`, `node`, `git`, `python`) bleibt das Fork-Kind als wartender Elternprozess stehen.
  - Bei **MSYS-Programmen** aus `usr\bin` (`sleep`, `ssh`, `vim`, `less`, `tail` …) ersetzt `exec` das Fork-Kind durch einen neuen Windows-Prozess, und das Fork-Kind endet. Die Eltern-PID des Programms zeigt dann ins Leere, im Vordergrund wie im Hintergrund (geprüft mit `sleep 300` und `sleep 300 &`).
  - Über die Eltern-PID sind diese Programme nicht mehr zu finden. Ihr Konsolen-Host (`NtQueryInformationProcess`, Klasse 49 `ProcessConsoleHostProcess`) ist aber weiterhin das `conhost.exe` des Tabs. Das kostet nur für Waisen etwas: systemweit 12 Prozesse, 0,15 ms pro Abfrage (alle 544 Prozesse: 6 ms; [`console-host-cost.js`](../../spikes/prozess-sonde/console-host-cost.js)).
- Auch ein Blick im Leerlauf kann ein Fork-Kind zeigen, nämlich die Subshell des Prompts. Eine Regel „absteigen, solange genau ein gleichnamiges Kind da ist“ würde deshalb zu tief greifen.

### Mit `useConptyDll: true` (mitgeliefertes OpenConsole.exe)

```
electron.exe
├─ OpenConsole.exe   node_modules\node-pty\prebuilds\win32-x64\conpty\OpenConsole.exe --headless …
└─ cmd.exe  <== PID von node-pty
   └─ PING.EXE
```

`OpenConsole.exe` nimmt genau den Platz von `conhost.exe` ein. TermHub benutzt heute die System-ConPTY (`useConptyDll` nicht gesetzt).

### Claude Code (laufende Sitzungen auf diesem Rechner, nur gelesen)

```
claude.exe
├─ conhost.exe
├─ uv.exe                        MCP-Server, wenige Sekunden nach dem Start von Claude
│  ├─ conhost.exe                eigene versteckte Konsole pro MCP-Server
│  └─ <name>-mcp.exe
│     └─ python.exe
│        └─ python.exe
├─ cmd.exe                       18 min bzw. 1,5 h nach Claude gestartet (Hintergrundaufgabe bzw. Werkzeug)
│  ├─ conhost.exe
│  └─ node.exe
│     └─ node.exe …
└─ idea64.exe                    von Claude geöffnete GUI-Anwendung
```

- Unter Claude kommt `conhost.exe` oft vor (jeder MCP-Server bekommt eine eigene Konsole). Die Regel „nie zählen“ ist dort wirklich nötig.
- Auch von Claude geöffnete GUI-Programme (hier `idea64.exe`) sind Nachfahren. Nach den Regeln zeigt der Tab blau, solange das Programm offen ist.

### Kurzlebige Prozesse am Prompt

Gemessen mit Klasse 252 im Abstand von 0,4–0,9 ms, während fünfmal Enter gedrückt wurde (Arbeitsordner: dieses Git-Repository):

| Shell | Kurzlebige Nachfahren pro Prompt | Lebensdauer |
|---|---|---|
| pwsh mit posh-git-ähnlichem Prompt (`git rev-parse` im `prompt`) | 1 × `git.exe` | 31–69 ms |
| Git Bash, Standard-Prompt mit `__git_ps1` | Kaskade: `bash.exe` (Fork) → 2 × `bash.exe` → `bash.exe` → 2 × `git.exe` | äusserer Fork 210–620 ms, `git.exe` 35–82 ms |
| Windows PowerShell 5.1, cmd (ohne eigenes Profil) | keine | – |

Alles liegt weit unter 1,5 s. Nach der Regel „zwei aufeinanderfolgende Abfragen“ zählt ein Prozess frühestens, wenn er mindestens einen Takt (1,5 s) lebt. Ein Prompt, der länger als 1,5 s rechnet (sehr grosse Repositories mit `GIT_PS1_SHOWDIRTYSTATE`), könnte kurz blau aufblitzen. oh-my-posh ist auf diesem Rechner nicht eingerichtet; es startet pro Prompt ebenfalls ein kurzlebiges `oh-my-posh.exe` im selben Muster.

### PID-Wiederverwendung

Systemweit zeigten 5 Prozesse auf eine Eltern-PID, die inzwischen ein **jüngerer** Prozess trägt, z. B. `MoNotificationUx.exe → msrdc.exe` und `csrss.exe → svchost.exe`. Weitere 8–14 Prozesse hatten einen beendeten Elternprozess. Ohne Vergleich der Startzeiten würde ein Prozess, dessen alter Elternprozess zufällig die PID einer Shell hatte, samt seinen Nachfahren als Kind dieser Shell gelten.

### Beenden des Tabs (Nebenbefund)

- Nach `pty.kill()` lebte der per `Start-Process -WindowStyle Hidden` gestartete `PING.EXE` weiter, weil er eine eigene Konsole hat. Alles andere endete mit der Pseudokonsole.
- Der Hilfsprozess von node-pty für die Konsolenprozessliste (`conpty_console_list_agent.js`) scheiterte bei jedem Beenden mit „AttachConsole failed“. node-pty fällt nach 5 s darauf zurück, nur die Shell-PID zu beenden.
- Beides betrifft die Rückfrage und das Beenden beim Schliessen (Ticket 15), nicht die Sonde.

## Regeln für die innerste Shell und das Zählen

1. **Identität:** Ein Prozess ist das Paar (PID, Startzeit). Das gilt auch für die Regel „zwei aufeinanderfolgende Abfragen“.
2. **Elternkante:** Ein Prozess ist Kind von P, wenn seine Eltern-PID die PID von P ist **und** er nicht vor P gestartet wurde.
3. **Wurzel:** Die Wurzel ist der Prozess mit der PID, die node-pty meldet. Bei pwsh (auch über den WindowsApps-Alias), Windows PowerShell und cmd ist sie die Shell selbst. Die Startzeit der Wurzel wird bei der ersten Abfrage nach dem Start festgehalten. Fehlt die Wurzel später, ist die Shell beendet.
4. **Innerste Shell:**
   - pwsh, powershell, cmd: die Wurzel.
   - Git Bash (TermHub startet `Git\bin\bash.exe`): das `bash.exe`-Kind der Wurzel, also `usr\bin\bash.exe`. Es gibt **genau eine** zusätzliche Ebene. Die innerste Shell wird bestimmt, sobald sie auftaucht, und danach festgehalten. Bis dahin zählt im Tab nichts.
   - Nie tiefer absteigen: Weitere `bash.exe` unter der innersten Shell sind Fork-Kinder (Befehle, Hintergrundjobs, Prompt-Subshells) und gehören zu den Nachfahren.
   - Die Kette von der Wurzel bis zur innersten Shell zählt nie.
   - WSL-Tabs: keine Auswertung, nie blau.
5. **Konsolen-Hosts:** `conhost.exe` und `OpenConsole.exe` zählen nie, unabhängig von der Tiefe. Der ConPTY-Host des Tabs liegt ohnehin neben der Shell. Unter Nachfahren mit eigener Konsole tauchen weitere auf; dort zählt der Elternprozess, nicht der Host.
6. **Waisen im Tab (Git Bash):** Prozesse mit beendetem oder neu vergebenem Elternprozess, deren Konsolen-Host das `conhost.exe` bzw. `OpenConsole.exe` des Tabs ist, gelten als Nachfahren der innersten Shell.
   - Den Host des Tabs liefert dieselbe Abfrage auf die innerste Shell. Das Ergebnis kann pro (PID, Startzeit) zwischengespeichert werden.
   - Ohne diese Regel zeigen `ssh`, `vim`, `less`, `tail -f` usw. in Git Bash nie blau.
7. **Normale Tabs:** Jeder Nachfahre der innersten Shell (inklusive Regel 6) zählt, ausser Regel 5, sobald er in zwei aufeinanderfolgenden Abfragen vorkommt.
8. **Claude-Tabs:**
   - Es zählen Nachfahren des Claude-Prozesses (PID aus `started`), deren Startzeit **nach** dem letzten `UserPromptSubmit` liegt, und nur, solange Claude ruht.
   - Die Startzeit des Claude-Prozesses wird bei der ersten Abfrage festgehalten, in der er als Nachfahre der Shell vorkommt.
   - Beim Start über `claude.cmd` ist die gemeldete PID `cmd.exe`, Claude selbst ist dessen Kind `node.exe`. Das ist unschädlich, weil `node.exe` vor jedem Prompt startet.

## Empfehlung und Konfiguration

### Abhängigkeit

```json
"dependencies": {
  "@xterm/addon-fit": "^0.11.0",
  "@xterm/xterm": "^6.0.0",
  "koffi": "3.3.8",
  "node-pty": "^1.1.0"
}
```

Installieren mit `npm install --save-exact koffi@3.3.8`.
- Die `package-lock.json` enthält danach alle `@koromix/koffi-*`-Pakete; `npm ci` holt nur das passende.
- Nie mit `--omit=optional` bzw. `--no-optional` installieren, sonst fehlt die Binärdatei, und koffi versucht mit CMake zu bauen.
- Ein ARM64-Paket auf einem x64-Rechner zu bauen, bräuchte zusätzlich `@koromix/koffi-win32-arm64` (`npm install --cpu=arm64 --os=win32`). Das ist heute kein Ziel.

### `package.json`, Abschnitt `build`

```json
"asarUnpack": [
  "node_modules/node-pty/**",
  "node_modules/@koromix/koffi-win32-*/**"
],
"npmRebuild": false
```

`npmRebuild: false` bleibt richtig: koffi ist N-API, die vorkompilierte Datei passt zu jeder Electron-Version mit N-API 8.

### `build.mjs`

```js
external: ['electron', 'node-pty', 'koffi'],
```

### Sonde (Skizze für `src/main`)

Die Sonde liefert die ganze Prozessliste, der Kern filtert. So bleibt sie dumm, und die steuerbare Test-Sonde gibt einfach Listen zurück.

```ts
export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;      // z. B. "bash.exe"
  startTime: bigint; // FILETIME (100 ns seit 1601, UTC)
}
export interface ProcessProbe {
  snapshot(): Promise<ProcessInfo[]>;
  /** Konsolen-Host einer PID (nur für Waisen, Regel 6); null, wenn nicht lesbar. */
  consoleHost(pid: number): number | null;
}
```

Die Umsetzung entspricht [`probes/ntqsi.js`](../../spikes/prozess-sonde/probes/ntqsi.js) (Modus `process`, `async: true`):
- Ein Puffer von 1 MB, der bei `STATUS_INFO_LENGTH_MISMATCH` wächst.
- Die Pufferadresse holt die Sonde einmalig über `memmove(buf, buf, 0)`; die Offsets gelten für 64 Bit.
- Nie zwei Abfragen gleichzeitig: Läuft die vorige noch, fällt der Takt aus.

`consoleHost` entspricht `consoleHost()` in [`trees.js`](../../spikes/prozess-sonde/trees.js).

### Abwägung

- Klasse 5 und Klasse 49 sind nicht offiziell dokumentiert, aber seit Jahrzehnten stabil und weit verbreitet.
- Wer nur dokumentierte APIs will: Toolhelp32 über koffi kostet das Doppelte und liefert keine Startzeit (sie bräuchte pro Prozess `OpenProcess`/`GetProcessTimes`). Auf Regel 6 müsste man dann verzichten.
- Klasse 252 bringt den Aufwand auf 0,3 ms, lohnt sich bei 0,02 % Rechnerlast aber nicht.

## Korrekturen an der Spezifikation

1. **Daten der Prozess-Sonde** (Abschnitt „Architektur“, Port „Prozess-Sonde“): „(Prozess-ID, Eltern-ID, Programmname)“ um die **Startzeit** ergänzen. Ein Prozess ist das Paar (PID, Startzeit), und eine Eltern-Kind-Kante gilt nur, wenn das Kind nicht vor dem Elternprozess gestartet wurde. Ohne das verfälscht PID-Wiederverwendung den Baum.
2. **Beispiele für die Sonde** („Prozesse laufen“, erster Punkt, und Ticket 13): `@vscode/windows-process-tree` streichen. Begründung: Build-Tools bei der Installation, Abbruch nach 1024 Prozessen, keine Startzeit. Stattdessen: „über koffi (vorkompiliert) mit einem Aufruf von `NtQuerySystemInformation(SystemProcessInformation)`, asynchron“.
3. **„Native Module liegen im Paket ausserhalb des asar-Archivs“:** präzisieren auf `asarUnpack` für `node_modules/@koromix/koffi-win32-*/**`, `koffi` als `external` in `build.mjs`, nicht mit `--omit=optional` installieren. `npmRebuild: false` passt, weil N-API.
4. **`conhost.exe` / `OpenConsole.exe`:** Der ConPTY-Host liegt neben der Shell, nicht darunter. Die Regel „nie gezählt“ bleibt nötig für Hosts unter Nachfahren mit eigener Konsole (MCP-Server, `Start-Process`).
5. **Startkette Git Bash:** als „genau eine Ebene: das `bash.exe`-Kind des Starters `bin\bash.exe`, beim Start bestimmt und festgehalten“ formulieren. Dazu ergänzen, dass weitere `bash.exe` darunter Fork-Kinder sind und zählen.
6. **Neu: Waisen in Git Bash.** MSYS-Programme haben keinen erreichbaren Elternprozess. Entweder Regel 6 aufnehmen (Zuordnung über den Konsolen-Host des Tabs) oder als bekannte Grenze dokumentieren („`ssh`, `vim`, `less` in Git Bash zeigen kein Blau“). Empfehlung: aufnehmen.
7. **„… und der Starter selbst“ streichen.**
   - In Claude-Tabs liegt der Starter oberhalb des Claude-Prozesses, also nie im gezählten Teilbaum.
   - In normalen Tabs läuft er nur beim Durchreichen (`claude -p`, `claude mcp …`), und dann zählt sein Kind ohnehin.
   - Über Programmnamen allein (`powershell.exe`) wäre er auch nicht erkennbar.
8. **Grundbestand bei `UserPromptSubmit`** (Zustandsautomat, Zeile „`UserPromptSubmit`“ und „Claude-Tabs“): statt „Prozess-Grundbestand neu erfassen“ den **Zeitpunkt** merken. Es zählen Nachfahren, die danach gestartet wurden. Das braucht keine eigene Abfrage und schliesst die Lücke von bis zu 1,5 s zur letzten Abfrage.
9. **Bekannte Grenzen ergänzen:**
   - Von Claude oder in der Shell geöffnete GUI-Programme (z. B. eine IDE) zählen als laufende Prozesse, solange sie offen sind.
   - Prompts, die länger als 1,5 s rechnen, können kurz blau aufblitzen.
   - Prozesse, die sich ganz von Konsole und Eltern lösen (`DETACHED_PROCESS`, Eltern beendet), sind nicht zuzuordnen.
10. **Bestätigt, ohne Änderung:**
    - Die PID von node-pty ist das gestartete Programm (auch beim WindowsApps-Alias).
    - Die Regel „zwei aufeinanderfolgende Abfragen“ filtert die gemessenen Prompt-Helfer (31–620 ms) sicher.
    - Eine Abfrage für alle Tabs zusammen hält das CPU-Ziel (0,02 % des Rechners) unabhängig von der Zahl der Tabs ein.

## Nicht geprüft

- Installation auf einem zweiten Rechner ohne Build-Tools. Ersetzt durch erzwungenes Fehlen von Visual Studio und CMake sowie die Prüfung der DLL-Importe.
- Der Installer (NSIS) selbst. Gebaut und geprüft wurde nur `--win dir`.
- WSL-Tabs (`wsl.exe`) und oh-my-posh.
- ARM64-Windows: koffi hat ein Paket dafür, und das Layout von Klasse 5 ist auf 64 Bit gleich.
- Ein echter Starter mit Claude in einem TermHub-Tab (Ticket 11). Die Claude-Bäume stammen aus laufenden Sitzungen ausserhalb von TermHub.

## Spike-Code

| Datei | Zweck |
|---|---|
| `spikes/prozess-sonde/main.js` | Messung aller Kandidaten im Electron-Hauptprozess, unverpackt und verpackt (`npm run bench`) |
| `spikes/prozess-sonde/probes/*.js` | die Kandidaten: koffi + NtQuerySystemInformation (Klasse 5 bzw. 252, synchron/asynchron), koffi + Toolhelp32, windows-process-tree, PowerShell/CIM |
| `spikes/prozess-sonde/trees.js` | echte Shells über node-pty starten und Prozessbäume aufzeichnen (`npm run trees`) |
| `spikes/prozess-sonde/console-host-cost.js` | Kosten der Abfrage des Konsolen-Hosts |
| `spikes/prozess-sonde/pe-imports.js` | DLL-Importe nativer Module (VC++-Laufzeit nötig?) |
| `spikes/prozess-sonde/esbuild-check.mjs` | lässt sich koffi bündeln? |
| `spikes/prozess-sonde/package.json` | Abhängigkeiten und electron-builder-Konfiguration des Verpackungstests (`npm run pack`) |
| `spikes/prozess-sonde/ergebnisse/` | Rohdaten (Benutzername ersetzt) |

Der Spike hat ein eigenes `package.json` mit `allowScripts`, damit `npm install` dort auch ohne Build-Tools funktioniert. node-pty lädt er aus dem Hauptprojekt.
