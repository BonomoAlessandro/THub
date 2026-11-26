# THub – Aufbau und Entwicklung

Wie THub gebaut ist, wie es getestet wird und wie man daran arbeitet. Die Bedienung steht im [Handbuch](handbuch.md), die Kurzfassung im [README](../README.md).

## Aufbau

| Teil | Technik |
|---|---|
| App-Hülle | [Electron](https://www.electronjs.org/) 45 |
| Oberfläche | [React](https://react.dev/) 19 mit TypeScript, normales CSS mit Design-Variablen (hell/dunkel) |
| Terminal-Darstellung | [xterm.js](https://xtermjs.org/) 6 (`@xterm/xterm`, `addon-fit`, `addon-serialize`) |
| Shell-Prozesse | [node-pty](https://github.com/microsoft/node-pty) über ConPTY, und zwar die mitgelieferte (`conpty.dll`, `OpenConsole.exe` wie im Windows Terminal) |
| Prozess-Sonde, Wachhalten | [koffi](https://koffi.dev/) 3.3.8 (exakt gepinnt) |
| Build | esbuild (Bündeln), TypeScript (nur Typecheck), electron-builder (NSIS-Installer) |
| Tests | Vitest |

### Workspace-Kern und Ports

Der Hauptprozess ist die einzige Quelle der Wahrheit für den Zustand. Die gesamte Tab-Logik besitzt der **Workspace-Kern** [`src/main/workspace/workspace.ts`](../src/main/workspace/workspace.ts), ein tiefes Modul ohne Electron: Tabs anlegen, umbenennen, verschieben, schliessen und wieder öffnen, Wiederherstellen beim Start, aktueller Ordner, Claude-Zuordnung und Status, Hinweise, zuletzt benutzte Ordner, Einstellungen, Fensterangaben, Beenden.

Nach aussen hängt der Kern nur an schmalen **Ports** ([`ports.ts`](../src/main/workspace/ports.ts)), die im Betrieb echt und in den Tests nachgemacht sind:

| Port | Im Betrieb |
|---|---|
| Terminal-Backend: Shell starten, schreiben, Grösse ändern, beenden; meldet Ausgabe, Ende, Prozess-ID | [`ptyManager.ts`](../src/main/ptyManager.ts) (node-pty), Start mit Integration über [`shellLaunch.ts`](../src/main/shellLaunch.ts), Umgebung aus [`shellEnv.ts`](../src/main/shellEnv.ts) |
| Speicher: Zustand und Verlauf pro Tab | [`store.ts`](../src/main/store.ts): `state.json` entprellt und atomar, Verlauf unter `history\` |
| Uhr, System (Ordner, Benutzer, Bildschirme, 8.3-Kurznamen) | [`system.ts`](../src/main/system.ts) |
| Prozess-Sonde: alle Prozesse in einer Abfrage, gezieltes Beenden | [`processProbe.ts`](../src/main/processProbe.ts) |
| Wachhalten: Stufe aus, nur Rechner, Rechner und Bildschirm | [`keepAwake.ts`](../src/main/keepAwake.ts): Energie-Anforderung bei Windows über koffi; im Testmodus nur eine Zeile in der Ausgabe |

**ConPTY:** Das Terminal-Backend startet jede Shell über die mit node-pty gelieferte ConPTY (`useConptyDll`), dieselbe wie im Windows Terminal. Die ConPTY von Windows schickte, was eine Shell neu zeichnet, erst mit ihrem nächsten Bild, rund 16 ms nach der Taste; das machte das Blättern im Befehlsverlauf träge (Ticket 24, Messungen in der Spezifikation unter „Shell-Integration“). Lässt sich die mitgelieferte nicht starten, nimmt das Backend für den Rest der Sitzung die von Windows. Die mitgelieferte fragt beim Start nach den Merkmalen des Terminals (DA1), worauf xterm.js antwortet, und leert den sichtbaren Bereich nicht selbst: Die Oberfläche setzt den Cursor vor jedem Start oben links in einen leeren Bereich (`startArea`), das Bisherige bleibt im Scrollback.

Die reinen Regeln liegen in eigenen Modulen neben dem Kern, alle ohne Electron:

| Modul | Inhalt |
|---|---|
| [`schema.ts`](../src/main/workspace/schema.ts) | gespeicherter Zustand (Version 2), Prüfung beim Laden, Übernahme aus Version 1 |
| [`folders.ts`](../src/main/workspace/folders.ts) | Tab-Namen nach dem Ordner, zuletzt benutzte Ordner |
| [`groups.ts`](../src/main/workspace/groups.ts) | Tab-Gruppen (Ticket 36): Status einer Gruppe, verstreute Tabs zusammenrücken, Einfügestelle ohne eine Gruppe zu teilen; die Einträge der Leiste leiten Kern und Oberfläche gleich ab ([`src/shared/barEntries.ts`](../src/shared/barEntries.ts)) |
| [`cwdReport.ts`](../src/main/workspace/cwdReport.ts) | Ordner-Meldungen der Shell (OSC 7, OSC 9;9) im rohen Ausgabestrom |
| [`claude.ts`](../src/main/workspace/claude.ts) | Claude-Zuordnung: Vertrag von Starter und Hooks, Regeln |
| [`tabStatus.ts`](../src/main/workspace/tabStatus.ts) | Status-Zeilen des Zustandsautomaten, Eingaben (Esc, Antwort), Vorrang der Anzeige |
| [`processRules.ts`](../src/main/workspace/processRules.ts) | ob in einem Tab Prozesse laufen; welche Prozesse mit einem Tab enden |
| [`resume.ts`](../src/main/workspace/resume.ts) | welche Claude-Session fortgesetzt wird, Startbefehl pro Shell |
| [`toasts.ts`](../src/main/workspace/toasts.ts) | Hinweise: Plätze pro Tab, Countdown nur bei sichtbarem Fenster (gemeldet vom Renderer, unabhängig vom Fokus) |
| [`openPoints.ts`](../src/main/workspace/openPoints.ts) | Anweisung an Claude und Erkennung offener Punkte |
| [`windowPlacement.ts`](../src/main/workspace/windowPlacement.ts) | wo das Fenster öffnet |
| [`shellIds.ts`](../src/main/workspace/shellIds.ts) | Shell-Kennungen (`pwsh`, `powershell`, `cmd`, `gitbash`, `wsl:<Distribution>`) und Anzeigenamen |

[`main.ts`](../src/main/main.ts) verdrahtet alles: Einzelinstanz, Shell-Erkennung ([`shells.ts`](../src/main/shells.ts)) und Prüfung der Execution Policy ([`executionPolicy.ts`](../src/main/executionPolicy.ts)) parallel zum Start, lokale Schnittstelle und Hook-Datei, Kern, Fenster, IPC und geordnetes Beenden. Dazu [`theme.ts`](../src/main/theme.ts) (hell/dunkel, Fensterknöpfe), [`openFolder.ts`](../src/main/openFolder.ts) („Ordner im Explorer öffnen“), [`dataFolder.ts`](../src/main/dataFolder.ts) (Datenordner, Übernahme aus „TermHub“) und [`devMenu.ts`](../src/main/devMenu.ts).

### IPC-Vertrag

[`src/shared/types.ts`](../src/shared/types.ts) ist der Vertrag zwischen Oberfläche und Kern: `WorkspaceSnapshot` beim Laden, danach `WorkspaceEvent` (Tabs, Hinweise, Einstellungen, Ausgabe, Ende, Hinweis im Terminal, Verlauf wiederherstellen bzw. anfordern, Rückfrage beim Schliessen), in die andere Richtung nur `WorkspaceCommand`. Die Kanalnamen stehen in `IPC`. [`preload.ts`](../src/preload/preload.ts) stellt dem Renderer die API `window.thub` bereit.

- Shells startet nur der Kern, und erst, wenn der Renderer die Ansicht des Tabs mit Spalten und Zeilen als bereit gemeldet hat (`viewReady`). So geht keine Ausgabe verloren, und ein wiederhergestellter Verlauf steht vor der ersten Ausgabe der Shell.
- Pausierte Claude-Tabs bekommen ihre Ansicht erst, wenn sie angezeigt werden.
- Den Ordner für „Ordner im Explorer öffnen“ bestimmt der Kern; der Renderer schickt nur die Tab-Kennung, und geöffnet wird nur ein Ordner, den es gibt.
- Links aus dem Terminal öffnet der Hauptprozess ([`openLink.ts`](../src/main/openLink.ts)) mit `shell.openExternal`, nachdem er die Adresse selbst noch einmal geprüft hat: nur `http:` und `https:` ([`src/shared/links.ts`](../src/shared/links.ts)).

### Lokale Schnittstelle und Hooks

[`localApi.ts`](../src/main/localApi.ts) ist ein kleiner HTTP-Server nur auf `127.0.0.1`, auf einem zufälligen freien Port, mit einem pro Start zufälligen Token. Jedes Terminal bekommt `THUB_TAB_ID`, `THUB_API` (Adresse), `THUB_TOKEN` und, ohne blockierende Gruppenrichtlinie, `THUB_STARTER` (Pfad zum Starter). Ohne gültiges Token (`X-THub-Token`) antwortet der Server mit 403.

| Endpunkt | Von | Antwort |
|---|---|---|
| `POST /claude/launch` | Starter, vor dem Start | Tab-Name, neue Session-Kennung (nur bei einer neuen Session), Pfad zur Hook-Datei; 404 für einen unbekannten Tab |
| `POST /claude/started` | Starter, direkt nach dem Start | leer |
| `POST /claude/exit` | Starter, nach dem Ende | leer |
| `POST /hooks/<Ereignis>` | Claude Code, Tab in `X-THub-Tab` | immer sofort leer, nie Entscheidungsfelder; einzige Ausnahme `SessionStart` mit der Anweisung für offene Punkte |

Die Hook-Datei schreibt [`hookFile.ts`](../src/main/hookFile.ts) bei jedem Start neu nach der im Spike geprüften Vorlage (`spikes/claude-hooks/empfohlene-hook-datei.json`): HTTP-Hooks für `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure` und `Notification`, Tab und Token aus der Umgebung (`allowedEnvVars`), 2 Sekunden Zeitlimit. `SessionStart` kennt keine HTTP-Hooks und läuft über das `curl.exe` von Windows; fehlt es, übernimmt das nächste andere Ereignis mit neuer Kennung die Zuordnung. Ein zweiter Start öffnet keinen Server und schreibt keine Hook-Datei. Befunde: [`docs/spikes/claude-hooks.md`](spikes/claude-hooks.md).

### Shell-Integration und Starter

Jede Windows-Shell startet mit der mitgelieferten Integration aus [`resources/shell/`](../resources/shell) (im Paket als echte Dateien unter `resources\shell`). Sie lädt zuerst das normale Profil des Nutzers, schaltet in PowerShell die Befehlsvorschau von PSReadLine ab (`PredictionSource None`, nur wenn PSReadLine die Option kennt), meldet danach bei jedem Prompt den aktuellen Ordner, richtet den `claude`-Ersatz ein (nur mit `THUB_STARTER`) und führt bei Bedarf einmal einen Startbefehl aus.

| Shell | Start | Ordner-Meldung |
|---|---|---|
| PowerShell 7, Windows PowerShell | `-NoLogo -NoProfile -NoExit -EncodedCommand <integration.ps1>`; die Integration lädt die Profile selbst | OSC 9;9, nur für Orte im Dateisystem |
| cmd | `/s /k ""…\integration.cmd""`, ohne `/d`: AutoRun läuft wie gewohnt | OSC 9;9 vorne im `PROMPT` |
| Git Bash | `--rcfile …/integration.bash -i`; lädt, was eine Login-Shell lädt | OSC 7 (`file://…`) per `PROMPT_COMMAND` |

- Der Kern erkennt die Meldungen im rohen Ausgabestrom, auch über Stückgrenzen, wandelt sie in Windows-Pfade (Prozentkodierung, `/c/…` → `C:\…`, 8.3-Kurznamen) und übernimmt nur Ordner, die es gibt. Die Sequenzen bleiben im Strom; xterm.js zeigt sie nicht an.
- **Startbefehl** (zum Fortsetzen von Claude): läuft genau einmal, sobald die Shell bereit ist; PowerShell und Git Bash bekommen ihn über `THUB_START_CMD` (vor dem Ausführen entfernt), cmd in der `/k`-Zeile hinter der Integration. Ohne `THUB_STARTER` ruft er `claude --resume <Kennung>` direkt auf.
- **Umgebung** ([`shellEnv.ts`](../src/main/shellEnv.ts)): ohne geerbte `THUB_*`, `TERMHUB_*`, `npm_*` und `ELECTRON_*`; `NO_PROXY` um `127.0.0.1,localhost` ergänzt; `PSModulePath` ohne die Modulordner von PowerShell 7, damit Windows PowerShell 5.1 auch dann seine Module lädt, wenn THub aus PowerShell 7 gestartet wurde.
- Fehlt die Integration oder scheitert sie, startet die Shell trotzdem. Mitgelieferte Skripte sind reines ASCII oder UTF-8 mit BOM, weil Windows PowerShell 5.1 UTF-8 ohne BOM falsch liest.
- Befunde: [`docs/spikes/starter.md`](spikes/starter.md).

### Prozess-Sonde

[`processProbe.ts`](../src/main/processProbe.ts) fragt mit einem einzigen asynchronen Aufruf von `NtQuerySystemInformation` über koffi alle Prozesse ab (Prozess-ID, Eltern-ID, Programmname, Startzeit), ohne einen Prozess zu starten; das kostet rund 7 ms auf einem Hilfs-Thread. Der Kern nutzt sie für „Prozesse laufen“, für die Wartezeit nach einer Antwort an Claude und um beim Schliessen den ganzen Prozessbaum eines Tabs zu beenden; das Terminal-Backend räumt damit den Konsolen-Host einer von selbst beendeten Shell weg. Die Regeln stehen in [`processRules.ts`](../src/main/workspace/processRules.ts), die Befunde in [`docs/spikes/prozess-sonde.md`](spikes/prozess-sonde.md).

- Ein Prozess ist (Prozess-ID, Startzeit); ein Kind zählt nur unter einem Elternprozess, der nicht jünger ist als es selbst, weil Windows Prozess-IDs wiederverwendet.
- Wurzel ist die Prozess-ID von node-pty; bei Git Bash genau eine Ebene tiefer das `bash.exe`-Kind des Starters `bin\bash.exe`.
- koffi ist exakt auf 3.3.8 gepinnt. Die Binärdatei kommt als optionales Paket `@koromix/koffi-win32-x64`: nie mit `--omit=optional` installieren. Im Paket liegt sie ausserhalb des asar-Archivs (`asarUnpack`), esbuild lässt koffi als `external` stehen.

### Wachhalten

[`keepAwake.ts`](../src/main/keepAwake.ts) hält den Rechner über eine Energie-Anforderung wach (Ticket 28). Beim ersten Einschalten erzeugt es mit `PowerCreateRequest` eine Anforderung mit dem Grund „THub hält den Rechner wach“ (`POWER_REQUEST_CONTEXT_SIMPLE_STRING`); sie bleibt bis zum Ende des Prozesses. „Nur Rechner“ setzt `PowerRequestSystemRequired`, „Rechner und Bildschirm“ zusätzlich `PowerRequestDisplayRequired`; `PowerClearRequest` hebt auf, was nicht mehr gilt. Erst wird gesetzt, dann aufgehoben, damit beim Wechsel keine Lücke entsteht.

- Der Kern meldet die wirksame Stufe beim Start (nach dem Laden des Zustands) und bei jeder Änderung, die sie ändert. Der Port ist idempotent und lädt koffi erst beim ersten Einschalten; „aus“ beim Start kostet nichts.
- **Fehler (Ticket 31):** `set(level)` liefert ein Versprechen. Scheitert das Setzen einer Art (`phase: 'set'`), hebt der Port alles auf, was gesetzt ist, und weist mit einem `KeepAwakeError` zurück (Grund `windows` mit Fehlercode, `load`, `unsupported` oder `other`). Scheitert nur das Aufheben (`phase: 'clear'`), bleibt die Art gesetzt. Der nächste Aufruf versucht es erneut.
- Der Kern schaltet nach einem gescheiterten Setzen das Wachhalten aus, speichert das und zeigt den Fehler-Hinweis (Art `keepAwakeError`, ohne Tab, höchstens einer, unabhängig von „Hinweise im Fenster“); nach einem gescheiterten Aufheben nur den Hinweis. Fehler für eine Stufe, die nicht mehr gewünscht ist, übergeht er. Der Fehler steht zusätzlich in der Ausgabe.
- Endet THub, gibt Windows die Anforderung mit dem Prozess frei; beim Beenden meldet der Kern deshalb nichts.
- **Nicht** `powerSaveBlocker` von Electron: dessen `prevent-app-suspension` stellt nur `PowerRequestExecutionRequired`, und das hält auf Rechnern mit Modern Standby das System nicht sicher wach (Spezifikation, „Rechner wach halten“).

### Renderer

[`src/renderer/`](../src/renderer) ist die React-Oberfläche: Sie zeigt an und schickt Befehle, die Tab-Logik liegt im Kern.

| Datei oder Ordner | Inhalt |
|---|---|
| `main.tsx`, `theme.ts` | Einstieg; zuerst das Design übernehmen, dann zeichnen; Terminal-Farbschema aus den Design-Variablen |
| `App.tsx`, `useWorkspace.ts` | Fenster mit Tab-Leiste, Terminal-Fläche, Hinweisen, Palette und Dialogen; Schnappschuss und Ereignisse des Kerns; meldet dem Kern, ob das Fenster den Fokus hat (`windowForeground`) und ob es sichtbar ist (`windowVisible`, Ticket 33) |
| `shortcuts.ts`, `commands.ts`, `fontSize.ts` | Tabelle der Tastenkürzel; Befehle, die Tastenkürzel, Maus und Palette gemeinsam auslösen; `Ctrl` + Mausrad in Schritte |
| `tabs/` | Titelleiste mit Tab-Leiste, Symbol-Platz, Umbenennen, Tooltip, Pfeil-Menü, Rechtsklick-Menü, Rückfrage beim Schliessen, Umsortieren per Ziehen (`useTabDrag.ts`, Rechnungen in `tabDrag.ts`, auch das Ziehen auf einen Gruppen-Tab), Schalter „Rechner wach halten“ mit Pfeil-Menü (`keepAwakeMenu.tsx`); Gruppen (Ticket 36): Gruppen-Tab (`GroupTab.tsx`), Liste und Menü am Gruppen-Tab (`groupMenu.tsx`), Namen „Gruppenname › Tabname“ (`tabLabel.ts`) |
| `popup/` | Menü und Dialog wie im Prototyp, Bedienung mit der Tastatur (`menuKeys.ts`) |
| `palette/` | Befehlspalette: Einträge, unscharfe Suche, gekürzte Pfade |
| `settings/` | Einstellungsdialog und Übersicht der Tastenkürzel |
| `toasts/` | Hinweise unten rechts; der Stapel weicht der Eingabe im sichtbaren Tab und den Zeilen darunter aus, mit demselben Abstand wie zum Fensterrand (`--toast-edge`): Wahl des Bands und Ruhe beim Neuzeichnen als reine Rechnung (`stackPlacement.ts`), Messen und Setzen an der Spalte (`useStackPlacement.ts`) |
| `terminal/` | ein xterm.js pro Tab, inaktive ausgeblendet statt zerstört; Verlauf serialisieren und ausgegraut wiederherstellen (`history.ts`); Rechtsklick und `Ctrl` + Klick auf Links (`mouse.ts`); ob `Ctrl+C` / `Ctrl+V` kopieren, einfügen oder ans Programm gehen (`clipboardKeys.ts`); Links ohne die gestrichelte Linie von xterm.js (`linkUnderline.ts`); Anfang der Eingabe aus Cursorzeile, umbrochenen Zeilen und Claudes Linie, dazu die geschützten Zeilen darunter (`inputArea.ts`), Lage der Eingabe im Fenster (`TerminalView.inputGeometry`) und Meldung von Änderungen an die Hinweise (`onTerminalChange` in `terminalViews.ts`) |
| `styles/` | Design-Variablen und Terminal-Farbschemata aus dem Prototyp (`tokens.css`), übriges CSS (`app.css`) |

**Menüs und Dialoge über der Titelleiste:** Die Titelleiste ist die Zieh-Fläche des Fensters (`-webkit-app-region: drag`). Was darüber liegt oder hineinragt (Menüs, Abdunkelung eines Dialogs, Tooltip), braucht `-webkit-app-region: no-drag`, sonst verschiebt ein Klick dort das Fenster. Menüs bleiben links der nativen Fensterknöpfe (`navigator.windowControlsOverlay`). Solange ein Menü oder Dialog offen ist (`usePopupOpen`), ruhen die Tastenkürzel.

### Gespeicherter Zustand

Im Datenordner (siehe [Entwicklung](#entwicklung)) liegen `state.json`, der Ordner `history\` und die Hook-Datei `claude-hooks.json`. `state.json` hat das Schema Version 2; eine Datei der Version 1 wird beim Start übernommen, eine unlesbare als `state.json.corrupt-<Zeit>` beiseitegelegt.

```json
{
  "version": 2,
  "settings": { "defaultCwd": "", "defaultShellId": "pwsh", "theme": "system", "fontSize": 14, "notifications": true, "openPoints": true,
                "keepAwake": false, "keepAwakeMode": "system" },
  "tabs": [
    { "id": "…", "name": "Mein Projekt", "nameIsManual": true, "shellId": "gitbash", "startCwd": "C:\\…", "lastCwd": "C:\\…\\src" },
    { "id": "…", "name": "api", "nameIsManual": false, "shellId": "pwsh", "startCwd": "C:\\…\\api", "groupId": "g1",
      "claude": { "sessionId": "…", "cwd": "C:\\…\\api", "confirmed": true, "hadPrompt": true },
      "openPoints": ["Soll der alte Login parallel weiterlaufen?"] }
  ],
  "groups": [{ "id": "g1", "name": "Kunde X", "selectedTabId": "…" }],
  "activeTabId": "…",
  "recentDirs": ["C:\\…\\Mein Projekt"],
  "closedTabs": [],
  "window": { "bounds": { "x": 200, "y": 100, "width": 1200, "height": 760 }, "maximized": false }
}
```

**Gruppen** (Ticket 36) kamen ohne neue Schema-Version dazu: Die Tabs einer Gruppe stehen in `tabs` zusammen und tragen `groupId`; `groups` nennt Kennung, Name und gewählten Tab. Ein geschlossener Tab merkt sich seine Gruppe in `closedTabs[].group` (Kennung, Name, Stelle in der Gruppe). Gelesen wird tolerant (`normalizeGroups` in `schema.ts`). Eine ältere THub übergeht die Felder und zeigt alle Tabs einzeln; das prüft ein Test gegen eine eingefrorene Kopie ihres Lesers (`test/workspace/fixtures/schema-0.3.1.ts`).

Der Verlauf jedes normalen Tabs liegt in `history\<Tab-Kennung>.json` (`{ "version": 1, "savedAt": …, "content": "…" }`). Die Datei eines geschlossenen Tabs bleibt, solange er unter den zuletzt geschlossenen steht, und wird gelöscht, wenn er aus der Liste fällt. Claude-Tabs haben keinen Verlauf: Wird ein Tab zum Claude-Tab, fällt seine Datei weg; wird er wieder normal, sichert ihn die nächste Sicherung neu. Laufzeit-Angaben (Status, Prozess-IDs) werden nicht gespeichert.

## Tests

```powershell
npm test             # Teststelle 1: Kern, Renderer-Logik, Hauptprozess (Vitest, schnell)
npm run test:shells  # Teststelle 2: echte Shells (eigener Testlauf, rund 3 Minuten)
npm run typecheck    # TypeScript prüfen
```

**`npm test`** ([`vitest.config.mts`](../vitest.config.mts)) läuft in Node, ohne Electron und ohne Fenster; lädt getesteter Code doch Electron, schlägt der Test laut fehl.

- `test/workspace/`: der Workspace-Kern mit allen Ports nachgemacht ([`test/support/`](../test/support)): ein Terminal-Backend, das Startaufträge aufzeichnet und Ausgabe und Prozessende einspeisen lässt, Speicher im Arbeitsspeicher, steuerbare Uhr, steuerbare Prozess-Sonde mit Prozessbäumen, nachgemachtes System, ein Port Wachhalten, der die gemeldeten Stufen aufzeichnet. Die lokale Schnittstelle läuft echt auf `127.0.0.1`; die Tests schicken echte HTTP-Anfragen mit Meldungen des Starters und dokumentierten Hook-Nutzdaten. Ein Neustart ist ein neuer Kern auf demselben gespeicherten Zustand. Geprüft wird äusseres Verhalten: Tabs, Tab-Gruppen, Startaufträge, Ordner-Erkennung, Rückfrage, geschlossene Tabs, Claude-Zuordnung und Status, Einfrieren, Prozess-Regeln, Hinweise, offene Punkte, Wiederherstellen, Übernahme aus Version 1, Rechner wach halten samt Fehlern (Ausschalten, Fehler-Hinweis, überholte Fehler).
- `test/renderer/`: reine Logik der Oberfläche ohne DOM: Zuordnung der Tastenkürzel (auch Schweizer Tastatur und Ziffernblock), Übersicht aus derselben Tabelle, `Ctrl` + Mausrad, Tasten im Menü, Suche und Wirkung jedes Befehls der Palette (auch mit dem Kern), Einträge zu Gruppen in Palette, Menüs und Liste, gekürzte Pfade, Verlauf und Hinweis vor dem Start mit echtem xterm.js in Node (für die Startsequenzen beider ConPTYs), Einfügestelle und Scrollen beim Ziehen; mit echtem xterm.js auch Rechtsklick mit und ohne Mausmeldung, `Ctrl` + Klick auf Links und Links ohne gestrichelte Linie, `Ctrl+C` / `Ctrl+V` je nach Markierung, Shell und Bracketed Paste; Anfang der Eingabe (umbrochene Shell-Zeilen, Claudes Linie, alter Rahmen, auch auf dem Puffer eines echten xterm.js) und Lage des Stapels der Hinweise (Wahl des Bands, Ruhe bei einer Folge von Cursorständen wie beim Neuzeichnen von Claude, Halten unter der Maus).
- `test/main/`: Hauptprozess ohne Electron: Design hell/dunkel, Entwicklermenü, Datenordner und Übernahme, Umgebung der Shells, Shell-Erkennung mit nachgemachtem Rechner, Start der Shells mit Integration, Wahl der ConPTY samt Rückfall auf die von Windows (mit nachgemachtem node-pty), Prüfung der Execution Policy, Auswertung der Prozess-Sonde, „Ordner im Explorer öffnen“, Links öffnen mit nachgemachtem `shell.openExternal`, der Port Wachhalten mit nachgemachtem kernel32 (Reihenfolge, Idempotenz, nach einem Fehler nichts halb gesetzt, Phase und Grund des Fehlers, erneuter Versuch) und einmal echt gegen Windows (nur Rechner, Rechner und Bildschirm, aus: ohne Fehler), sein Testmodus.

**`npm run test:shells`** ([`test/shells/`](../test/shells)) startet über das echte Terminal-Backend die echten Shells mit der echten Integration: PowerShell 7, Windows PowerShell, cmd und Git Bash; nicht installierte Shells werden übersprungen. Im PATH liegt ein nachgemachtes `claude` (als `.exe`, aus `ClaudeStub.cs` mit dem `csc.exe` von .NET Framework gebaut, und als `.cmd`), das Argumente und Umgebung in eine Datei schreibt. Geprüft werden: Gleichheit der Argumente mit einem direkten Aufruf, Ergänzen und Durchreichen, die Meldungen des Starters (auch nach `Ctrl+C` und bei Exit-Code ungleich 0), ohne THub und ohne `claude`, Ordner-Meldungen (auch mit Leerzeichen und Umlauten), Laden des Profils, Startbefehl genau einmal, Ende zu Ende mit dem echten Kern und der echten lokalen Schnittstelle (auch mit nachgemachter Gruppenrichtlinie `AllSigned`), Fortsetzen nach einem Neustart (auch ohne `THUB_STARTER`, mit verkürzter Frist für die Start-Meldung) das Beenden aller Nachfahren beim Schliessen mit der echten Prozess-Sonde, die abgeschaltete Befehlsvorschau von PSReadLine sowie eine Zeitgrenze für die Pfeiltasten: Die Zeile aus dem Verlauf muss im Median nach weniger als 10 ms beim Terminal-Backend sein, und der Konsolen-Host jeder Shell ist `OpenConsole.exe`. Wie xterm.js in der App beantwortet das Testgerüst die Abfrage der Terminal-Merkmale (DA1). Dazu die Einordnung des Starters allein (`classify.test.ts`, mit `THUB_STARTER_DRYRUN`).

**Warum kein Test eine laufende THub-Instanz anspricht,** auch wenn der Testlauf selbst in einem THub-Tab läuft:

- Kein Test startet die App; der Kern läuft in Node mit Daten im Arbeitsspeicher bzw. in Temp-Ordnern, nie im Datenordner von THub.
- [`test/support/setup.ts`](../test/support/setup.ts) entfernt vor jeder Testdatei alle geerbten `THUB_*`-Variablen. Braucht ein Test eine lokale Schnittstelle, startet er seine eigene (oder eine aufzeichnende Attrappe) auf einem zufälligen Port mit eigenem Token und gibt `THUB_API` und `THUB_TOKEN` ausdrücklich mit.
- Die Shell-Tests setzen die Umgebung der Shells ausdrücklich: PATH nur mit den Systemordnern und dem Ordner des nachgemachten `claude`, so wird nie ein echtes `claude` gefunden; eigenes `HOME` und Testprofil; das Terminal-Backend entfernt geerbte `THUB_*` und `TERMHUB_*`.

## Entwicklung

```powershell
npm install          # nie mit --omit=optional (koffi braucht sein optionales Paket)
npm start            # bauen und App starten
npm run dev          # wie start, mit Sourcemaps und unminifiziert
npm run dist         # Installer bauen -> release\THub Setup <version>.exe
npm run icon         # App-Symbol aus den SVG-Vorlagen neu erzeugen -> resources\icon\icon.ico
git tag -a v<Version> # vor jedem Installer für den Nutzer, siehe „Version und Installer“
```

`build.mjs` bündelt Hauptprozess, Preload und Renderer mit esbuild nach `dist/`; `electron`, `node-pty` und `koffi` bleiben `external`.

### Datenordner

| Start | Datenordner |
|---|---|
| installierte App | `%APPDATA%\THub` |
| unpaketiert (`npm start`, `npm run dev`) | `%APPDATA%\THub-dev` |

Die Entwicklung berührt die installierte App also nie ([`dataFolder.ts`](../src/main/dataFolder.ts)). Die Einzelinstanz-Sperre hängt am Datenordner: Die Entwicklungsversion läuft neben einer installierten THub, aber nur einmal. Unpaketiert gibt es ein Menü mit Neu laden und Entwicklerwerkzeugen, ohne Zoom; die installierte App hat kein Menü.

**Umstieg vom alten Namen:** Bis 2026-11-19 hiess die App „TermHub“. Hat der Datenordner von THub noch keine `state.json`, übernimmt THub beim Start einmalig `state.json` und `history\` aus `%APPDATA%\TermHub` (unpaketiert aus `%APPDATA%\TermHub-dev`); der alte Ordner bleibt unverändert. Wegen der neuen App-Kennung `ch.custom.thub` bleibt eine installierte TermHub 0.1.0 eine eigene Installation und lässt sich wie gewohnt deinstallieren.

### Testmodus

Für automatische Prüfungen der echten App (`npm start`, `electron .` oder die gebaute `THub.exe`) gibt es zwei Umgebungsvariablen. Ohne beide wird die App für Prüfungen nie gestartet; die Regeln für Agenten stehen in [docs/tickets/README.md](tickets/README.md#spielregeln), „Spielregeln“.

- **`THUB_TEST_DATA_DIR=<Temp-Ordner>`** ersetzt `%APPDATA%` als Wurzel der Datenordner: eigene Daten und eigene Einzelinstanz-Sperre (unpaketiert also `<Temp-Ordner>\THub-dev`). Ein umgeleitetes `APPDATA` allein genügt nicht, Electron ignoriert es.
- **`THUB_TEST_HIDDEN=1`:**
  - Das Fenster öffnet ausserhalb des Bildschirms, ohne Aktivierung und ohne Taskleisten-Eintrag; es nimmt niemandem den Fokus.
  - Grösse und Lage des Fensters werden nicht gespeichert, und ein zweiter Start holt es nicht nach vorne.
  - „Ordner im Explorer öffnen“ öffnet kein Explorer-Fenster; der Ordner steht nur in der Ausgabe.
  - `Ctrl` + Klick auf einen Link öffnet keinen Browser; die Adresse steht nur in der Ausgabe („Testmodus: Der Browser würde … öffnen.“).
  - Kopieren, Einfügen und „Pfad kopieren“ benutzen eine eigene Zwischenablage im Speicher statt der echten des Nutzers.
  - Der Ordner-Dialog von Windows („Ordner wählen …“, „Ändern …“, „Standardordner ändern“) geht nicht auf: Als gewählter Ordner gilt `THUB_TEST_PICK_DIR`, ohne diese Variable ein Abbruch.
  - „Rechner wach halten“ stellt keine Anforderung bei Windows; jede Änderung der Stufe steht nur in der Ausgabe („Testmodus: THub würde jetzt den Rechner wach halten.“, „… den Rechner und den Bildschirm wach halten.“, „… nichts mehr wach halten.“).
  - Mit zusätzlich **`THUB_TEST_KEEPAWAKE_FAIL=1`** scheitert jedes Einschalten wie eine abgelehnte Anforderung (Windows-Fehler 5): Der Schalter geht wieder aus, der Fehler-Hinweis erscheint, und in der Ausgabe steht „Testmodus: Die Anforderung scheitert (THUB_TEST_KEEPAWAKE_FAIL).“ (Ticket 31).
  - Chromium hält das Fenster ausserhalb des Bildschirms für verdeckt: Die Seite ist `hidden`, `requestAnimationFrame` läuft nicht, Zeitgeber sind auf rund eine Sekunde gedrosselt, Animationen laufen nicht zu Ende, und ein Bildschirmfoto per `PrintWindow` zeigt nur den leeren Hintergrund. Für Bildschirmfotos und Prüfungen, die zeichnen müssen, beim Start die Chromium-Option `--disable-features=CalculateNativeWinOcclusion` mitgeben (nur für diesen Prozess): Das Fenster bleibt ausserhalb des Bildschirms und ohne Fokus, die Seite ist aber `visible` (Ticket 32).
  - **Sichtbar und nicht sichtbar prüfen** (Countdown von „fertig“, Ticket 33): Der Renderer meldet dem Kern `document.visibilityState`. Ohne die Option gilt das Testfenster als verdeckt, die Seite ist `hidden`, und der Countdown steht still. Mit der Option ist es sichtbar, aber ohne Fokus, und der Countdown läuft. Den Wechsel innerhalb eines Laufs ergibt Minimieren des eigenen Testfensters **ohne Aktivierung**: `ShowWindowAsync(hwnd, SW_SHOWMINNOACTIVE)` (7) und zurück mit `SW_SHOWNOACTIVATE` (4), nur auf das Fenster „THub“ des selbst gestarteten Prozesses; das Vordergrundfenster bleibt dabei dasselbe. Minimierte Fenster legt Windows ausserhalb des Bildschirms ab (`MINIMIZEDMETRICS` mit `ARW_HIDE`), es erscheint also nichts auf dem Desktop. Abgelesen wird über CDP: `document.visibilityState`, `document.hasFocus()`, die Hinweise aus `window.thub.loadSnapshot()` (`countdown.running`, `remainingMs`) und an der Linie `.t-progress` `animationPlayState`. Einen „fertig“-Hinweis ergeben Meldungen an die eigene Schnittstelle der Test-App (Adresse, Token und Tab aus der Umgebung eines cmd-Tabs, etwa mit `echo %THUB_API% %THUB_TOKEN% %THUB_TAB_ID% > <Datei>`): `/claude/launch`, dann die Hooks `SessionStart`, `UserPromptSubmit` und `Stop`. Weil das Testfenster nie den Fokus hat, kommt der Hinweis auch für den aktiven Tab. Verdecken durch andere Fenster, Sperren und ein ausgeschalteter Bildschirm lassen sich so nicht prüfen; sie stehen in der Abnahme von Hand.
  - **Bildschirmfotos bei Skalierung über 100 %** (Ticket 35): Der Prozess, der `PrintWindow` aufruft, muss sich als DPI-bewusst melden (`SetProcessDPIAware`), sonst liefert `GetWindowRect` logische Masse, und das Bild zeigt nur die linke obere Ecke des Fensters. Für Messungen auf den Pixel genau taugt auch `Page.captureScreenshot` über CDP (Gerätepixel, geteilt durch `devicePixelRatio`).
  - **Echtes Claude Code in einem Tab der Test-App** (Ticket 35): In einem cmd-Tab ein Startskript (`.cmd`) im Temp-Ordner aufrufen, das die geerbten `CLAUDE*`-Variablen leert und `CLAUDE_CONFIG_DIR`, `HOME` und `USERPROFILE` auf Temp-Ordner, `ANTHROPIC_API_KEY` auf einen Platzhalter, `ANTHROPIC_BASE_URL` auf einen geschlossenen Port von `127.0.0.1` sowie `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_AUTOUPDATER=1` und `CLAUDE_CODE_HIDE_CWD=1` setzt und dann `claude.exe` mit vollem Pfad startet. In `CLAUDE_CONFIG_DIR` liegen eine `.claude.json` mit abgeschlossenem Onboarding, freigegebenem Platzhalter (`customApiKeyResponses.approved`: die letzten 20 Zeichen) und vertrauenswürdigem Arbeitsordner sowie eine `settings.json` mit eigener Statuszeile (`statusLine.refreshInterval` in Sekunden lässt sie regelmässig neu laufen). `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` zeigt Claude ohne Vollbild. Tippen über `window.thub.send({ type: 'writeToTab', … })` auf der eigenen Seite; nie Enter, nur tippen und wieder löschen. Beenden mit zweimal `Ctrl+C`, danach den eigenen Prozessbaum der App.

### Installer

`npm run dist` baut mit esbuild und electron-builder einen NSIS-Installer nach `release\THub Setup <version>.exe`, daneben das ungepackte Paket `release\win-unpacked`. Der Installer ist ein Assistent (kein Ein-Klick-Installer) mit wählbarem Installationsordner und erlaubt die Installation für den eigenen Benutzer ohne Administratorrechte (`perMachine: false`). Die Shell-Integration liegt im Paket als echte Dateien unter `resources\shell` (`extraResources`), node-pty und die Binärdatei von koffi ausserhalb des asar-Archivs (`asarUnpack`); `npmRebuild` bleibt aus. Der Installer ist nicht signiert, und es gibt kein Auto-Update.

### Version und Installer

Ticket 30. Die Version steht nur in `package.json` (`version`), nach dem Schema `Haupt.Neben.Korrektur`. Solange THub in Entwicklung ist, bleibt die erste Stelle 0: neue Funktionen erhöhen die zweite Stelle (0.3.0), reine Korrekturen die dritte (0.2.1). 1.0.0 erst, wenn der Nutzer THub für fertig erklärt. Die erste Version mit Nummer ist 0.2.0 (davor hiess jeder Installer 0.1.0); was je Version neu ist, steht in [`CHANGELOG.md`](../CHANGELOG.md).

- electron-builder nimmt die Version für den Namen des Installers (`THub Setup 0.2.0.exe`), die Datei- und Produktversion von `THub.exe` und den Eintrag unter „Installierte Apps“. Die App-Kennung `ch.custom.thub` bleibt, damit ein neuer Installer die bestehende Installation ersetzt.
- `build.mjs` meldet beim Bauen „Baue aus <Commit>“ bzw. „… + Änderungen“, wenn der Arbeitsstand Änderungen hat (`git status --porcelain`). In die App kommt der Commit nicht.
- Der Hauptprozess gibt Version (`app.getVersion()`) und „paketiert“ über `IPC.appInfo` an die Oberfläche; die Zeile baut [`src/renderer/version.ts`](../src/renderer/version.ts). Klick auf die Zeile und „Version kopieren“ in der Palette nehmen beide `copyVersion` aus `commands.ts`.

**Ablauf, wenn ein Agent einen Installer für den Nutzer baut:**

1. Hat sich seit dem letzten Installer etwas an der App geändert, Version nach dem Schema erhöhen und `CHANGELOG.md` ergänzen (Datum, „Neu“, „Geändert“ und „Korrigiert“ mit Ticketnummern). Was zwischen zwei Installern dazukommt, sammelt sich dort unter „Unveröffentlicht“; dieser Abschnitt wird dann zur neuen Version.
2. Committen; der Arbeitsstand ist danach sauber.
3. Tag setzen: `git tag -a v<Version> -m "THub <Version>"` auf diesen Commit (auf `main`).
4. Erst dann `npm run dist`. „Baue aus <Commit>“ ohne „+ Änderungen“ zeigt, dass der Installer genau diesem Commit entspricht.
5. Gepusht werden Commit und Tag zusammen (`git push origin main --follow-tags`), wenn der Nutzer pushen lässt.

### App-Symbol

Das Symbol (Ticket 29: zwei gestapelte Terminals auf einer Graphit-Kachel) liegt unter [`resources/icon/`](../resources/icon):

| Datei | Inhalt |
|---|---|
| `icon-16.svg`, `icon-20.svg`, `icon-24.svg` | von Hand auf ganze Pixel gelegte Vorlagen für die kleinen Grössen |
| `icon-256.svg` | grosse Vorlage für 32 px und mehr |
| `icon.ico` | erzeugt: 16, 20, 24, 32, 40, 48, 64 und 256 px; unter 256 als 32-Bit-Bitmap, 256 als PNG |

- **Ändern:** Vorlage bearbeiten, `npm run icon` ausführen und SVG und `.ico` zusammen committen. Das Skript [`scripts/build-icon.cjs`](../scripts/build-icon.cjs) läuft als Electron-Hauptprozess: Chromium zeichnet jede Grösse aus ihrer Vorlage in einen Canvas, in einem unsichtbaren Fenster ohne Bildschirm. [`scripts/ico.cjs`](../scripts/ico.cjs) schreibt die Datei ohne weitere Abhängigkeiten; `test/main/appIcon.test.ts` prüft Grössen und Formate.
- **Wo es landet:** electron-builder bettet es in `THub.exe`, den Installer und den Deinstaller ein (`build.win.icon` in `package.json`); damit zeigen Taskleiste, `Alt+Tab`, Startmenü, Verknüpfungen und „Installierte Apps“ es. `build.mjs` kopiert es nach `dist/icon.ico`, das Fenster bekommt es über `icon` von `BrowserWindow`, so auch unpaketiert (`npm start`).
- **Prüfen ohne Installation:** `[System.Drawing.Icon]::ExtractAssociatedIcon('release\win-unpacked\THub.exe')` in PowerShell liefert das eingebettete Symbol, ohne die App zu starten.
- Nach einer Installation kann Windows noch eine Weile das alte Symbol aus seinem Zwischenspeicher zeigen, vor allem bei einer an die Taskleiste angehefteten Verknüpfung; lösen und neu anheften hilft.
- Die Entwürfe, aus denen das Symbol gewählt wurde, stehen in [`prototype/icon.html`](../prototype/icon.html).
