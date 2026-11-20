# Spike: Starter und `claude`-Ersatz (Ticket 11)

> Stand: 2026-11-19 · Spezifikation: [termhub-v2.md](../specs/termhub-v2.md), „Shell-Integration“ (Punkt 2 und 3), „Hook-Empfänger und lokale Schnittstelle“, „Teststelle 2“ · Ticket: [11](../tickets/11-starter-und-ersatz.md)

## Frage und Ergebnis

Der Spike sollte zeigen, dass der Entwurf „Ersatz in jeder Shell → gemeinsamer PowerShell-5-Starter → echtes `claude`“ trägt, und zwar mit **genau denselben Argumenten** wie bei einem direkten Aufruf, in PowerShell 7, Windows PowerShell 5.1, cmd und Git Bash.

**Ergebnis: Der Entwurf trägt**, mit einer wichtigen Präzisierung. Der Starter liest die Argumente **nicht als Argumentliste**, sondern **roh aus seiner eigenen Befehlszeile**. Nur so ist die Gleichheit in allen vier Shells erreichbar. Alle Integrationstests laufen grün, Ergebnisse siehe [Testergebnisse](#testergebnisse-pro-shell).

Kurz:

- Gleichheit der Argumente in allen vier Shells für alle geforderten Testfälle, mit `claude.exe` sogar Zeichen für Zeichen derselbe Rest der Befehlszeile.
- Bei `claude.cmd` ist schon der direkte Aufruf in jeder Shell verlustbehaftet (`^`, `&`, `%PATH%`). Der Ersatz liefert dort die Argumente, die die Shell meint, also dasselbe wie ein direkt aufgerufenes `.exe`.
- Ergänzen, Durchreichen, Meldungen (auch nach `Ctrl+C` und mit Exit-Code ≠ 0), Verhalten ohne TermHub, ohne `claude` und der Startbefehl funktionieren in allen vier Shells.
- Bekannte Grenze: Ein Argument, das nur aus `-` besteht (oder mit `-:` beginnt), lässt `powershell.exe -File` abbrechen.
- Die Spezifikation braucht einige Präzisierungen und eine Korrektur (`-n eigener`), siehe [Korrekturen](#korrekturen-an-der-spezifikation).

## Dateien

| Pfad | Inhalt |
|---|---|
| `resources/shell/starter.ps1` | Starter (Windows PowerShell 5.1, reines ASCII), Schritte 1 bis 6 |
| `resources/shell/integration.ps1` | Integration für PowerShell 7 und 5.1, wird per `-EncodedCommand` geladen |
| `resources/shell/integration.cmd` | Integration für cmd, wird per `/k` geladen (doskey-Makro) |
| `resources/shell/integration.bash` | Startdatei für Git Bash (`--rcfile`) |
| `test/shells/stub/ClaudeStub.cs` | nachgemachtes `claude.exe` (C# 5, wird beim Test mit dem `csc.exe` des .NET Framework übersetzt) |
| `test/shells/stub/claude.cmd` | nachgemachtes `claude.cmd`, aufgebaut wie der npm-Shim |
| `test/shells/harness.ts` | Testattrappe der Schnittstelle, Start der Shells über node-pty, Referenz für den Start mit Integration (`buildLaunch`) |
| `test/shells/suite.ts`, `*.test.ts` | Integrationstests pro Shell |
| `test/shells/classify.test.ts` | Einordnung des Starters ohne Shell (Trockenlauf) |
| `test/shells/vitest.config.mts` | eigener Testlauf: `npm run test:shells` |
| `.gitattributes` | `*.cmd` mit CRLF, `*.bash` mit LF |

`src/` ist unverändert. Die Einbindung ins Terminal-Backend (Umgebung, Startargumente) zeigt `buildLaunch` in `test/shells/harness.ts`.

## Entwurf

### Grundidee: die rohe Befehlszeile

Jede Shell baut für ein natives Programm eine Windows-Befehlszeile nach eigenen Regeln:

| Shell | Regeln für `claude.exe` |
|---|---|
| PowerShell 7 | `$PSNativeCommandArgumentPassing = Windows`: für `.exe` „Standard“ (sauberes Quoting nach `CommandLineToArgvW`), für `.cmd`/`.bat` „Legacy“ |
| Windows PowerShell 5.1 | „Legacy“: leere Argumente fallen weg, eingebettete Anführungszeichen werden nicht maskiert |
| cmd | der Rest der getippten Zeile nach Auswertung von `%…%`, `^`, `&` usw., sonst unverändert |
| Git Bash | MSYS-Quoting, dazu **Pfadumwandlung** (`/review` wird zu `C:/Program Files/Git/review`) |

Ein Ersatz, der die Argumente als Liste weitergibt und neu quotet, müsste diese vier Regelwerke nachbauen, samt Fehlern (5.1) und Eigenheiten (MSYS). Stattdessen ruft jeder Ersatz `powershell.exe` **genau so auf, wie die Shell `claude.exe` aufrufen würde**:

```
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File <starter.ps1> <Argumente wie getippt>
```

`powershell.exe` ist selbst ein `.exe`, die Shell baut den Rest der Befehlszeile also mit denselben Regeln wie für `claude.exe`. Der Starter liest `[Environment]::CommandLine`, sucht das Argument `-File` und nimmt **alles hinter dem Skriptpfad unverändert** („Rest“). Für ein `claude.exe` setzt er nur die ergänzten Optionen davor:

```
"<claude.exe>" --settings "<Hook-Datei>" --session-id <Kennung> -n "<Tab-Name>" <Rest unverändert>
```

`claude.exe` zerlegt damit Zeichen für Zeichen dieselbe Befehlszeile wie bei einem direkten Aufruf, gleichgültig, welche Zerlegungsregeln es intern verwendet. Zum Einordnen (durchreichen oder welcher Fall) zerlegt der Starter den Rest zusätzlich selbst.

### Ersatz pro Shell

**PowerShell 7 und 5.1** (Funktion, in beiden Versionen gleich):

```powershell
function global:claude {
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File $env:TERMHUB_STARTER @args
}
```

`@args` übergibt die Argumente so, wie PowerShell sie bei einem direkten Aufruf an `claude.exe` übergeben würde; die Tests bestätigen das für alle Fälle.

**cmd** (doskey-Makro, ruft `powershell.exe` direkt auf, ohne Batch-Datei):

```bat
doskey claude="%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%TERMHUB_STARTER%" $*
```

`$*` ist der rohe Rest der getippten Zeile. cmd verarbeitet die eingesetzte Zeile danach genau wie einen direkten Aufruf (`%…%`, `^`, `&`, Umleitungen).

**Git Bash** (Funktion):

```bash
__termhub_starter() {
    "$__termhub_powershell" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "$TERMHUB_STARTER" "$@"
}
claude() { __termhub_starter "$@"; }
```

MSYS baut die Befehlszeile für `powershell.exe` mit demselben Quoting und derselben Pfadumwandlung wie für `claude.exe`.

### Robust laden

| Shell | Start durch TermHub | Profil |
|---|---|---|
| PowerShell 7 / 5.1 | `pwsh.exe\|powershell.exe -NoLogo -NoProfile -NoExit -EncodedCommand <integration.ps1, UTF-16LE, Base64>` | Die Integration lädt die vier Profile (`$PROFILE.AllUsersAllHosts` … `CurrentUserCurrentHost`) selbst per Dot-Sourcing im globalen Bereich, Fehler werden angezeigt, die Shell bleibt benutzbar. |
| cmd | `cmd.exe /s /k ""<…>\integration.cmd""` (ohne `/d`) | AutoRun läuft wie gewohnt vor `/k`. |
| Git Bash | `bash.exe --rcfile <…>/integration.bash -i` | Die Startdatei lädt, was eine Login-Shell von Git Bash lädt: `/etc/profile`, dann die erste vorhandene von `~/.bash_profile`, `~/.bash_login`, `~/.profile`, sonst `~/.bashrc`. |

Umgebung jedes Terminals (zusätzlich zu Spezifikation): `TERMHUB_STARTER` mit dem vollen Pfad zu `starter.ps1`. Fehlt sie, definiert keine Integration den Ersatz. So kann TermHub den Ersatz abschalten, etwa wenn eine Gruppenrichtlinie `-File` blockiert (siehe [Offene Punkte](#offene-punkte)).

Alle mitgelieferten Skripte sind reines ASCII.

### Startbefehl

Der Startbefehl ruft den Starter direkt auf, nicht das Wort `claude`:

| Shell | Übergabe | Beispiel für „Starter mit `--resume x`“ |
|---|---|---|
| PowerShell | Umgebungsvariable `TERMHUB_START_CMD`; die Integration entfernt sie und führt den Text einmal aus | `& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File $env:TERMHUB_STARTER --resume x` |
| cmd | in der `/k`-Zeile hinter der Integration: `/s /k ""<…>\integration.cmd" & <Startbefehl>"` | `"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%TERMHUB_STARTER%" --resume x` |
| Git Bash | Umgebungsvariable `TERMHUB_START_CMD`, wie bei PowerShell | `__termhub_starter --resume x` |

In cmd steht der Startbefehl bewusst **nicht** in `integration.cmd`: dort liefe er im Batch-Kontext, und `Ctrl+C` in Claude führte nach dem Ende zur Rückfrage „Batchvorgang abbrechen (J/N)?“. In der `/k`-Zeile läuft er wie eine getippte Zeile.

### Der Starter, Schritt für Schritt

1. **Echtes `claude` finden:** PATH-Ordner in ihrer Reihenfolge (wie die Shells), ohne den Ordner des Starters; pro Ordner `claude.exe` vor `claude.cmd`, `claude.ps1` nie. Sonst `claude wurde nicht gefunden` auf stderr und Exit-Code 1.
2. **Einordnen:** Rest zerlegen (Regeln siehe unten), dann:
   - durchreichen bei `-p`/`--print`, `-v`/`--version`, `-h`/`--help` (auch gebündelt, z.B. `-pc`) oder wenn das erste Positionsargument ein bekannter Unterbefehl ist;
   - Optionswerte werden übersprungen wie bei commander: `<x>` genau ein Wert, `<x...>` alle Werte bis zum nächsten `-…`, `[x]` der nächste Wert, falls er nicht mit `-` beginnt; `--opt=wert` und `-rWERT` werden erkannt; nach `--` folgen nur noch Positionsargumente;
   - Fälle: `withId` (`--resume <x>`, `-r <x>`, `--session-id <x>`), `withoutId` (`-c`, `--continue`, `--resume` ohne Wert, dazu `--from-pr` und `--teleport`), sonst `new`.
3. **`POST /claude/launch`** mit `HttpWebRequest`, `Proxy = $null`, `Timeout = 1000 ms`. Ohne `TERMHUB_API`/`TERMHUB_TAB_ID` oder bei Fehler: unverändert starten, nichts melden.
4. **Ergänzen:** `--settings <hookFile>` ausser bei eigenem `--settings`; im Fall `new` `--session-id <sessionId>` und, ohne eigenes `-n`/`--name`, `-n <tabName>`. Die Ergänzungen stehen **vor** den Argumenten des Nutzers (ein `--` des Nutzers bleibt so wirksam).
5. **Starten** mit `System.Diagnostics.Process` (`UseShellExecute = false`, keine Umleitung, also geerbte Konsole), Befehlszeile selbst gebaut (siehe unten), danach `POST /claude/started`.
6. **Warten**, `POST /claude/exit`, Exit-Code mit `exit` weitergeben.

Hilfen: `TERMHUB_STARTER_DEBUG=1` schreibt die gebaute Befehlszeile auf stderr, `TERMHUB_STARTER_DRYRUN=1` gibt nur die Einordnung als JSON aus.

### Schnittstelle (Vorschlag für Ticket 10)

Alle Anfragen `POST`, `Content-Type: application/json; charset=utf-8`, Kopfzeile `X-TermHub-Token`.

| Endpunkt | Anfrage | Antwort |
|---|---|---|
| `/claude/launch` | `{"tabId":"…","case":"new"\|"withId"\|"withoutId","sessionId":"x"\|null,"cwd":"C:\\…"}` | `{"tabName":"…","sessionId":"<neue Kennung, nur bei new>","hookFile":"C:\\…\\hooks.json"}` |
| `/claude/started` | `{"tabId":"…","pid":1234}` | leer |
| `/claude/exit` | `{"tabId":"…","sessionId":"x"\|null,"exitCode":0}` | leer |

`sessionId` im Ende: im Fall `new` die neu vergebene, im Fall `withId` die angegebene, sonst `null`. Bei `claude.cmd` ist `pid` die Prozess-ID des gestarteten `cmd.exe`; `node.exe` ist dessen Nachfahre.

## Quoting-Regeln

### Zerlegen

Gemessen mit dem nachgemachten `claude.exe`, das dieselbe Befehlszeile auf drei Arten zerlegt:

| Befehlszeile (Rest) | `CommandLineToArgvW` | C-Laufzeit ab 2008 (UCRT) | alte msvcrt |
|---|---|---|---|
| `"a""b" "c"` | `a"b c` | `a"b`, `c` | `a"b c` |
| `"a""b c"` | `a"b`, `c` | `a"b c` | `a"b`, `c` |
| `"say ""hi"""` | `say "hi"` | `say "hi"` | `say "hi"` |
| `a\\"b c"` | `a\b c` | `a\b c` | `a\b c` |
| `"a\"b"` | `a"b` | `a"b` | `a"b` |

`CommandLineToArgvW` folgt den **alten** msvcrt-Regeln. Node und, soweit bekannt, Bun (Zig) folgen der C-Laufzeit ab 2008. Unterschiede gibt es nur bei `""` innerhalb von Anführungszeichen. Daraus folgt:

- Der Starter zerlegt den Rest nach den Regeln ab 2008 (wie Claude selbst).
- Der Starter erzeugt beim Quoten **nie** `""` innerhalb von Anführungszeichen; dann ergeben alle Regelwerke dasselbe.
- Bei `claude.exe` wird der Rest gar nicht neu gequotet, sondern unverändert durchgereicht.

### Quoten für `claude.exe`

Nur die ergänzten Optionen werden gequotet, nach der Standardregel: in Anführungszeichen, wenn leer oder mit Leerraum bzw. `"`; `"` als `\"`; Backslashes vor `"` und am Ende verdoppeln.

### Quoten für `claude.cmd`

Eine Batch-Datei wertet cmd **zweimal** aus: einmal die Zeile für `/c`, dann noch einmal die Zeile in der Batch-Datei, in die `%*` eingesetzt wird (npm-Shim: `"%_prog%" "…\cli.js" %*`). Der Starter baut darum:

```
cmd.exe /d /v:off /s /c ""<claude.cmd>" "arg1" "arg2" …"
```

1. Jedes Argument in Anführungszeichen, gequotet nach der Standardregel (`\"`, Backslashes).
2. Danach wird die ganze Zeile für cmd abgesichert, mit Blick auf die Anführungszeichen-Zustände, die cmd selbst sieht (cmd kennt kein `\"` und wechselt bei jedem `"`):
   - `&|<>^()` ausserhalb von cmd-Anführungszeichen bekommen **drei** Caret: `^^^&` → nach der ersten Auswertung `^&` → nach der zweiten `&`.
   - Jedes `%` wird zu `%%cd:~,%`. `%cd:~,%` ergibt einen leeren Text, so entsteht in keiner der beiden Auswertungen ein `%NAME%`.
   - `/v:off` schaltet die verzögerte Erweiterung ab, `!` bleibt damit erhalten, auch wenn sie in der Registry eingeschaltet ist.
3. Zeilenumbrüche kann eine Batch-Datei nicht empfangen; der Starter bricht dann mit einer Meldung ab.

Die Tests bestätigen das für alle Testfälle über einen nachgemachten npm-Shim.

## Stolpersteine pro Shell

### Alle Shells: `powershell.exe` als Starter

- **`-EncodedCommand` nimmt keine weiteren Argumente an** („Der Befehl kann nicht verarbeitet werden, da ein Befehl bereits mit "-Command" oder "-EncodedCommand" angegeben wurde“). `-Command` würde die Argumente an den Code anhängen und als PowerShell ausführen. Bleibt nur `-File`.
- **`-File` bindet Argumente, die mit `-` beginnen, als Parameternamen des Skripts.** Ein Argument, das nur aus `-` besteht oder mit `-:` beginnt (leerer Name), bricht ab, bevor das Skript läuft: „Das Argument kann nicht verarbeitet werden, da der Wert des Arguments "name" ungültig ist“. Ein vorangestelltes `--` hilft nicht. PowerShell zählt auch `–`, `—` und `―` als Bindestrich. Alle anderen Fälle kommen an (geprüft: `-c`, `-Command`, `-p:1`, `--%`, `-?`, `-Verbose`, `$env:PATH`, leeres Argument, `--`, `-EncodedCommand`); der Starter liest ohnehin die rohe Zeile.
- **`[Environment]::Exit()` kostet in Windows PowerShell 5.1 rund 2,2 s**, `exit` rund 0,2 s. Gemessen: `powershell.exe -NoProfile -File` mit leerem Skript 0,3 s, ganzer Starter ohne TermHub 0,45 s, mit Stub 0,55 s.
- **Ctrl+C trifft auch den Starter.** `WaitForExit()` wird nicht unterbrochen, aber PowerShell merkt sich den Abbruch und bricht beim nächsten Aufruf einer Funktion oder eines Cmdlets ab, ausser innerhalb von `finally`. Ohne Vorsorge kam keine Ende-Meldung, und der Exit-Code war 0 statt 130. Lösung: Start, Meldungen und `exit` stehen im `try`/`finally`.
- **Execution Policy:** `-ExecutionPolicy Bypass` wirkt nur im Prozessbereich. Eine per Gruppenrichtlinie gesetzte Richtlinie (`MachinePolicy`/`UserPolicy` auf `AllSigned` oder `Restricted`) blockiert `-File` trotzdem.
- **Nach Ctrl+C verwerfen cmd und PowerShell vorab getippte Zeichen**, bis der Prompt wieder steht. Für Nutzer belanglos, für Tests wichtig: Unter Last ging die nächste getippte Zeile verloren, wenn der Test sie direkt nach der Ende-Meldung schickte. Die Tests warten darum auf den Prompt.
- **HTTP:** `HttpWebRequest` mit `Proxy = $null` und `Expect100Continue = $false` (sonst wartet .NET auf „100 Continue“). Eine nicht erreichbare Schnittstelle auf `127.0.0.1` kostet unter Windows wegen SYN-Wiederholungen bis zum Zeitlimit von 1 s; eine hängende Schnittstelle ebenfalls 1 s.

### PowerShell 7

- `$PSNativeCommandArgumentPassing = Windows`: Für `.exe` gilt „Standard“, für `.cmd` aber „Legacy“. Ein **direkter** Aufruf von `claude.cmd` verliert darum Anführungszeichen und leere Argumente, und `a&b` wird ungequotet an cmd gegeben, das dann `b` als Befehl ausführt (siehe Bericht unten). Der Ersatz liefert bei `claude.cmd` die Argumente, die ein `.exe` bekäme.
- Funktionen fangen `-?` ab und zeigen ihre eigene Hilfe; `claude` kennt `-?` nicht, das ist also folgenlos.
- `--%` (Stop-Parsing) wirkt nur bei nativen Programmen, nicht bei Funktionen. `claude --% …` verhält sich darum anders als `claude.exe --% …`. Bekannte Grenze.
- `pwsh.exe` aus dem Microsoft Store ist ein App-Ausführungsalias (`WindowsApps`). `fs.existsSync` liefert dafür `false`, `fs.lstatSync` funktioniert; node-pty startet ihn problemlos. Für die Shell-Erkennung (Ticket 06) wichtig.
- `$LASTEXITCODE` ist in einer neuen Sitzung `$null`.
- PSReadLine ist bereits geladen, wenn das Profil per `-EncodedCommand` läuft. Die Tests schalten damit den Verlauf ab, damit getippte Testzeilen nie im echten Verlauf landen.

### Windows PowerShell 5.1

- Die Legacy-Übergabe verfälscht auch direkte Aufrufe: `'say "hi"'` kommt als `say hi` an, `''` fällt weg, `'C:\Ordner\' 'x\"y'` wird zu **einem** Argument. Der Ersatz verhält sich genau gleich, wie es der Grundsatz verlangt. Er korrigiert nichts.
- Skripte ohne BOM liest 5.1 als ANSI. Die mitgelieferten Skripte sind reines ASCII.

### cmd

- doskey-Makros wirken nur am Anfang einer getippten Zeile, nicht in Skripten, nicht nach `&` und nicht in der `/k`-Zeile. Darum ruft der Startbefehl den Starter direkt auf.
- Der Startbefehl darf nicht in `integration.cmd` laufen (Batch-Kontext, Rückfrage nach `Ctrl+C`), er steht in der `/k`-Zeile.
- `integration.cmd` darf kein `echo off` enthalten: Sie läuft im interaktiven cmd, das würde den Prompt ausblenden. Batch-Dateien brauchen CRLF (`.gitattributes`).
- doskey wertet `$` in der Makro-Definition aus (`$T`, `$1`, …). Ein Pfad zum Starter mit `$` würde verfälscht. Bekannte Grenze.
- Eine ungerade Anzahl `"` in der Zeile lässt cmd den Rest der Zeile für gequotet halten: `&` trennt dann nicht mehr. Das gilt beim direkten Aufruf genauso.
- `%ERRORLEVEL%` in derselben Zeile wird vor dem Befehl ausgewertet. Der Test verwendet `call echo %^ERRORLEVEL%`.
- Der npm-Shim beendet den Batch-Kontext mit `goto #_undefined_#`, bevor node läuft. Darum gibt es auch bei `claude.cmd` keine Rückfrage nach `Ctrl+C`. Ein `claude.cmd` ohne diesen Trick würde nachfragen, auch beim direkten Aufruf.
- cmd sucht Programme auch im aktuellen Ordner, der Starter nicht.

### Git Bash

- **MSYS-Pfadumwandlung:** `/review` kommt als `C:/Program Files/Git/review` an, `/x/y` als `X:/y`. Das passiert beim direkten Aufruf genauso, der Ersatz bleibt gleich. Ein Prompt wie `claude "/review"` ist in Git Bash also schon heute verfälscht; abhelfen kann der Nutzer mit `MSYS_NO_PATHCONV=1`, das für beide Wege gilt.
- Eine Login-Shell (`bash --login`) ignoriert `--rcfile`. Die Startdatei lädt darum selbst, was eine Login-Shell lädt. Git for Windows legt eine `~/.bash_profile` an, wenn nur `~/.bashrc` existiert (`/etc/profile.d/bash_profile.sh`); das geschieht in normalem Git Bash genauso.
- `!` in doppelten Anführungszeichen löst in der interaktiven Bash die History-Erweiterung aus (direkt wie über den Ersatz); der Test verwendet `c\!`.
- `Ctrl+C` funktioniert ohne Besonderheiten: Bash wartet auf das native Kind, der Exit-Code 130 kommt in `$?` an.
- Die Startdatei braucht LF.

### Bericht: direkter Aufruf von `claude.cmd`

Mit `TH_REPORT=1 npm run test:shells -- -t Bericht` vergleicht der Test den direkten Aufruf des nachgemachten npm-Shims mit dem direkten Aufruf des `.exe` dahinter. Ein direkter Aufruf von `claude.cmd` ist in **jeder** Shell verlustbehaftet:

| Testfall | PowerShell 7 | PowerShell 5.1 | cmd | Git Bash |
|---|---|---|---|---|
| eingebettete Anführungszeichen | verloren | (wie beim `.exe`) | gleich | gleich |
| leeres Argument | fällt weg | (wie beim `.exe`) | gleich | gleich |
| `%PATH%` | wird ersetzt | wird ersetzt | gleich | wird ersetzt |
| `^` | fällt weg | fällt weg | `a^^b` → `ab` | fällt weg |
| `&` | Rest der Zeile wird als Befehl ausgeführt | ebenso | ebenso | ebenso |
| `!`, Umlaute, führender `/`, Prompt mit Leerzeichen | gleich | gleich | gleich | gleich |
| Backslash am Ende | `x\"y` → `x"y` | (wie beim `.exe`) | gleich | gleich |

Darum vergleichen die Tests bei `claude.cmd` den Ersatz mit dem direkten Aufruf des `.exe` in derselben Shell, also mit den Argumenten, die die Shell meint. Der Ersatz ist hier besser als der direkte Aufruf, nicht nur gleich.

## Testergebnisse pro Shell

Rechner: Windows 11 Pro 10.0.26200, Node 24.22.1, node-pty 1.1.0, Vitest 5.1.0. Aufruf: `npm run test:shells`.

| Shell | Version | Tests | Ergebnis | Dauer allein |
|---|---|---|---|---|
| PowerShell 7 | 7.7.0 (Microsoft Store) | 73 | alle grün | 187 s |
| Windows PowerShell | 5.1.26100.9711 | 73 | alle grün | 134 s |
| cmd | Windows 11 | 72 (+1 übersprungen: Profil) | alle grün | 174 s |
| Git Bash | Git 2.48.1, bash 5.2.37 | 73 | alle grün | 149 s |
| Einordnung ohne Shell | Windows PowerShell 5.1 | 42 | alle grün | 41 s |

Ganzer Lauf, alle Dateien parallel: **333 grün, 5 übersprungen** (der Profiltest in cmd und die vier Berichte, die nur mit `TH_REPORT=1` laufen), 185 s.

Was pro Shell geprüft wird (jeweils mit `claude.exe` und mit `claude.cmd`, sofern nicht anders vermerkt):

- **Integration laden:** Das Testprofil (PowerShell: `TERMHUB_TEST_PROFILE`, Git Bash: `~/.bashrc` im Test-HOME) ist geladen, danach ist `claude` der Ersatz. In cmd nicht automatisch prüfbar: das „Profil“ ist AutoRun in der Registry, und die Tests fassen die Registry nicht an.
- **Gleichheit der Argumente**, je Testfall `claude <Text>` gegen `<Programm> <Text>` in derselben Sitzung: eingebettete Anführungszeichen, leeres Argument, `%PATH%`, `^`, `&`, `!`, Umlaute, führender `/`, Prompt mit Leerzeichen, dazu Backslash am Ende. Geprüft: die ersten sechs Argumente sind genau `--settings <Hook-Datei> --session-id <Kennung> -n "Mein Tab äöü"`, der Rest ist gleich (nach `CommandLineToArgvW` und nach den Regeln ab 2008); bei `claude.exe` ist zusätzlich der rohe Rest Zeichen für Zeichen gleich. Der Starter liegt im Test in einem Ordner mit Leerzeichen und Umlauten, die Hook-Datei ebenso.
- **Ergänzen:** neu; `--resume x`; `-r x`; `--session-id <uuid>`; `-c`; `--resume` ohne Wert; `--resume --verbose`; `-n eigener`; `--name=eigener`; eigenes `--settings`; `--resume x` mit eigenem `--settings`; `--model mcp`. Jeweils die erwarteten argv und die `launch`-Anfrage (`tabId`, `case`, `sessionId`, `cwd`) mit richtigem Token.
- **Durchreichen ohne Anfrage:** `-p "hello world"`, `--print x`, `mcp list`, `--version`, `-v`, `--help`, `--model opus mcp list`; dazu, dass `--allowed-tools Read mcp` interaktiv ist.
- **Meldungen:** `launch`, `started` (bei `claude.exe` genau die Prozess-ID des Stubs), `exit` mit Kennung (neu, `--resume x`) bzw. `null` (`-c`); Exit-Code 3 kommt in der Shell (`$LASTEXITCODE`, `%ERRORLEVEL%`, `$?`) und in der Meldung an; nach `Ctrl+C` kommt `exit` mit 130, der Exit-Code 130 in der Shell, keine Rückfrage „Batchvorgang abbrechen“, und die Shell ist danach weiter benutzbar.
- **Ohne TermHub** (nur `claude.exe`): Schnittstelle nicht erreichbar → unverändert, Exit-Code wird weitergegeben; Schnittstelle antwortet nie → unverändert nach etwa 1 s; kein `claude` im PATH → „claude wurde nicht gefunden“, Exit-Code 1, keine Anfrage.
- **Startbefehl** „Starter mit `--resume x`“: erreicht `claude` genau einmal mit `--settings <Hook-Datei> --resume x`, auch nach weiteren Prompts.

Die Tests setzen die Umgebung ausdrücklich (`TERMHUB_*` entfernt, PATH nur mit Systemordnern und Stub, eigenes HOME, eigenes Testprofil, PSReadLine-Verlauf abgeschaltet), sprechen also nie eine laufende TermHub-Instanz und nie ein echtes `claude` an. Nach jeder Testdatei werden alle Prozesse beendet, deren Befehlszeile den Temp-Ordner enthält, und der Ordner wird gelöscht.

## Korrekturen an der Spezifikation

Vorschläge für `docs/specs/termhub-v2.md` und die Tickets 07, 10, 11 und 12:

1. **Wie der Starter die Argumente bekommt** (Shell-Integration, Punkt 2) ergänzen: Jeder Ersatz ruft `powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File <starter.ps1>` mit den Argumenten auf, die die Shell auch `claude.exe` gäbe. Der Starter liest den Rest seiner Befehlszeile roh aus `[Environment]::CommandLine`, nicht `$args`. Nur so gilt der Grundsatz „dieselben Argumente wie direkt“ in allen vier Shells (5.1-Legacy, MSYS-Pfadumwandlung, cmd-Auswertung).
2. **Schritt 5, „nach den Regeln von `CommandLineToArgvW`“** präzisieren: `CommandLineToArgvW` folgt den alten msvcrt-Regeln, Claude (Bun bzw. Node) der C-Laufzeit ab 2008; sie unterscheiden sich bei `""` innerhalb von Anführungszeichen. Der Starter reicht bei `claude.exe` den Rest der Befehlszeile **unverändert** durch und setzt nur die ergänzten Optionen davor; er quotet nie `""` innerhalb von Anführungszeichen.
3. **Schritt 5, `cmd.exe /d /s /c`** → `cmd.exe /d /v:off /s /c ""<claude.cmd>" …"`, jedes Argument in Anführungszeichen, `&|<>^()` ausserhalb von cmd-Anführungszeichen mit drei Caret, `%` als `%%cd:~,%` (zwei Auswertungen: `/c` und `%*` in der Batch-Datei). Zeilenumbrüche in Argumenten sind bei `claude.cmd` nicht möglich.
4. **Teststelle 2 und Ticket 11, „`-n eigener` erhält nur `--settings`“** widerspricht Schritt 4: `claude -n eigener` ist Fall „neu“ und erhält `--settings` **und** `--session-id`, nur kein zweites `-n`. Ohne `--session-id` fehlte das Sicherheitsnetz beim Fortsetzen. Ebenso „ein eigenes `--settings` bleibt allein“: kein zweites `--settings`, im Fall „neu“ aber trotzdem `--session-id` und `-n`.
5. **Optionswerte überspringen** ausdrücklich wie commander beschreiben: `<x>` genau ein Wert, `<x...>` alle Werte bis zum nächsten `-…`, `[x]` der nächste Wert, falls er nicht mit `-` beginnt; dazu `--opt=wert`, `-rWERT` und gebündelte Kurzformen (`-pc`). Folge: `claude --debug mcp list` ist interaktiv (`--debug` verbraucht `mcp`), ebenso `claude --add-dir a mcp`.
6. **Fälle ergänzen:** `--from-pr` und `--teleport` setzen eine bestehende Session fort, deren Kennung der Starter nicht kennt → Fall „ohne Kennung“ (umgesetzt). Weitere neue Optionen in 2.1.328 entscheiden (nicht umgesetzt): `--bg`/`--background` (kehrt sofort zurück, wohl durchreichen), `--desktop`, `--cloud`, `--remote-control`, und `--fork-session` mit `--resume x` (die neue Session hat nicht die Kennung `x`; „ohne Kennung“ oder eigene `--session-id` vergeben).
7. **Schritt 1** präzisieren: PATH-Ordner in ihrer Reihenfolge, pro Ordner `claude.exe` vor `claude.cmd` (so wie die Shells suchen); der aktuelle Ordner wird nicht durchsucht.
8. **Prozess-ID** (`/claude/started`): bei `claude.cmd` die Prozess-ID des gestarteten `cmd.exe`, nicht die von node. Für die Prozess-Regeln passt das, weil node ein Nachfahre ist.
9. **Git Bash laden:** statt „eigene Startdatei, die zuerst `~/.bashrc` lädt“ besser „lädt, was eine Login-Shell von Git Bash lädt“ (`/etc/profile`, dann `~/.bash_profile` | `~/.bash_login` | `~/.profile`, sonst `~/.bashrc`). Git Bash läuft normalerweise als Login-Shell; ohne `/etc/profile` fehlen Prompt und PATH-Einträge.
10. **Startbefehl (Punkt 3)** pro Shell festlegen: PowerShell und Git Bash über `TERMHUB_START_CMD` (die Integration entfernt die Variable vor dem Ausführen, so läuft er genau einmal, auch in verschachtelten Shells nicht noch einmal); cmd in der `/k`-Zeile hinter der Integration, nicht in der Integrationsdatei (Batch-Kontext → Rückfrage nach `Ctrl+C`).
11. **Umgebung jedes Terminals** um `TERMHUB_STARTER` (voller Pfad zu `starter.ps1`) ergänzen. Ohne die Variable definiert keine Integration den Ersatz.
12. **Robust laden / Execution Policy:** `-EncodedCommand` taugt nur für die Integration, nicht für den Starter (keine Zusatzargumente). Der Starter läuft per `-File` mit `-ExecutionPolicy Bypass`; das blockiert nur eine Gruppenrichtlinie. TermHub sollte das einmal beim Start prüfen (`powershell.exe -NoProfile -Command "Get-ExecutionPolicy -Scope MachinePolicy; Get-ExecutionPolicy -Scope UserPolicy"`) und bei `AllSigned`/`Restricted` `TERMHUB_STARTER` weglassen: dann läuft `claude` direkt, ohne Erfassung.
13. **Bekannte Grenzen ergänzen:** ein Argument, das nur aus `-` besteht oder mit `-:` beginnt, lässt `powershell.exe -File` abbrechen; `claude --% …` in PowerShell (Stop-Parsing wirkt bei Funktionen nicht); ein Starterpfad mit `$` (doskey); Zeilenumbrüche in Argumenten bei `claude.cmd`; in Git Bash gilt die MSYS-Pfadumwandlung auch für Prompts (`/review`).
14. **Schnittstelle:** Feldnamen wie im Abschnitt [Schnittstelle](#schnittstelle-vorschlag-für-ticket-10) festlegen (`tabId`, `case`, `sessionId`, `cwd`; Antwort `tabName`, `sessionId`, `hookFile`; `pid`; `exitCode`).

## Offene Punkte

- **Echtes Claude Code:** Geprüft ist alles mit dem nachgemachten `claude`. Offen für die Abnahme von Hand: `Ctrl+C` im Rohmodus von Claude (Claude liest `Ctrl+C` dann als Taste, nicht als Signal; der Starter wartet in jedem Fall, bis Claude endet), `/exit`, `-n` mit Umlauten in Claudes `/resume`-Liste.
- **Zerlegung in Bun:** dass `claude.exe` (Bun) nach den Regeln ab 2008 zerlegt, ist nicht geprüft. Für die Gleichheit spielt es keine Rolle, weil der Rest unverändert durchgereicht wird; nur die Einordnung könnte bei `""` in Anführungszeichen abweichen.
- **Gruppenrichtlinie und Constrained Language Mode:** nicht automatisch getestet. Die PowerShell-Integration definiert den Ersatz nur in `FullLanguage`. Läuft der Starter selbst im Constrained Language Mode (WDAC/AppLocker), scheitern `System.Diagnostics.Process` und `HttpWebRequest`; ein Rückfall auf `& $claude @argv` ist nicht umgesetzt. Die Prüfung der Execution Policy (Korrektur 12) gehört ins Terminal-Backend.
- **Argument `-` allein** und `-:…` (siehe Stolpersteine): in PowerShell und Git Bash könnte der Ersatz solche Aufrufe erkennen und an `claude` direkt geben (ohne Erfassung); in cmd geht das nicht. Nicht umgesetzt, weil `claude` keine solchen Argumente kennt.
- **Startzeit:** Jeder Start über den Ersatz kostet rund 0,5 s für `powershell.exe` plus die Anfrage an TermHub.
- **Laufzeit der Tests:** rund 2,5 bis 3 Minuten pro Shell, die Shells laufen parallel. Die Shell-Dateien teilen sich pro Datei einige Sitzungen; ein Fehler mitten in einer Sitzung kann Folgefehler auslösen.
- **Einbindung:** `buildLaunch` in `test/shells/harness.ts` ist die Vorlage für das Terminal-Backend (Ticket 07/11); `resources/shell` muss im Paket ausserhalb des asar-Archivs liegen (`extraResources`). Umgesetzt mit Ticket 07 in `src/main/shellLaunch.ts`; die Tests starten die Shells seither über das echte Terminal-Backend (`buildStart` und `PtyManager`).
- **node-pty `kill()`** startet einen Hilfsprozess, der bei schon beendeter Shell „AttachConsole failed“ auf stderr schreibt. Die Tests beenden Shells darum zuerst mit `exit`. Für das Terminal-Backend beachten.
