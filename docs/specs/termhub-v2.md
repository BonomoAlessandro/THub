# THub 2: Tabs, Claude-Sessions, die einen Neustart überleben, und neuer Look

> Status: `ready-for-agent`
> Entstanden aus einer Befragung am 2026-11-19, danach durch ein Review präzisiert (siehe „Präzisierungen nach dem Review“ am Ende). Grundlage ist das bestehende Electron-Grundgerüst (Stand 0.1.0). Umsetzung in Tickets: [docs/tickets](../tickets/README.md).

> **Name:** Die App heisst **THub** (bis 2026-11-19 „TermHub“). Datenordner `%APPDATA%\THub`, in der Entwicklung `%APPDATA%\THub-dev`. Umsetzung des Namenswechsels: Ticket 20.

## Problemstellung

Ich arbeite den ganzen Tag mit mehreren Terminals gleichzeitig, und in vielen davon läuft eine Claude-Code-Session für ein bestimmtes Projekt. Heute ist das mühsam:

- Jedes Terminal muss ich von Hand in den richtigen Projektordner bringen.
- Bei vielen offenen Fenstern weiss ich nicht mehr, welches Terminal wofür ist.
- Nach einem Neustart (der App oder des Rechners) ist alles weg. Ich muss jedes Terminal neu öffnen, in den Ordner wechseln und jede Claude-Session einzeln über `claude --resume` wiederfinden.
- Ich sehe nicht, in welchem Terminal Claude gerade arbeitet, auf meine Bestätigung wartet oder längst fertig ist. Ich muss durch alle Terminals klicken.

Das Grundgerüst von THub kann benannte Terminals öffnen und nach einem Neustart in ihrem Startordner neu starten. Es weiss aber nichts von Claude, merkt sich weder den letzten Ordner noch den Inhalt, kennt nur Windows PowerShell 5 und sieht noch wie ein Entwurf aus.

## Lösung

THub wird zu einem modernen Terminal-Fenster mit Tabs, das Claude-Code-Sessions versteht:

- **Tabs oben in einer eigenen Titelleiste.** `+` öffnet sofort ein Terminal im optionalen Standardordner. Über ein Pfeil-Menü wählst du eine andere Shell oder „Neues Terminal in …“ mit den zuletzt benutzten Ordnern.
- **Tabs benennen sich selbst nach ihrem Ordner** und lassen sich jederzeit umbenennen.
- **Claude startest du wie gewohnt mit `claude`.** THub erkennt das von selbst, ohne Knopf und ohne Einrichtung, und zeigt am Tab, ob Claude arbeitet, auf dich wartet, fertig ist oder ob noch Prozesse laufen.
- **Nach einem Neustart ist alles wieder da:** Normale Terminals starten im zuletzt aktiven Ordner und zeigen ihren früheren Inhalt ausgegraut als Verlauf. Claude-Sessions werden direkt fortgesetzt, die zuletzt aktive sofort, die übrigen beim ersten Anklicken.
- **Hinweise unten rechts im Fenster** melden, wenn Claude in einem Tab, den du gerade nicht siehst, auf dich wartet oder fertig wird, und zeigen offene Fragen oder Punkte am Ende von Claudes Antworten, bis du sie wegklickst.
- **Einfache Bedienung:** Maus, die bekannten Tastenkürzel und eine Befehlspalette (`Ctrl+Shift+P`).
- **Moderner Look:** eigene Titelleiste, deckender Hintergrund, hell und dunkel nach Windows, Stil wie Warp, Linear oder Raycast, ohne Akzentfarbe.
- **Funktioniert auf jedem Rechner direkt nach der Installation.** Deine Claude-Konfiguration wird nicht verändert.

## User Stories

### Terminals öffnen

1. Als Nutzer möchte ich mit einem Klick auf `+` oder mit `Ctrl+Shift+T` sofort ein neues Terminal bekommen, damit ich ohne Umweg loslegen kann.
2. Als Nutzer möchte ich einen optionalen Standardordner festlegen, damit neue Terminals direkt in meinem Arbeitsordner starten.
3. Als Nutzer möchte ich, dass ohne festgelegten Standardordner mein Benutzerordner gilt, damit THub auch ohne jede Einstellung funktioniert.
4. Als Nutzer möchte ich über „Neues Terminal in …“ einen der zuletzt benutzten Ordner wählen, damit ich mit zwei Klicks in einem anderen Projekt starte, ohne den Standardordner umzustellen.
5. Als Nutzer möchte ich in „Neues Terminal in …“ auch einen beliebigen Ordner über einen Ordner-Dialog wählen können, damit ich nicht auf die Liste beschränkt bin.
6. Als Nutzer möchte ich, dass THub die auf meinem Rechner installierten Shells selbst erkennt, damit ich nichts von Hand eintragen muss.
7. Als Nutzer möchte ich, dass PowerShell 7 die Standard-Shell ist, wenn sie installiert ist, damit ich die moderne PowerShell bekomme.
8. Als Nutzer möchte ich beim Anlegen eines Tabs über das Pfeil-Menü eine andere Shell wählen (Windows PowerShell, cmd, Git Bash, WSL), damit ich für jede Aufgabe die passende Shell habe.
9. Als Nutzer möchte ich, dass ein Tab seine Shell auch nach einem Neustart behält, damit eine Git-Bash-Session nicht plötzlich eine PowerShell ist.
10. Als Nutzer möchte ich, dass neue Tabs rechts neben dem aktiven Tab erscheinen, damit zusammengehörige Tabs nebeneinander bleiben.
11. Als Nutzer möchte ich, dass meine PowerShell-, Bash- und cmd-Profile wie gewohnt geladen werden, damit mein Prompt, meine Aliase und Module auch in THub funktionieren.

### Tabs benennen und ordnen

12. Als Nutzer möchte ich, dass ein neuer Tab automatisch wie sein Ordner heisst, damit ich ohne Umbenennen sehe, wofür er ist.
13. Als Nutzer möchte ich, dass ein zweiter Tab im selben Ordner „termhub 2“ heisst, damit Namen eindeutig bleiben.
14. Als Nutzer möchte ich einen Tab per Doppelklick, `F2` oder über das Rechtsklick-Menü umbenennen, damit ich ihm einen sprechenden Namen geben kann.
15. Als Nutzer möchte ich, dass ein von mir vergebener Name nie automatisch überschrieben wird, damit meine Ordnung erhalten bleibt.
16. Als Nutzer möchte ich Tabs per Ziehen umsortieren, damit ich sie in meiner Reihenfolge habe.
17. Als Nutzer möchte ich beim Überfahren eines Tabs den vollen Namen, den aktuellen Ordner und die Shell sehen, damit ich auch bei gekürzten Namen Bescheid weiss.
18. Als Nutzer möchte ich, dass bei sehr vielen Tabs die Tabs schmaler werden und die Leiste scrollbar wird, damit nichts aus dem Fenster fällt.
19. Als Nutzer möchte ich mit `Ctrl+Tab` / `Ctrl+Shift+Tab`, `Ctrl+PageDown` / `Ctrl+PageUp` und `Ctrl+1` … `Ctrl+9` zwischen Tabs wechseln, damit ich die Hände an der Tastatur behalte.

### Rechtsklick-Menü am Tab

20. Als Nutzer möchte ich einen Tab über das Rechtsklick-Menü duplizieren, damit ich schnell ein zweites Terminal im selben Ordner mit derselben Shell bekomme.
21. Als Nutzer möchte ich den Ordner eines Tabs über das Rechtsklick-Menü im Explorer öffnen, damit ich schnell an die Dateien komme.
22. Als Nutzer möchte ich den Pfad eines Tabs über das Rechtsklick-Menü kopieren, damit ich ihn woanders einfügen kann.
23. Als Nutzer möchte ich über das Rechtsklick-Menü einen Tab oder alle anderen Tabs schliessen, damit ich schnell aufräumen kann.

### Schliessen und wieder öffnen

24. Als Nutzer möchte ich, dass ein ruhender Tab ohne Rückfrage schliesst, damit Aufräumen schnell geht.
25. Als Nutzer möchte ich eine Rückfrage bekommen, wenn im Tab noch etwas läuft (Claude arbeitet, wartet auf mich oder ein Programm läuft), damit ich nichts versehentlich abbreche.
26. Als Nutzer möchte ich beim Schliessen mehrerer Tabs („Andere Tabs schliessen“) höchstens eine gemeinsame Rückfrage bekommen, die die betroffenen Tabs nennt, damit ich nicht zehnmal klicken muss.
27. Als Nutzer möchte ich einen versehentlich geschlossenen Tab mit `Ctrl+Shift+Z` oder über „Zuletzt geschlossen“ in der Befehlspalette wieder öffnen, mit Name, Ordner, Shell und Verlauf, damit ein Fehlklick nichts kostet.
28. Als Nutzer möchte ich, dass beim Wiederöffnen eines Claude-Tabs dessen Claude-Session fortgesetzt wird, damit ich nahtlos weitermachen kann.
29. Als Nutzer möchte ich, dass sich THub die letzten zehn geschlossenen Tabs auch über einen Neustart hinweg merkt, damit das Wiederöffnen auch morgen noch geht.

### Claude erkennen

30. Als Nutzer möchte ich Claude wie gewohnt mit `claude` im Terminal starten, ohne einen speziellen Knopf, damit sich meine Arbeitsweise nicht ändert.
31. Als Nutzer möchte ich, dass THub automatisch erkennt, dass in einem Tab Claude läuft, damit Status und Wiederherstellen ohne mein Zutun funktionieren.
32. Als Nutzer möchte ich, dass die Zuordnung auch nach `/clear`, `/resume` oder `/compact` innerhalb von Claude stimmt, damit nach einem Neustart die richtige Session zurückkommt.
33. Als Nutzer möchte ich, dass THub den Tab-Namen als Claude-Session-Namen mitgibt, damit ich die Session auch in Claudes eigener `/resume`-Liste unter diesem Namen finde.
34. Als Nutzer möchte ich, dass THub nichts ergänzt, wenn ich selbst einen Namen oder eine Session angebe (`-n`, `--resume`, `--continue`, `--session-id`), damit meine eigenen Angaben gelten.
35. Als Nutzer möchte ich, dass Claude-Unterbefehle und nicht-interaktive Aufrufe (zum Beispiel `claude mcp list`, `claude -p "…"`, `claude --version`) unverändert durchgereicht werden und den Tab nicht zu einem Claude-Tab machen, damit Hilfsaufrufe nicht als Session gelten.
36. Als Nutzer möchte ich, dass THub meine globale Claude-Konfiguration nicht verändert, damit Claude-Sessions ausserhalb von THub unberührt bleiben.
37. Als Nutzer möchte ich, dass die Claude-Erkennung auf einem anderen Rechner direkt nach der Installation funktioniert, ohne Einrichtung und ohne Rückfrage, damit ich THub einfach mitnehmen kann.
38. Als Nutzer möchte ich, dass das Fortsetzen auch dann funktioniert, wenn eine Firmenrichtlinie Hooks sperrt, damit mir zumindest das Wichtigste bleibt (nur die Statusanzeige fehlt dann).
39. Als Nutzer möchte ich, dass THub ohne installiertes Claude Code ganz normal als Terminal funktioniert, damit es auch auf Rechnern ohne Claude nützlich ist.
40. Als Nutzer möchte ich, dass ein Tab nach dem Beenden von Claude (`/exit`, `Ctrl+C`) als normales Terminal im selben Ordner offen bleibt, damit ich direkt weiterarbeiten kann.

### Status am Tab

41. Als Nutzer möchte ich an einem animierten violetten Kreis sehen, dass Claude gerade arbeitet (eine Antwort schreibt oder dabei Befehle ausführt), damit ich weiss, dass ich warten kann.
42. Als Nutzer möchte ich an einem pulsierenden orangen Punkt sehen, dass Claude auf meine Bestätigung oder Antwort wartet, damit Claude nicht unnötig stillsteht.
43. Als Nutzer möchte ich an einem blauen Punkt sehen, dass Claude ruht, aber im Terminal noch Prozesse laufen (zum Beispiel ein Dev-Server, den Claude im Hintergrund gestartet hat), damit ich weiss, dass dort noch etwas aktiv ist.
44. Als Nutzer möchte ich an einem grünen Punkt sehen, dass Claude in einem Tab fertig geworden ist, den ich noch nicht angeschaut habe, damit ich keine fertige Arbeit übersehe.
45. Als Nutzer möchte ich, dass der grüne Punkt verschwindet, sobald ich den Tab öffne, damit er nur Neues anzeigt.
46. Als Nutzer möchte ich an einem grauen Pause-Symbol sehen, dass eine Claude-Session nach dem Neustart noch nicht fortgesetzt wurde, damit ich weiss, warum dort noch nichts läuft.
47. Als Nutzer möchte ich, dass ein ruhender Tab ohne laufende Prozesse kein Symbol zeigt, damit die Tab-Leiste ruhig bleibt.
48. Als Nutzer möchte ich, dass auch normale Tabs einen blauen Punkt zeigen, solange darin ein Programm läuft (Build, `npm run dev`), damit ich vor dem Schliessen sehe, wo noch etwas läuft.

### Hinweise im Fenster

49. Als Nutzer möchte ich unten rechts im THub-Fenster einen Hinweis bekommen, wenn Claude in einem Tab, den ich gerade nicht sehe, auf mich wartet oder fertig wird, damit ich reagieren kann, ohne alle Tabs zu prüfen.
50. Als Nutzer möchte ich mit einem Klick auf den Hinweis direkt in den betroffenen Tab springen, damit ich sofort weitermachen kann.
51. Als Nutzer möchte ich, dass „Fertig“-Hinweise nach etwa sechs Sekunden verschwinden, der Countdown aber erst läuft, wenn THub im Vordergrund ist, damit ich nichts verpasse, während ich in einem anderen Programm bin.
52. Als Nutzer möchte ich, dass „Wartet auf dich“-Hinweise stehen bleiben, bis ich den Tab öffne oder Claude dort wieder arbeitet, damit eine offene Frage nicht untergeht.
53. Als Nutzer möchte ich, dass sich mehrere Hinweise stapeln, damit ich alle sehe.
54. Als Nutzer möchte ich die Hinweise in den Einstellungen abschalten können, damit mich THub nicht stört, wenn ich das nicht will.
55. Als Nutzer möchte ich keine Windows-Benachrichtigungen und kein Blinken in der Taskleiste, damit THub mein System nicht zumüllt.

### Wiederherstellen nach einem Neustart

56. Als Nutzer möchte ich, dass beim Start von THub alle Tabs in ihrer Reihenfolge, mit Namen und Shell wieder da sind und der zuletzt aktive Tab angezeigt wird, damit ich dort weitermache, wo ich aufgehört habe.
57. Als Nutzer möchte ich, dass ein normales Terminal im zuletzt aktiven Ordner startet (auch wenn ich dorthin mit `cd` gewechselt bin), damit ich nicht wieder navigieren muss.
58. Als Nutzer möchte ich, dass der frühere Inhalt eines normalen Terminals ausgegraut als Verlauf über der neuen Eingabezeile steht, mit einer Trennlinie und dem Zeitpunkt, damit ich sehe, was ich zuletzt getan habe.
59. Als Nutzer möchte ich, dass ein Claude-Tab keinen alten Verlauf zeigt, sondern die Claude-Session direkt fortsetzt, damit ich sofort im Gespräch bin.
60. Als Nutzer möchte ich, dass die zuletzt aktive Claude-Session sofort und die übrigen erst beim ersten Anklicken fortgesetzt werden, damit THub schnell startet und nicht unnötig Speicher belegt.
61. Als Nutzer möchte ich, dass eine Claude-Session in dem Ordner fortgesetzt wird, in dem sie gestartet wurde, damit Claude im richtigen Projekt arbeitet.
62. Als Nutzer möchte ich, dass Claude nach dem Fortsetzen ebenfalls in der Shell läuft, damit ich nach dem Beenden wieder in der Shell bin.
63. Als Nutzer möchte ich einen verständlichen Hinweis im Tab und eine normale Shell im Ordner bekommen, wenn eine Claude-Session nicht fortgesetzt werden kann, damit ich nicht vor einem toten Tab sitze.
64. Als Nutzer möchte ich, dass ein Tab, in dem ich Claude vor dem Beenden von THub beendet hatte, als normales Terminal zurückkommt, damit keine alte Session ungefragt wieder aufgeht.
65. Als Nutzer möchte ich, dass ein nicht mehr existierender Ordner auf den Standardordner bzw. den Benutzerordner zurückfällt, damit der Tab trotzdem startet.
66. Als Nutzer möchte ich, dass der Inhalt meiner Terminals auch nach einem Absturz von THub weitgehend erhalten ist, damit ein Absturz nicht alles kostet.

### Fenster

67. Als Nutzer möchte ich, dass sich THub Grösse, Position und den Maximiert-Zustand des Fensters merkt, damit es immer so aufgeht, wie ich es eingerichtet habe.
68. Als Nutzer möchte ich, dass ein zweiter Start von THub einfach das bestehende Fenster nach vorne holt, damit nie zwei Instanzen dieselben Sessions fortsetzen.
69. Als Nutzer möchte ich die Fensterknöpfe von Windows 11 inklusive Andock-Layouts beim Überfahren von „Maximieren“ behalten, damit sich das Fenster wie jede andere App bedienen lässt.

### Befehlspalette und Tastenkürzel

70. Als Nutzer möchte ich mit `Ctrl+Shift+P` eine Befehlspalette öffnen und durch Tippen eines Namens zu einem Tab springen, damit ich auch bei vielen Tabs sofort finde, was ich suche.
71. Als Nutzer möchte ich in der Befehlspalette Befehle finden (Neues Terminal, Neues Terminal in …, Umbenennen, Schliessen, Zuletzt geschlossen, Einstellungen, Standardordner ändern), damit ich keine Tastenkürzel auswendig lernen muss.
72. Als Nutzer möchte ich, dass `Ctrl+K` in Claude und in den Shells weiterhin funktioniert, damit THub meine gewohnten Tasten nicht stiehlt.
73. Als Nutzer möchte ich mit `Ctrl+Shift+C` / `Ctrl+Shift+V` und mit Rechtsklick im Terminal kopieren und einfügen, damit das wie gewohnt funktioniert.
74. Als Nutzer möchte ich die Terminal-Schriftgrösse mit `Ctrl` + Mausrad oder `Ctrl` `+` / `Ctrl` `-` ändern, damit ich sie schnell anpassen kann.

### Einstellungen und Aussehen

75. Als Nutzer möchte ich über das Zahnrad einen Einstellungsdialog öffnen mit Standardordner, Standard-Shell, Design (System / Hell / Dunkel), Terminal-Schriftgrösse und Hinweisen an/aus, damit ich alles Nötige an einem Ort finde.
76. Als Nutzer möchte ich, dass THub standardmässig dem hellen oder dunklen Design von Windows folgt und bei einem Wechsel sofort mitzieht, damit es zu meinem System passt.
77. Als Nutzer möchte ich, dass auch die Terminalfläche dem Design folgt (im hellen Modus hell, mit passendem Farbschema), damit THub aus einem Guss wirkt.
78. Als Nutzer möchte ich eine moderne Oberfläche mit eigener Titelleiste, deckendem Hintergrund, abgerundeten Ecken, neutraler Hervorhebung ohne Akzentfarbe und dezenten Animationen, damit ich gern damit arbeite.
79. Als Nutzer möchte ich, dass eine Änderung des Standardordners nur für neue Tabs gilt, damit meine offenen Tabs nicht durcheinanderkommen.

### Offene Punkte aus Claudes Antworten

80. Als Nutzer möchte ich, dass offene Fragen oder Punkte am Ende einer Antwort von Claude als Hinweis unten rechts erscheinen, damit sie nicht in einer langen Antwort untergehen.
81. Als Nutzer möchte ich, dass dieser Hinweis stehen bleibt, bis ich ihn schliesse, auch über einen Neustart hinweg und auch im gerade sichtbaren Tab, damit ich nichts vergesse.
82. Als Nutzer möchte ich diese Hinweise in den Einstellungen abschalten können, damit mich THub nicht stört, wenn ich das nicht will.

## Implementierungsentscheidungen

### Architektur im Überblick

- Der Hauptprozess bleibt die **einzige Quelle der Wahrheit** für den Zustand. Der Renderer zeigt an und schickt Befehle über IPC.
- Neu entsteht ein **Workspace-Kern** im Hauptprozess, ein tiefes Modul, das die gesamte Tab-Logik besitzt: Tabs anlegen, umbenennen, schliessen, wieder öffnen, verschieben, aktivieren; Wiederherstellen beim Start; Erkennung des aktuellen Ordners; Claude-Erkennung und Status; Hinweise; Verlauf geschlossener Tabs; zuletzt benutzte Ordner; Einstellungen; Fensterangaben. Die heutige Logik in den IPC-Handlern und im Renderer wandert in diesen Kern.
- Der Workspace-Kern hängt nur über schmale **Ports** von der Aussenwelt ab, die im Betrieb echt und im Test nachgemacht sind:
  - **Terminal-Backend**: Shell starten (Programm, Argumente, Ordner, Umgebung, Grösse), schreiben, Grösse ändern, beenden; meldet die rohe Ausgabe in Stücken, das Ende und die Prozess-ID.
  - **Speicher**: Zustand laden und speichern, Verlauf pro Tab laden, speichern und löschen.
  - **Uhr**: Zeitstempel und Zeitgeber (Countdown der Hinweise, periodisches Sichern, Abfrage der Prozess-Sonde).
  - **Prozess-Sonde**: liefert in **einer** Abfrage alle Prozesse mit Prozess-ID, Eltern-ID, Programmname und Startzeit (und für verwaiste Git-Bash-Prozesse den Konsolen-Host).
  - **System**: ob ein Ordner existiert, Benutzerordner und Benutzername, angeschlossene Bildschirme.
- **Eingänge** in den Kern: Befehle aus dem Renderer (darunter „Ansicht des Tabs bereit“ mit Spalten und Zeilen, angezeigter Tab, Fenster im Vordergrund ja/nein), Ausgabe und Ende aus dem Terminal-Backend (der Kern erkennt darin die Ordner-Meldungen der Shell), Meldungen des `claude`-Starters, Claude-Hook-Ereignisse und Prozess-Schnappschüsse.
- **Ausgänge**: der Zustand an den Renderer (vollständiger Schnappschuss beim Laden, danach Änderungsereignisse: Tabs, Status, Hinweise, Einstellungen), Startaufträge an das Terminal-Backend, Verlauf zum Wiederherstellen.
- **Vertrag zwischen Renderer und Kern:**
  - Der Kern erteilt die Startaufträge, nicht der Renderer.
  - Ein Startauftrag wird erst ausgeführt, wenn der Renderer die Ansicht des Tabs als bereit gemeldet hat. Verdeckte Ansichten melden ihre beste bekannte Grösse und passen sie beim Anzeigen an. So geht keine Ausgabe verloren, und ein wiederhergestellter Verlauf steht immer vor der ersten Shell-Ausgabe.
  - Pausierte Claude-Tabs bekommen ihre Ansicht erst beim ersten Anzeigen.
- **Entwicklung getrennt von der installierten App:** Unpaketiert (`npm start`, Tests) verwendet THub einen eigenen Datenordner („THub-dev“) und damit eine eigene Zustandsdatei, eigene Hook-Datei und eigene Einzelinstanz-Sperre.
- Die bestehenden Module (Zustandsspeicher mit entprelltem, atomarem Schreiben; Shell-Verwaltung mit geordnetem Beenden) bleiben erhalten und werden zum Speicher bzw. Terminal-Backend erweitert.

### Shell-Erkennung

- Erkannt werden: PowerShell 7, Windows PowerShell, cmd, Git Bash (Standard-Installationsort und Registry) sowie jede installierte WSL-Distribution einzeln. Distributionen, deren Name mit `docker-desktop` beginnt, werden ausgeblendet.
- Stabile Kennungen: `pwsh`, `powershell`, `cmd`, `gitbash`, `wsl:<Distribution>`. Jede Shell hat ausserdem einen Anzeigenamen, das Programm, die Startargumente und ein Merkmal, ob Claude darin erfasst wird (alle ausser WSL).
- Standard-Shell ist PowerShell 7, falls vorhanden, sonst Windows PowerShell. Der Nutzer kann sie in den Einstellungen ändern.
- Ein Tab speichert die Kennung seiner Shell. Ist sie beim Wiederherstellen nicht mehr vorhanden, fällt der Tab auf die Standard-Shell zurück und zeigt einen Hinweis im Terminal.
- Der Kern bekommt die Liste der erkannten Shells übergeben. Die Erkennung selbst ist maschinenabhängig und wird von Hand geprüft.

### Shell-Integration

THub startet jede Windows-Shell mit einer mitgelieferten Integration. Sie lädt **zuerst das normale Profil des Nutzers** und richtet dann drei Dinge ein.

**Robust laden:**
- PowerShell bekommt den Integrationscode per `-EncodedCommand`, nicht als Skriptdatei, damit eine restriktive Execution Policy ihn nicht blockiert. cmd lädt seine Integration per `/k`. Git Bash lädt über eine eigene Startdatei, was auch eine Login-Shell von Git Bash lädt (`/etc/profile`, dann `~/.bash_profile`, `~/.bash_login` oder `~/.profile`, sonst `~/.bashrc`), und danach die Integration.
- Fertige, geprüfte Skripte aus dem Spike: `resources/shell/` (`starter.ps1`, `integration.ps1`, `integration.cmd`, `integration.bash`); wie das Terminal-Backend jede Shell startet, zeigt `buildLaunch` in `test/shells/harness.ts`. Befunde: `docs/spikes/starter.md`. Die Skripte liegen im Paket ausserhalb des asar-Archivs (`extraResources`).
- Mitgelieferte Skripte sind reines ASCII oder UTF-8 mit BOM, weil Windows PowerShell 5 UTF-8 ohne BOM falsch liest.
- Scheitert die Integration (Gruppenrichtlinie, Constrained Language Mode), startet die Shell trotzdem normal, nur ohne Integration.

**1. Ordner melden:**
- Bei jedem Prompt meldet die Shell den aktuellen Ordner per Escape-Sequenz, OSC 7 (`file://<Rechner>/<Pfad>`, prozentkodiert) bzw. OSC 9;9, und zwar nur für Orte im Dateisystem. Ein eigener Prompt des Nutzers wird erweitert, nicht ersetzt.
- Der **Kern** erkennt die Sequenzen im Ausgabestrom. Sie können über mehrere Ausgabestücke verteilt sein und mit BEL oder `ESC \` enden.
- Der Kern normalisiert den Pfad (Prozentkodierung, Git-Bash-Pfade wie `/c/…` → `C:\…`) und ignoriert alles, was kein Ordner im Dateisystem ist. Der Ordner wird als „zuletzt aktiver Ordner“ des Tabs gespeichert.
- Die Sequenzen bleiben im Strom; xterm.js ignoriert sie.

**2. `claude`-Ersatz:**
- In der Shell wird `claude` durch einen Ersatz überdeckt: PowerShell-Funktion, Bash-Funktion, doskey-Makro in cmd.
- Alle Varianten rufen **denselben mitgelieferten Starter** auf, ein Windows-PowerShell-5-Skript, das überall vorhanden ist: `powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File <starter.ps1> <Argumente wie getippt>`. Das doskey-Makro ruft `powershell.exe` direkt auf, ohne Batch-Datei, damit `Ctrl+C` keine Rückfrage „Batchvorgang abbrechen?“ auslöst.
- **Der Starter liest seine rohe Befehlszeile** (`[Environment]::CommandLine`, alles nach dem Skriptpfad), nicht die zerlegte Argumentliste. Weil `powershell.exe` selbst ein Programm ist, baut jede Shell diese Befehlszeile genau so, wie sie sie für `claude.exe` bauen würde, einschliesslich der Eigenheiten von PowerShell 5.1, cmd und der Pfadumwandlung von Git Bash. Nur so gilt der folgende Grundsatz in allen vier Shells.
- Der Ersatz wird nur eingerichtet, wenn die Umgebungsvariable `THUB_STARTER` (voller Pfad zu `starter.ps1`) gesetzt ist. So kann THub den Ersatz abschalten, etwa wenn eine Gruppenrichtlinie `-File` blockieren würde.
- Grundsatz: Ein Aufruf über den Ersatz kommt beim echten `claude` mit **genau denselben Argumenten an wie ein direkter Aufruf in derselben Shell**, plus den ergänzten Optionen. Das gilt auch für Anführungszeichen, leere Argumente, Sonderzeichen und Umlaute.

Der Starter arbeitet in diesen Schritten:

1. **Echtes `claude` finden:** die PATH-Ordner in ihrer Reihenfolge, ohne THubs eigene Ordner und ohne den aktuellen Ordner; pro Ordner `claude.exe` vor `claude.cmd`, `claude.ps1` nie. Findet er keines, gibt er „claude wurde nicht gefunden“ aus und endet mit Exit-Code 1.
2. **Aufruf einordnen**, bevor irgendetwas angefragt wird:
   - **Durchreichen:** Der Aufruf geht unverändert und ohne Anfrage an THub an `claude`, wenn `-p`/`--print`, `-v`/`--version` oder `-h`/`--help` vorkommt oder wenn das erste Argument, das kein Optionswert ist und nicht mit `-` beginnt, ein bekannter Unterbefehl ist. Bekannte Unterbefehle, Stand Claude Code 2.1.328 (bei Updates nachziehen): `agents`, `attach`, `auth`, `auto-mode`, `doctor`, `gateway`, `import`, `install`, `logs`, `mcp`, `plugin`, `plugins`, `purge`, `respawn`, `rm`, `setup-token`, `stop`, `kill`, `ultrareview`, `update`, `upgrade`. `--bg`/`--background`, `--desktop` und `--cloud` werden ebenfalls durchgereicht, weil die Session dann nicht in diesem Terminal läuft. Optionswerte werden übersprungen wie in commander (die Bibliothek, mit der `claude` seine Optionen liest): `<x>` genau ein Wert, `<x...>` alle Werte bis zur nächsten Option, `[x]` der nächste Wert, falls er nicht mit `-` beginnt; dazu `--opt=wert`, `-rWERT` und gebündelte Kurzformen. Folge: `claude --debug mcp list` ist interaktiv, weil `--debug` den Wert `mcp` verbraucht.
   - Sonst ist es ein interaktiver Aufruf, und zwar einer von drei **Fällen**:
     - **neu:** keine der Optionen `--resume`/`-r`, `--continue`/`-c`, `--session-id`;
     - **mit Kennung:** `--resume <Kennung>` / `-r <Kennung>` oder `--session-id <Kennung>`;
     - **ohne Kennung:** `--continue`/`-c`, `--resume` ohne Wert (Claudes Auswahlliste), `--from-pr`, `--teleport` sowie `--fork-session` zusammen mit `--resume` (die neue Session bekommt eine eigene Kennung).
     - `--remote-control` ändert den Fall nicht.
3. **Startparameter holen:** Anfrage an THub mit Tab-Kennung, Fall, angegebener Kennung und aktuellem Ordner, ohne Proxy und mit etwa 1 Sekunde Zeitlimit. Antwort: aktueller Tab-Name, im Fall „neu“ eine neue Session-Kennung, Pfad zur Hook-Datei. Ist THub nicht erreichbar, startet `claude` unverändert.
4. **Optionen ergänzen:**
   - `--settings <Hook-Datei>`, ausser der Nutzer gibt selbst `--settings` an; dann laufen keine THub-Hooks, das Sicherheitsnetz gilt aber weiter.
   - Im Fall „neu“ `--session-id <neue Kennung>`, auch wenn der Nutzer `-n` oder ein eigenes `--settings` angibt (sonst fehlte das Sicherheitsnetz).
   - Im Fall „neu“ ohne eigenes `-n`/`--name` auch `-n <Tab-Name>`.
5. **Starten:** Bei `claude.exe` reicht der Starter den Rest seiner rohen Befehlszeile **unverändert** durch und setzt nur die ergänzten Optionen davor. Bei `claude.cmd` quotet er die Argumente neu für `cmd.exe /d /v:off /s /c` (jedes Argument in Anführungszeichen, `&|<>^()` ausserhalb von cmd-Anführungszeichen mit drei Caret, `%` als `%%cd:~,%`, weil cmd die Zeile zweimal auswertet). Er startet den Prozess direkt mit geerbter Konsole (`System.Diagnostics.Process`, ohne ShellExecute), nicht über PowerShells eigene Argumentübergabe an native Programme. Direkt nach dem Start meldet er die Prozess-ID (bei `claude.cmd` die des `cmd.exe`; node ist ein Nachfahre). Er wartet und gibt den Exit-Code weiter; alles nach dem Start läuft in `try`/`finally`, damit `Ctrl+C` die Ende-Meldung nicht verhindert.
6. **Ende melden:** Nach dem Ende von `claude` meldet der Starter Tab-Kennung, Session-Kennung (falls bekannt) und Exit-Code an THub, auch nach `Ctrl+C` und bei Exit-Code ungleich 0.

**3. Startbefehl einmalig ausführen:** Die Integration kann einen von THub mitgegebenen Befehl genau einmal ausführen, sobald die Shell bereit ist; es werden keine Tastendrücke simuliert. THub setzt damit Claude-Sessions fort. Der Startbefehl ruft den Starter direkt auf (mit `--resume <Kennung>`), nicht das Wort `claude`, weil doskey-Makros in cmd in Skripten nicht wirken. Übergabe: In PowerShell und Git Bash über die Umgebungsvariable `THUB_START_CMD`, die die Integration vor dem Ausführen entfernt (so läuft er genau einmal, auch nicht in verschachtelten Shells); in cmd in der `/k`-Zeile hinter der Integration, nicht in der Integrationsdatei, sonst fragt cmd nach `Ctrl+C` „Batchvorgang abbrechen?“.

**Umgebung jedes Terminals:**
- `THUB_TAB_ID` (Tab-Kennung), `THUB_API` (Adresse der lokalen Schnittstelle), `THUB_TOKEN` (pro App-Start zufällig) und `THUB_STARTER` (Pfad zum Starter).
- **Execution Policy:** THub prüft einmal beim Start die Richtlinien-Ebenen (`Get-ExecutionPolicy -Scope MachinePolicy` und `UserPolicy`). Steht dort `AllSigned` oder `Restricted`, lässt THub `THUB_STARTER` weg: `claude` läuft dann direkt, ohne Erfassung, aber ohne Fehler.
- `NO_PROXY` wird um `127.0.0.1,localhost` ergänzt, damit Claudes HTTP-Hooks nicht über einen Firmen-Proxy laufen.
- `THUB_*`-Variablen aus der eigenen Umgebung von THub (etwa wenn es aus einem THub-Tab gestartet wurde) werden vorher entfernt.

**WSL-Tabs** bekommen keine Integration und starten mit `wsl.exe -d <Distribution> --cd <Windows-Pfad>`.

**Bekannte Grenzen:**
- In cmd wird `claude` nur am Anfang einer getippten Zeile erfasst, nicht in `cd x && claude`.
- Claude über den vollen Pfad oder per `npx` wird nicht erfasst.
- Claude in WSL wird nicht erfasst.
- Ein Argument, das nur aus `-` besteht oder mit `-:` beginnt, lässt `powershell.exe -File` abbrechen, bevor der Starter läuft.
- `claude --% …` (Stop-Parsing in PowerShell) wirkt über die Ersatz-Funktion anders als direkt.
- Ein Pfad zum Starter mit `$` funktioniert in cmd nicht (doskey).
- Zeilenumbrüche in Argumenten erreichen `claude.cmd` nicht.
- In Git Bash wandelt MSYS auch Prompts um, die mit `/` beginnen (etwa `/review`), genau wie bei einem direkten Aufruf.
- Läuft der Starter selbst im Constrained Language Mode (WDAC/AppLocker), scheitert er; ein Rückfall ist nicht vorgesehen.
- Jeder Start über den Ersatz kostet rund 0,5 Sekunden.

### Hook-Empfänger und lokale Schnittstelle

- Ein kleiner HTTP-Server im Hauptprozess, gebunden nur an `127.0.0.1` auf einem zufälligen freien Port. Jede Anfrage muss das Token mitschicken, sonst wird sie mit 403 abgewiesen. Anfragen zu unbekannten Tabs werden ignoriert.
- **Endpunkte:**

| Endpunkt | Von | Inhalt | Antwort |
|---|---|---|---|
| `POST /claude/launch` | Starter, vor dem Start | Tab-Kennung, Fall, angegebene Kennung, aktueller Ordner | Tab-Name, neue Session-Kennung (nur Fall „neu“), Pfad zur Hook-Datei |
| `POST /claude/started` | Starter, direkt nach dem Start | Tab-Kennung, Prozess-ID von Claude | leer |
| `POST /claude/exit` | Starter, nach dem Ende | Tab-Kennung, Session-Kennung, Exit-Code | leer |
| `POST /hooks/<Ereignis>` | Claude Code (HTTP-Hooks; `SessionStart` über `curl.exe`, siehe unten) | Hook-Nutzdaten | immer sofort leerer Erfolg mit leerem Inhalt |

- Die **Hook-Datei** erzeugt THub bei jedem Start neu im eigenen Datenordner:
  - Hooks vom Typ `http` auf `/hooks/<Ereignis>`, mit den Kopfzeilen `X-THub-Tab: $THUB_TAB_ID` und `X-THub-Token: $THUB_TOKEN`. Beide Variablen stehen in `allowedEnvVars`. Timeout 2 Sekunden.
  - Registrierte Ereignisse per HTTP: `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure`, `Notification`.
  - **`SessionStart` unterstützt keine HTTP-Hooks** (Claude überspringt sie still). Dafür gibt es einen Befehls-Hook ohne Shell (Exec-Form), der die Nutzdaten mit dem `curl.exe` von Windows an `/hooks/SessionStart` weiterleitet. curl liest Tab-Kennung und Token selbst aus der Umgebung (`--variable %VAR` mit `--expand-header`), mit `--connect-timeout 1 -m 2` und Hook-Timeout 3 Sekunden. Die Antwort muss leer sein, weil die Ausgabe dieses Hooks in Claudes Kontext landet. Fehlt `curl.exe`, entfällt der Eintrag; die Zuordnung läuft dann über die Ersatzregel „neue Kennung in einem anderen Ereignis“ (siehe Zustandsautomat).
  - Eine geprüfte Vorlage liegt in `spikes/claude-hooks/empfohlene-hook-datei.json`.
- Relevante Felder der Nutzdaten:
  - alle Ereignisse: `session_id`, `cwd` (kann ein 8.3-Kurzpfad sein, wird normalisiert), `transcript_path`;
  - `SessionStart.source`: `startup`, `resume`, `clear` (geprüft), `compact`, `fork` (laut Doku);
  - `SessionEnd.reason`: `prompt_input_exit` (auch nach zweimal `Ctrl+C`), `clear`, `other` (geprüft), `resume`, `logout` (laut Doku);
  - `Notification.notification_type`: `permission_prompt` (kommt erst etwa 6 Sekunden nach der Rückfrage), `idle_prompt` (etwa 60 Sekunden nach `Stop`);
  - `PermissionRequest` kommt sofort, auch bei Rückfragen von `AskUserQuestion`;
  - `Stop.background_tasks` ist immer vorhanden. Endet eine Hintergrund-Aufgabe, schickt Claude ein `UserPromptSubmit` (Prompt beginnt mit `<task-notification>`) und danach wieder `Stop`.
  - Beispiel-Nutzdaten und alle Befunde: `docs/spikes/claude-hooks.md`, `spikes/claude-hooks/samples/`.
- Der Empfänger antwortet **immer sofort mit einem leeren Erfolg** und gibt nie Entscheidungsfelder zurück. Einzige Ausnahme: Auf `SessionStart` liefert er bei eingeschalteter Einstellung die Anweisung für offene Punkte als zusätzlichen Kontext (siehe „Offene Punkte aus Claudes Antworten“). Darüber hinaus beeinflusst THub Claude nicht.
- Ereignisse werden in der Reihenfolge ihres Eintreffens verarbeitet (`PreToolUse` kommt vor `PermissionRequest`).
- In einem noch nicht vertrauten Ordner laufen keine Hooks, bis der Nutzer den Vertrauensdialog von Claude bestätigt.
- Ist der Empfänger nicht erreichbar, zeigt Claude bei jedem Hook eine Fehlerzeile im Terminal; hängt er, verzögert er jedes Ereignis bis zum Timeout. Deshalb antwortet der Empfänger immer sofort.
- Die globale Claude-Konfiguration (`~/.claude/settings.json`) wird nicht angefasst. Die Hooks gelten nur für Sessions, die über den Ersatz in THub-Terminals gestartet werden. Claude führt `--settings`-Hooks zusätzlich zu denen des Nutzers aus. Weil `--settings` beim Fortsetzen nicht erhalten bleibt, gibt der Starter es bei jedem Aufruf mit.
- Eine zweite Instanz (siehe „App-Verhalten“) startet keinen Server und schreibt keine Hook-Datei.

### Claude-Status: Zustandsautomat pro Tab

Der Kern führt pro Tab eine **Claude-Zuordnung**. Sie besteht aus:
- Session-Kennung (kann fehlen)
- Ordner der Session
- „bestätigt“: per Hook gemeldet, im Gegensatz zu nur vom Starter erwartet
- „hatte Prompt“
- Prozess-ID von Claude
- Zustand

Dazu kommt das Merkmal „fertig, noch nicht angeschaut“. Ein Tab mit Claude-Zuordnung ist ein **Claude-Tab**, auch wenn die Zuordnung noch unbestätigt ist.

| Eingang | Wirkung |
|---|---|
| Start gemeldet, Fall „neu“ | Claude-Tab mit der neu vergebenen Kennung (unbestätigt), Ordner = gemeldeter Ordner, Zustand „ruht“ |
| Start gemeldet, Fall „mit Kennung“ | wie oben, mit der angegebenen Kennung |
| Start gemeldet, Fall „ohne Kennung“ | Claude-Tab ohne Kennung; erst `SessionStart` liefert sie |
| Prozess-ID gemeldet | wird für die Prozess-Regeln gemerkt |
| `SessionStart` (alle Quellen) | Kennung und Ordner (`cwd`, normalisiert) aus dem Ereignis übernehmen, bestätigt; bei neuer Kennung „hatte Prompt“ zurücksetzen; Zustand „ruht“ |
| Ein anderes Ereignis (ausser `SessionEnd`) mit einer anderen `session_id` als der gespeicherten | wird wie `SessionStart` behandelt (Ersatz, falls `SessionStart` nicht ankam), danach normal verarbeitet |
| `UserPromptSubmit` | Zustand „arbeitet“, „hatte Prompt“ setzen, Zeitpunkt merken (für die Prozess-Regeln, siehe unten) |
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure` | Zustand „arbeitet“ (beendet auch „wartet“) |
| `PermissionRequest` | Zustand „wartet auf dich“, sofort |
| `Notification` mit Typ `permission_prompt` oder `elicitation_dialog` | Zustand „wartet auf dich“, aber nur als Rückfallebene: wenn der Tab noch „arbeitet“ und seit dem letzten `PreToolUse` weder `PermissionRequest` noch `PostToolUse` kam. Das Ereignis kommt etwa 6 Sekunden verzögert und darf einen inzwischen weiterarbeitenden oder ruhenden Tab nicht zurücksetzen |
| `Notification` mit Typ `idle_prompt` | keine Änderung |
| Nutzer drückt Esc in einem Claude-Tab, der „arbeitet“ oder „wartet“, und innerhalb von etwa 1,5 Sekunden kommt kein Hook-Ereignis | Zustand „ruht“, ohne „fertig, noch nicht angeschaut“. Nach einer Unterbrechung oder einer abgelehnten Rückfrage schickt Claude kein Ereignis |
| Andere Eingabe des Nutzers in einem Claude-Tab, der „wartet“ | Zustand „arbeitet“. Nach einer Bestätigung kommt bis `PostToolUse` kein Ereignis; ein langer bestätigter Befehl bliebe sonst orange |
| `Stop`, `StopFailure` | Zustand „ruht“; war der Tab dabei nicht sichtbar (nicht aktiv oder Fenster nicht im Vordergrund), „fertig, noch nicht angeschaut“ setzen |
| `SessionEnd` mit Grund `clear` oder `resume` | keine Änderung (ein `SessionStart` mit neuer Kennung folgt) |
| `SessionEnd` mit anderem Grund; Ende-Meldung des Starters; Ende der Shell | Tab wird normales Terminal, Claude-Zuordnung entfällt. Ausnahme: Nach einem von THub gestarteten Fortsetzen ohne vorheriges `SessionStart` entscheidet erst die Ende-Meldung des Starters (ein fehlgeschlagenes Fortsetzen schickt `SessionEnd` mit Grund `other` etwa 1,5 Sekunden vor dem Prozessende) |
| Ende-Meldung **ohne** vorheriges `SessionStart` und mit Exit-Code ≠ 0 nach einem von THub gestarteten Fortsetzen | zusätzlich Hinweis im Terminal „Claude-Session konnte nicht fortgesetzt werden“. Exit-Code ≠ 0 heisst Fehlstart; `/exit` und zweimal `Ctrl+C` enden mit 0 |
| Tab wird angezeigt bzw. Fenster kommt mit diesem Tab in den Vordergrund | „fertig, noch nicht angeschaut“ löschen; Hinweise zu diesem Tab verschwinden |
| **THub beendet selbst** (App beenden, Tab schliessen, Windows-Abmeldung oder -Neustart) | Claude-Zuordnung wird **eingefroren**: Ereignisse danach (`SessionEnd`, Ende-Meldung, Ende der Shell) ändern den gespeicherten Zustand und die Liste der geschlossenen Tabs nicht mehr |

**„Prozesse laufen“ (blau):**
- **Technik** (aus dem Spike, `docs/spikes/prozess-sonde.md`): `koffi` in exakt Version 3.3.8 mit **einem asynchronen Aufruf von `NtQuerySystemInformation(SystemProcessInformation)`** pro Abfrage, etwa alle 1,5 Sekunden für alle Tabs zusammen. Kostet rund 7,5 ms auf einem Hilfs-Thread (etwa 0,5 % eines Kerns), unabhängig von der Zahl der Tabs. Es wird kein Prozess gestartet und kein Prozess-Handle geöffnet. Referenzcode: `spikes/prozess-sonde/probes/ntqsi.js`.
  - Installation ohne Build-Werkzeuge: koffi bringt sein Binärmodul als optionales Paket `@koromix/koffi-win32-x64` mit; niemals mit `--omit=optional` installieren.
  - Paket: `build.asarUnpack` um `node_modules/@koromix/koffi-win32-*/**` ergänzen; `koffi` ist in esbuild `external`; `npmRebuild: false` bleibt richtig.
  - Verworfen: `@vscode/windows-process-tree` (braucht Build-Werkzeuge, schneidet nach 1024 Prozessen ab, keine Startzeiten) und PowerShell/CIM (zu viel CPU).
- **Identität:** Ein Prozess ist (Prozess-ID, Startzeit). Eine Eltern-Beziehung zählt nur, wenn das Kind nicht vor dem Eltern-Prozess gestartet ist; Prozess-IDs werden unter Windows wiederverwendet.
- **Innerste Shell:** Wurzel ist die Prozess-ID von node-pty. Bei PowerShell 7, Windows PowerShell und cmd ist das die Shell selbst (auch PowerShell 7 über den WindowsApps-Alias). Bei Git Bash ist die Wurzel der Starter `bin\bash.exe`; die eigentliche Shell ist genau eine Ebene darunter das `bash.exe`-Kind, einmal bestimmt und dann fest. Bis es erscheint, zählt nichts. Tiefere `bash.exe` sind Fork-Kinder von Befehlen und zählen als Nachfahren.
- Ein Prozess zählt erst, wenn er in zwei aufeinanderfolgenden Abfragen vorkommt. Das filtert kurzlebige Prompt-Helfer (posh-git startet pro Prompt ein `git.exe`, der Git-Bash-Prompt eine Kaskade von Forks).
- `conhost.exe` und `OpenConsole.exe` zählen nie. Der ConPTY-Host eines Tabs liegt neben der Shell, nicht darunter; unter Nachfahren mit eigener Konsole kommen sie trotzdem vor.
- **Git Bash, verwaiste MSYS-Programme:** `sleep`, `ssh`, `vim`, `less` usw. verlieren unter Git Bash ihren Eltern-Prozess. Sie zählen trotzdem als Nachfahren, wenn ihr Konsolen-Host der Host des Tabs ist (Abfrage nur für Waisen, etwa 0,15 ms).
- **Normale Tabs:** Jeder Nachfahre der innersten Shell zählt.
- **Claude-Tabs:** Es zählen nur Nachfahren des Claude-Prozesses (Prozess-ID aus der Meldung `started`), die **nach dem letzten `UserPromptSubmit` gestartet** sind, und nur, solange Claude ruht. Dauerhafte Helfer wie MCP-Server zählen also nicht; ein während der Antwort gestarteter Dev-Server, der danach weiterläuft, zählt, bis er endet.
- **WSL-Tabs** zeigen nie „Prozesse laufen“, weil die Linux-Prozesse für Windows unsichtbar sind.
- **Bekannte Grenzen:** Aus der Shell oder von Claude geöffnete GUI-Programme halten den Tab blau, solange sie offen sind. Ein Prompt, der länger als 1,5 Sekunden braucht, kann kurz blau aufblitzen. Vollständig abgekoppelte Prozesse lassen sich keinem Tab zuordnen.

**Angezeigter Status**, mit Vorrang von oben nach unten:
1. pausiert
2. wartet auf dich (orange, pulsierend)
3. arbeitet (violett, animiert)
4. fertig, noch nicht angeschaut (grün)
5. Prozesse laufen (blau)
6. nichts

**Hinweise im Fenster:**
- Der Kern löst einen Hinweis aus, wenn ein nicht sichtbarer Tab in „wartet auf dich“ wechselt oder fertig wird. Pro Tab gibt es höchstens einen Hinweis; ein neuer ersetzt den alten. Hinweise verschiedener Tabs stehen gleichzeitig übereinander; wird ein Tab angezeigt (auf welchem Weg auch immer), verschwindet nur dessen Hinweis.
- „Fertig“ verschwindet nach etwa 6 Sekunden Vordergrundzeit oder beim Anzeigen des Tabs.
- „Wartet“ verschwindet beim Anzeigen des Tabs oder wenn der Tab wieder arbeitet.
- Hinweise nehmen dem Terminal nie den Fokus.
- Sind Hinweise in den Einstellungen abgeschaltet, löst der Kern keine aus. Die Status-Symbole bleiben.

### Offene Punkte aus Claudes Antworten

- **Anweisung:** Bei eingeschalteter Einstellung antwortet THub auf `/hooks/SessionStart` mit `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`. Wortlaut des Kontexts: „Hinweis von THub: Wenn deine Antwort Fragen an den Nutzer oder offene Punkte enthält, die er entscheiden, prüfen oder erledigen muss, schreibe sie am Ende der Antwort unter der Überschrift ‚Offene Punkte‘ als kurze Aufzählung, ein Punkt pro Zeile. Gibt es keine, lass den Abschnitt weg.“ Weil `SessionStart` auch bei Fortsetzen, `/clear` und Kompaktieren kommt, gilt die Anweisung in jeder Session. Sind Hooks gesperrt, entfällt das Feature.
- **Erkennung** beim Ereignis `Stop` im Feld `last_assistant_message`: eine Überschrift (Markdown-Überschrift, fette Zeile oder Zeile mit Doppelpunkt) „Offene Punkte“, „Offene Fragen“, „Noch offen“, „Fragen an dich“, „Zu klären“, „Open points“ oder „Open questions“, mit den Aufzählungspunkten darunter; ohne solche Überschrift gilt eine Frage am Ende des letzten Absatzes als ein offener Punkt. Inhalt von Code-Blöcken zählt nie.
- **Hinweis:** unten rechts mit Tab-Name, „Offene Punkte (n)“ und höchstens vier Punkten (je höchstens zwei Zeilen, darunter „+ k weitere“). Ein Klick springt in den Tab. Er bleibt, bis er mit × geschlossen wird, auch beim Anzeigen des Tabs, und er erscheint auch für den sichtbaren Tab. Pro Tab höchstens einer; eine neue Antwort mit offenen Punkten ersetzt ihn, eine ohne lässt ihn stehen; er ersetzt den „Fertig“-Hinweis desselben Tabs.
- **Gespeichert:** Nicht geschlossene Hinweise stehen pro Tab im Zustand und erscheinen nach einem Neustart wieder; mit einem geschlossenen Tab verschwindet auch sein Hinweis.
- **Einstellung** „Offene Punkte aus Claudes Antworten anzeigen“ im Abschnitt „Hinweise“, Standard: an. Ausgeschaltet entfallen Hinweis und Anweisung.

### Wiederherstellen

- **Beim Start**, pro Tab in gespeicherter Reihenfolge:
  - **Normaler Tab:** Shell im zuletzt aktiven Ordner starten, mit Rückfall auf Startordner, Standardordner und Benutzerordner.
    - Vor dem Start der Shell schreibt der Renderer den gespeicherten Verlauf ausgegraut ins Terminal, dazu eine Trennlinie „Wiederhergestellt · <Datum, Uhrzeit>“ und so viele Leerzeilen, dass alles im Scrollback liegt. ConPTY leert beim Start den sichtbaren Bereich.
    - Das Ausgrauen muss auch über Farb-Resets im gespeicherten Inhalt hinweg wirken.
  - **Claude-Tab, der fortgesetzt werden soll:** Er hat eine Session-Kennung und entweder einen Prompt erlebt oder ist unbestätigt (Sicherheitsnetz ohne Hooks).
    - Ist er der zuletzt aktive Tab, startet die Shell sofort im Ordner der Session (Rückfallkette, falls er fehlt) mit dem Startbefehl „Starter mit `--resume <Kennung>`“. Kein alter Verlauf.
    - Sonst ist er **pausiert**: Es läuft noch kein Prozess, beim ersten Anzeigen startet er wie oben. Ein pausierter Tab übersteht weitere Neustarts unverändert.
    - Ist der zuletzt aktive Tab ein normaler Tab, sind alle fortzusetzenden Claude-Tabs pausiert.
  - **Claude-Tab, der nicht fortgesetzt wird** (keine Kennung, oder bestätigt, aber nie ein Prompt): Er kommt als normales Terminal im Ordner der Session zurück, ohne Verlauf.
- **Verlauf sichern:**
  - Der Inhalt normaler Tabs wird im Renderer aus dem Terminal-Puffer serialisiert (`@xterm/addon-serialize`, ohne Alternativ-Puffer von Vollbildprogrammen, letzte ca. 1000 Zeilen) und im Hauptprozess pro Tab in einer eigenen Datei abgelegt.
  - Gesichert wird beim Schliessen eines Tabs, periodisch etwa alle 30 Sekunden für geänderte Tabs und beim Beenden (siehe „App-Verhalten“).
  - Für Claude-Tabs wird kein Verlauf gesichert.
- **Geschlossene Tabs:** Beim Schliessen wandert der Tab mit allen Angaben (inklusive Verlauf bzw. Claude-Zuordnung, eingefroren) in eine Liste der letzten zehn. Wiederöffnen stellt ihn an seiner alten Position wie beim Start wieder her; ein fortzusetzender Claude-Tab wird dabei sofort fortgesetzt. Fällt ein Tab aus der Liste, wird seine Verlaufsdatei gelöscht.
- **Beenden der App** fragt nie nach, auch wenn Claude gerade arbeitet: Alles kommt beim nächsten Start zurück. Eine dabei unterbrochene Antwort setzt Claude ab dem gespeicherten Gesprächsstand fort.

### Gespeicherter Zustand (Schema Version 2)

Der gespeicherte Zustand wird auf Version 2 angehoben, mit automatischer Übernahme aus Version 1.

- **Einstellungen:**
  - Standardordner (optional, leer bedeutet Benutzerordner)
  - Kennung der Standard-Shell
  - Design (System / Hell / Dunkel)
  - Terminal-Schriftgrösse (8 bis 32)
  - Hinweise an/aus
- **Tabs (geordnet):**
  - Kennung, Name, ob der Name von Hand vergeben wurde
  - Shell-Kennung, Startordner, zuletzt aktiver Ordner
  - bei Claude-Tabs die Claude-Zuordnung (Session-Kennung, Ordner der Session, bestätigt, hatte Prompt)
- **Weitere Angaben:**
  - aktiver Tab
  - zuletzt benutzte Ordner: Startordner neu angelegter Tabs und der zuletzt aktive Ordner eines Tabs beim Schliessen; höchstens acht, neueste zuerst, ohne Doppelte
  - zuletzt geschlossene Tabs (höchstens zehn)
  - Fenster: Grösse und Position im normalen Zustand, maximiert ja/nein
- Laufzeit-Status (arbeitet, wartet, Prozess-IDs usw.) wird nicht gespeichert. Der Verlauf liegt pro Tab in separaten Dateien.
- **Übernahme aus Version 1:**
  - Sessions werden zu normalen Tabs.
  - `settings.shell` wird abgebildet: `pwsh.exe` → `pwsh`, `powershell.exe` → `powershell`, `cmd.exe` → `cmd`, alles andere → Standard-Shell. Das Ergebnis gilt als Shell aller übernommenen Tabs.
  - Ein `defaultCwd`, der dem Benutzerordner entspricht, wird zu „leer“.
  - Namen bleiben unverändert.

### Tab-Namen

- Automatischer Name beim Anlegen: letzter Teil des Ordnerpfads; beim Benutzerordner der Benutzername, bei einem Laufwerk der Laufwerksbuchstabe. Bei Gleichstand wird „ 2“, „ 3“ usw. angehängt.
- Der Name wird beim Anlegen festgelegt und ändert sich nicht, wenn der Nutzer später mit `cd` den Ordner wechselt.
- Leere Namen beim Umbenennen werden ignoriert.

### Oberfläche (Renderer)

- **React mit TypeScript**, normales CSS mit Design-Variablen für hell und dunkel. Gebündelt weiterhin mit esbuild.
- **Bestandteile:**
  - Titelleiste mit Tab-Leiste: Ziehen zum Umsortieren, Status-Symbole, Inline-Umbenennen, Tooltip, Scrollen bei Überlauf
  - `+`-Knopf mit Pfeil-Menü: Shells, „Neues Terminal in …“ mit zuletzt benutzten Ordnern und „Ordner wählen …“
  - Zahnrad mit Einstellungsdialog
  - Rechtsklick-Menü am Tab
  - Befehlspalette mit unscharfer Suche über Tabs und Befehle
  - Hinweise unten rechts
  - Rückfrage-Dialog beim Schliessen
  - Terminal-Fläche: ein xterm.js pro Tab, inaktive ausgeblendet statt zerstört; „beliebige Taste startet die beendete Shell neu“ bleibt
- **Kein Claude-Eintrag** im Pfeil-Menü, in der Befehlspalette oder im Rechtsklick-Menü.
- **Fenster und Titelleiste:**
  - Ohne Windows-Rahmen, mit verdeckter Titelleiste und den nativen Fensterknöpfen als Overlay, damit die Andock-Layouts von Windows 11 erhalten bleiben. Die Symbolfarbe der Knöpfe wird bei jedem Wechsel des Designs nachgezogen.
  - Die Tabs sind von der Zieh-Fläche ausgenommen, damit Klick, Rechtsklick und Ziehen funktionieren. Neben den Tabs bleibt immer eine feste Mindestfläche zum Verschieben des Fensters, auch bei überlaufender Leiste.
  - Der Fensterhintergrund ist deckend und einfarbig. Kein Mica, keine Transparenz.
  - Schrift: Segoe UI Variable für die Oberfläche, Cascadia Mono für das Terminal.
- **Design:** folgt standardmässig Windows und reagiert live auf einen Wechsel. Die Terminalfläche hat je ein abgestimmtes helles und dunkles Farbschema.
- **Entscheidungen aus dem Prototyp** (Referenz für Design-Variablen, Farbschemata und Animationen: `prototype/styles.css`):
  - **Kein Mica, keine Transparenz:** Fenster, Titelleiste, Menüs und Dialoge haben deckende Hintergründe.
  - **Keine Akzentfarbe.** Hervorhebungen sind neutral (Monochrom): der Balken unter dem aktiven Tab, primäre Buttons, Schalter, Fokusrahmen und Cursor nutzen die Textfarbe des jeweiligen Designs.
  - **Terminal als Karte:** Die Terminalfläche ist eine abgerundete Karte mit feinem Rand innerhalb des Fensters, nicht randlos.
  - **Erster Start maximiert:** Ohne gespeicherte Fensterangaben öffnet THub maximiert.
  - **Tabs:** Jeder Tab ist eine eigene, abgerundete Fläche mit feinem Rand und etwas Abstand zum Nachbarn; der aktive Tab hebt sich mit stärkerem Rand, fettem Namen und neutralem Balken darunter ab; der Schliessen-Knopf erscheint beim aktiven Tab und beim Überfahren.
  - **Umbenennen:** Der Tab selbst wird zum Eingabefeld, in gleicher Grösse und Schrift, nur mit feinem Rahmen; kein separates Textfeld.
  - **Hinweise:** 320 px breit, Titel 14 px, Text 13 px. Die ganze Karte ist anklickbar und öffnet den Tab; es gibt keinen „Öffnen“-Button. Eine dezente Zeile „Zum Tab wechseln →“ zeigt, dass man klicken kann, und wird beim Überfahren hell. Das × zum Wegklicken erscheint beim Überfahren.
  - **Symbol-Platz links vom Tab-Namen:** Im Ruhezustand zeigt er gedämpft den Typ des Tabs (`>_` für ein normales Terminal, ein Stern für einen Claude-Tab), sonst den Status.
  - **Status-Animationen:** „arbeitet“ = violetter Claude-Stern, der rotiert und pulsiert; „wartet auf dich“ = oranger Punkt mit Ping-Ring; „Prozesse laufen“ = blauer, ruhig atmender Punkt; „fertig“ = grüner Punkt; „pausiert“ = graues Pause-Symbol. Bei reduzierter Bewegung (Windows-Einstellung) laufen die Animationen stark verlangsamt.
- **Design-Variablen** (vom Nutzer am 2026-11-19 freigegeben; vollständige Liste mit allen Werten in `prototype/styles.css`):

| Zweck | Variable | Dunkel | Hell |
|---|---|---|---|
| Fenster und Titelleiste (deckend) | `--win-solid` | `#1d1d22` | `#f3f3f6` |
| Text / gedämpft / schwach | `--text`, `--text-muted`, `--text-faint` | `#ececf1`, `#a1a1ad`, `#71717c` | `#1b1b1f`, `#5b5b66`, `#8a8a95` |
| Tab-Fläche / Rand / Überfahren | `--tab-bg`, `--tab-border`, `--tab-hover` | Weiss mit 4 %, 7 %, 7,5 % Deckkraft | Schwarz mit 3,5 %, 7 %, 6,5 % Deckkraft |
| Aktiver Tab | `--tab-active-bg`, `--tab-active-shadow` | Weiss 10 %, Rand Weiss 16 % | `#ffffff`, Rand Schwarz 12 % |
| Neutrale Hervorhebung (kein Akzent) | `--accent`, `--on-accent` | `#f4f4f5` auf `#111114` | `#18181b` auf `#ffffff` |
| Dialoge, Menüs, Hinweise | `--dialog-bg` | `#25252b` | `#ffffff` |
| Gefahr (Schliessen-Bestätigung) | `--danger` | `#f2555a` | `#dc2626` |
| Status arbeitet / wartet / Prozesse | `--st-working`, `--st-waiting`, `--st-processes` | `#a78bfa`, `#fb923c`, `#60a5fa` | `#7c3aed`, `#ea580c`, `#2563eb` |
| Status fertig / pausiert | `--st-finished`, `--st-paused` | `#4ade80`, `#8b8b96` | `#16a34a`, `#9090a0` |
| Terminal Hintergrund / Text | `--term-bg`, `--term-fg` | `#141417`, `#d4d4dc` | `#ffffff`, `#24242b` |
| Terminal Rot / Grün / Gelb / Blau | `--a-red` … `--a-blue` | `#f87171`, `#4ade80`, `#facc15`, `#60a5fa` | `#c62828`, `#1a7f37`, `#9a6700`, `#0550ae` |
| Terminal Magenta / Cyan / Gedämpft | `--a-magenta`, `--a-cyan`, `--a-dim` | `#c084fc`, `#22d3ee`, `#6e6e7a` | `#8250df`, `#0e7490`, `#8a8a95` |

- **Masse:** Titelleiste 44 px; Tabs 30 px hoch, 200 px breit, mindestens 112 px, 5 px Abstand; Radien 4 / 6 / 8 / 12 px, Terminal-Karte 10 px mit 7 px Rand zum Fenster; Status-Feld 14 px mit 8-px-Punkten; Hinweise 320 px breit.
- **Schriften:** Oberfläche Segoe UI Variable (Text 13 px, Tabs 12,5 px, Dialog-Titel 16 px), Terminal Cascadia Mono (Standard 14 px).
- **Bewegung:** kurze Übergänge 120 ms, Standard 180 ms, Ease `cubic-bezier(0.2, 0.8, 0.2, 1)`; Claude-Stern 1,6 s, Ping 1,4 s, Atmen 2,2 s.
- **Tastenkürzel:**

| Kürzel | Aktion |
|---|---|
| `Ctrl+Shift+T` | Neues Terminal (Standardordner, Standard-Shell) |
| `Ctrl+Shift+W` | Aktiven Tab schliessen |
| `Ctrl+Shift+Z` | Zuletzt geschlossenen Tab wieder öffnen |
| `Ctrl+Shift+P` | Befehlspalette |
| `Ctrl+Tab` / `Ctrl+Shift+Tab`, `Ctrl+PageDown` / `Ctrl+PageUp` | Nächster / vorheriger Tab |
| `Ctrl+1` … `Ctrl+9` | Zum n-ten Tab |
| `F2` | Aktiven Tab umbenennen |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Kopieren / Einfügen |
| `Ctrl` + Mausrad, `Ctrl` `+` / `Ctrl` `-` / `Ctrl` `0` | Schriftgrösse ändern / zurücksetzen |

- `Ctrl+K` wird nicht abgefangen.
- Kürzel, die vom Tastaturlayout abhängen (`+`, `-`), werden über das erzeugte Zeichen erkannt, nicht über die Tastenposition. So funktionieren die Schweizer Tastatur (`+` auf Shift+1) und der Ziffernblock.
- Der eingebaute Zoom von Chromium und die Zoom-Kürzel des Entwicklermenüs sind abgeschaltet.

### App-Verhalten

- **Nur eine Instanz:** Ein zweiter Start gibt sofort auf und holt das bestehende Fenster nach vorne, auch aus minimiertem Zustand. Er startet keine Shells und keinen Server, schreibt keine Hook-Datei und keinen Zustand.
- **Fenster** öffnet mit gespeicherter Grösse, Position und Maximiert-Zustand. Liegt die gespeicherte Position ausserhalb aller Bildschirme (zum Beispiel nach dem Abziehen eines Monitors), wird das Fenster auf dem Hauptbildschirm zentriert.
- **Beenden:**
  - Das Schliessen des Fensters wird abgefangen. THub friert die Claude-Zuordnungen ein, fordert vom Renderer den aktuellen Verlauf an (mit Zeitlimit von etwa 2 Sekunden) und sichert den Zustand. Danach beendet es alle Shells, wartet wie bisher höchstens einige Sekunden und beendet die App.
  - Bei einer Windows-Abmeldung oder einem Neustart (die Ereignisse `query-session-end` bzw. `session-end` des Fensters) friert THub sofort ein und schreibt synchron mit dem zuletzt periodisch gesicherten Verlauf, weil der Renderer dann womöglich nicht mehr antwortet.

## Testentscheidungen

### Was einen guten Test ausmacht

- Getestet wird **äusseres Verhalten** an der Schnittstelle des Moduls, nicht dessen Innenleben. Ein Test beschreibt, was ein Nutzer erleben würde („nach einem Neustart wird die Claude-Session mit `--resume` im Session-Ordner fortgesetzt“), und bleibt grün, wenn der Kern intern umgebaut wird.
- Nachgemacht wird nur an den **Systemgrenzen** (die Ports), nie interne Teile des Kerns.
- Hook-Ereignisse in Tests haben die Form, die Claude Code laut Dokumentation tatsächlich schickt.
- Tests laufen in Temp-Ordnern mit eigenem Datenordner. Sie setzen die Umgebung gestarteter Prozesse ausdrücklich und entfernen geerbte `THUB_*`-Variablen, damit sie nie eine laufende THub-Instanz ansprechen, auch wenn der Testlauf selbst in einem THub-Tab läuft.

### Teststelle 1: Workspace-Kern (Hauptteil der Tests)

- Der Kern wird ohne Electron und ohne Fenster in Node gestartet, mit allen Ports nachgemacht:
  - Terminal-Backend: zeichnet Startaufträge auf (Programm, Argumente, Ordner, Umgebung, Startbefehl) und lässt den Test rohe Ausgabestücke und Prozessende einspeisen;
  - Speicher im Arbeitsspeicher;
  - steuerbare Uhr;
  - steuerbare Prozess-Sonde (Prozessbäume);
  - nachgemachtes System (vorhandene Ordner, Benutzerordner, Bildschirme).
- Die **lokale Schnittstelle läuft echt** auf `127.0.0.1`. Tests schicken echte HTTP-Anfragen: Meldungen des Starters und dokumentierte Hook-Nutzdaten mit Tab-Kennung und Token.
- Ein **Neustart** wird simuliert, indem ein neuer Kern auf demselben gespeicherten Zustand erzeugt wird.
- Geprüft werden unter anderem:
  - **Tabs:** anlegen (Standardordner, „in …“, Shell-Wahl, Position rechts vom aktiven), automatische Namen und Gleichstand, Umbenennen, Duplizieren, Umsortieren, Schliessen, Andere schliessen.
  - **Startaufträge:** erst nach „Ansicht bereit“, mit der gemeldeten Grösse.
  - **Ordner-Erkennung:** Sequenzen an jeder Position zwischen zwei Stücken getrennt, beide Endzeichen, mehrere Sequenzen pro Stück, Prozentkodierung, Git-Bash-Pfade, Orte ausserhalb des Dateisystems; Rückfallkette.
  - **Rückfrage beim Schliessen:** in Abhängigkeit von den eigentlichen Merkmalen (arbeitet, wartet, Prozesse laufen), nicht vom angezeigten Symbol.
  - **Geschlossene Tabs:** Verlauf der letzten zehn und Wiederöffnen, auch über einen Neustart.
  - **Zuletzt benutzte Ordner.**
  - **Claude-Zuordnung:** alle drei Fälle beim Start, Ende-Meldung, Sicherheitsnetz ohne jedes Hook-Ereignis, der komplette Zustandsautomat inklusive `/clear`, `PermissionRequest`, Esc ohne folgendes Ereignis, Eingabe nach einer Rückfrage, Ersatzregel für fehlendes `SessionStart`, verspätetes `SessionEnd(other)` bei fehlgeschlagenem Fortsetzen und Vorrang der angezeigten Zustände.
  - **Einfrieren:** Beenden bzw. Schliessen, danach Ende der Shell und `SessionEnd` mit Grund `other` → nach dem Neustart bzw. beim Wiederöffnen wird trotzdem fortgesetzt.
  - **Prozess-Regeln** mit konkreten Prozessbäumen (Vorlagen in `spikes/prozess-sonde/ergebnisse/`): Git-Bash-Startkette, verwaiste MSYS-Programme mit Konsolen-Host, kurzlebige Prompt-Helfer, wiederverwendete Prozess-IDs, MCP-Server unter Claude, Dev-Server, der nach der Antwort weiterläuft.
  - **Schnittstelle:** Abweisung ohne gültiges Token; Hook-Antworten sind leer und kommen sofort.
  - **Hinweise:** nur für nicht sichtbare Tabs, Countdown nur im Vordergrund, höchstens einer pro Tab, abgeschaltet heisst keine Hinweise.
  - **Wiederherstellen:** alle Fälle aus dem Abschnitt „Wiederherstellen“.
  - **Übernahme** eines Zustands der Version 1.

### Teststelle 2: Shell-Integration mit echten Shells

- Ein Integrationstest startet über das echte Terminal-Backend (node-pty) die echten Shells mit der echten Integration: PowerShell 7, Windows PowerShell, cmd und Git Bash. Nicht installierte Shells werden übersprungen.
- Im PATH liegt vor dem Rest ein **nachgemachtes `claude`** (als `.exe`, und in einem zweiten Durchlauf als `.cmd`), das seine Argumente und Umgebung in eine Datei schreibt. Die lokale Schnittstelle läuft als einfache Testattrappe, die Anfragen aufzeichnet.
- Geprüft wird:
  - **Gleichheit der Argumente:** Für eine Liste von Testaufrufen kommt über den Ersatz genau dasselbe an wie beim direkten Aufruf des nachgemachten Programms in derselben Shell, plus den ergänzten Optionen. Testfälle: eingebettete Anführungszeichen, leeres Argument, `%PATH%`, `^`, `&`, `!`, Umlaute, führender `/`, ein Prompt mit Leerzeichen als Positionsargument.
  - **Ergänzen:** Fall „neu“ ergänzt `--settings`, `--session-id` und `-n <Tab-Name>`. `--resume x` und `-c` erhalten nur `--settings`. `-n eigener` erhält `--settings` und `--session-id`, aber kein zweites `-n`. Ein eigenes `--settings` bekommt kein zweites `--settings`, im Fall „neu“ aber `--session-id` und `-n`.
  - **Durchreichen:** `-p "…"`, `mcp list`, `--version` und `--model opus mcp list` werden ohne Anfrage durchgereicht.
  - **Meldungen:** Start-, Prozess-ID- und Ende-Meldung kommen an, die Ende-Meldung auch nach `Ctrl+C` und bei Exit-Code ≠ 0. Der Exit-Code kommt in der Shell an.
  - **Ohne THub:** Ohne erreichbare Schnittstelle startet `claude` unverändert. Ohne `claude` im PATH kommt eine verständliche Meldung mit Exit-Code 1.
  - **Ordner:** `cd` in einen Testordner (auch mit Leerzeichen und Umlauten) führt zur Meldung dieses Ordners.
  - **Profil:** Ein Testprofil wird weiterhin geladen.
  - **Startbefehl:** Ein Startbefehl „Starter mit `--resume x`“ erreicht das nachgemachte `claude` mit `--settings`, in allen vier Shells, genau einmal.
- Diese Tests sind langsamer und laufen in einem eigenen Testlauf, getrennt von Teststelle 1.

### Nicht automatisch getestet

- Die React-Oberfläche: Das Aussehen wird am Prototyp abgestimmt, die Bedienung von Hand anhand der User Stories abgenommen.
- Die Shell-Erkennung selbst und das Verhalten unter Gruppenrichtlinien: werden von Hand geprüft.

### Werkzeuge und Vorlagen

- Testlauf mit **Vitest** (neue Entwicklungsabhängigkeit), passend zu TypeScript und esbuild. Der bestehende Typecheck bleibt.
- Im Projekt gibt es noch keine Tests, also auch keine Vorlage. Die ersten Kern-Tests setzen den Stil für alle weiteren.

## Ausserhalb des Umfangs

- Claude-Erfassung in WSL-Tabs (WSL-Tabs sind normale Terminals).
- Ein eigener Knopf oder Befehl zum Starten von Claude, an jeder Stelle der Oberfläche.
- Eigene Startbefehle pro Tab (etwa `npm run dev` automatisch nach einem Neustart).
- Fortsetzen laufender Programme ausser Claude.
- Zusätzliche Claude-Startoptionen oder Claude-Profile.
- Windows-Benachrichtigungen und Blinken in der Taskleiste.
- Geteilte Ansicht (mehrere Terminals nebeneinander) und mehrere Fenster.
- Abgleich von Tabs zwischen Rechnern.
- Ein globaler Hook in `~/.claude/settings.json`.
- Weitere Einstellungen wie Terminal-Schriftart. Eine Akzentfarbe gibt es bewusst nicht.
- Auto-Update, Autostart und Code-Signing.
- Automatisierte Tests der Oberfläche.

## Weitere Hinweise

- **Ablauf:** Zuerst entsteht ein **klickbarer Design-Prototyp im Browser** mit nachgemachten Terminals. Erst nach der Abstimmung des Looks folgt die Umsetzung in der App. Entscheidungen aus dem Prototyp (Farben, Abstände, genaue Menüs) werden hier nachgetragen.
- **AFK-Tickets und Abnahme:**
  - Ein Agent erfüllt die automatisch prüfbaren Akzeptanzkriterien, liefert einen lauffähigen Stand (`npm start`, bei Bedarf ein gebautes, nicht installiertes Paket) und eine Prüfliste für die Abnahme von Hand.
  - Die Abnahme macht der Nutzer.
  - Agenten installieren den Installer nicht über eine bestehende THub-Installation.
- **Helle Terminalfläche und Claude:** Claude Code hat ein eigenes Farbschema (`/theme`). Ob Claude auf der hellen Fläche gut aussieht, wird im Prototyp bzw. danach an der echten App geprüft. Notfalls kann die Entscheidung „Terminal folgt dem Design“ noch gekippt werden.
- **Grundlage der Claude-Anbindung** (Claude Code 2.1.328, Dokumentation Stand 2026-11-19):
  - `--session-id`, `--resume` (per Kennung auch ordnerübergreifend), `-n/--name`;
  - `--settings`: Hooks werden zu denen des Nutzers hinzugefügt, nicht ersetzt, und beim Fortsetzen nicht übernommen;
  - HTTP-Hooks mit Umgebungsvariablen in Kopfzeilen (`allowedEnvVars`);
  - nicht erreichbare HTTP-Hooks sind für Claude nur ein nicht blockierender Fehler;
  - `Stop` läuft nicht, wenn der Nutzer mit Esc unterbricht; auch `idle_prompt` kommt dann nicht;
  - `SessionStart` unterstützt keine HTTP-Hooks;
  - gibt der Nutzer ein eigenes `--settings` an, gilt nur das letzte `--settings` (kein Zusammenführen);
  - `--resume <Kennung>` aus einem anderen Ordner lässt Claude im aktuellen Ordner laufen, deshalb startet THub die Shell im Ordner der Session;
  - `"disableAllHooks": true` in den Projekt-Einstellungen schaltet auch die THub-Hooks ab; `--session-id` wirkt weiter, das Sicherheitsnetz hält (Story 38, im Spike geprüft).
  - Alle Befunde: `docs/spikes/claude-hooks.md`.
- **Offen zu prüfen:** Ob von Administratoren verwaltete Einstellungen mit `allowManagedHooksOnly` auch Hooks aus `--settings` sperren, ist nicht dokumentiert. Das Sicherheitsnetz (selbst vergebene Session-Kennung) deckt diesen Fall für das Fortsetzen ab; nur die Statusanzeige fehlt dann.
- **README aktualisieren:** Die „Offenen Punkte“ im README sind mit dieser Spezifikation beantwortet und werden bei der Umsetzung durch eine Beschreibung des neuen Verhaltens ersetzt.

### Präzisierungen nach dem Review

Diese Punkte wurden nach der Befragung bei einem Review ergänzt oder geschärft. Sie liegen im Sinn der getroffenen Entscheidungen, wurden aber nicht einzeln abgestimmt:

1. **Einfrieren:** Beendet THub selbst (App, Tab, Windows-Abmeldung), ändern spätere Ereignisse die Claude-Zuordnung nicht mehr. Sonst käme nach jedem Beenden jeder Claude-Tab als normales Terminal zurück.
2. **Ende-Meldung des Starters:** `claude` beendet sich → der Tab wird ein normales Terminal, auch ohne `SessionEnd`, also auch nach einem Absturz von Claude. Nach einem fehlgeschlagenen Fortsetzen erscheint ein Hinweis.
3. **Drei Fälle beim Start:** neu, mit Kennung, ohne Kennung. Durchgereichte Aufrufe fragen THub gar nicht erst an. Gibt der Nutzer selbst `--settings` an, laufen keine THub-Hooks.
4. **Kein Fortsetzen ohne Gespräch:** Eine per Hook bestätigte Session, in der nie ein Prompt geschrieben wurde, wird nach einem Neustart nicht fortgesetzt; der Tab kommt als normales Terminal zurück. Die zuvor angedachte Suche nach Gesprächsprotokollen in Claudes Dateien entfällt.
5. **Unterbrechung mit Esc:** Nach dem Spike korrigiert: `idle_prompt` kommt nach einer Unterbrechung nicht. Stattdessen setzt THub den Zustand auf „ruht“, wenn der Nutzer in einem arbeitenden oder wartenden Claude-Tab Esc drückt und danach etwa 1,5 Sekunden kein Hook-Ereignis kommt. Eine andere Eingabe in einem wartenden Tab setzt ihn auf „arbeitet“.
6. **Prozess-Regeln:** zwei Abfragen bis zum Zählen, Startketten und Konsolenprozesse ignoriert. Bei Claude-Tabs zählen nur Prozesse, die seit dem letzten Prompt neu sind (MCP-Server zählen nicht). WSL zeigt nie Blau. `background_tasks` aus `Stop` wird nicht verwendet.
7. **Rückfrage beim Schliessen** hängt an den eigentlichen Merkmalen, nicht am angezeigten Symbol: Ein grüner Tab mit laufendem Dev-Server fragt nach.
8. **„Wartet“-Hinweis** verschwindet auch, wenn Claude wieder arbeitet; höchstens ein Hinweis pro Tab.
9. **Zuletzt benutzte Ordner** umfassen die Startordner neuer Tabs und den letzten Ordner eines Tabs beim Schliessen.
10. **Robustheit unter Windows:** Laden per `-EncodedCommand`, Rückfall ohne Integration, `NO_PROXY`, eigener Datenordner für die Entwicklung, Gleichheit der Argumente als Grundsatz des Ersatzes, Erkennung layoutabhängiger Kürzel über das Zeichen.
11. **Beenden über das Fenster und Windows-Abmeldung** werden ausdrücklich behandelt, damit der Verlauf auch dann gesichert ist.
