# THub 2: Tabs, Claude-Sessions, die einen Neustart überleben, und neuer Look

> Status: `ready-for-agent`
> Entstanden aus einer Befragung am 2026-11-19, danach durch ein Review präzisiert (siehe „Präzisierungen nach dem Review“ am Ende). Am 2026-11-21 um „Rechner wach halten“ erweitert (Ticket 28), am 2026-11-22 um „App-Symbol“ (Ticket 29) und „Versionsnummer“ (Ticket 30); Fehler beim Wachhalten werden angezeigt (Ticket 31). Am 2026-11-23: Hinweise weichen der Eingabe aus (Ticket 32), der Countdown von „fertig“ läuft, solange das Fenster sichtbar ist (Ticket 33), Kopieren mit `Ctrl+C` und Einfügen mit `Ctrl+V` (Ticket 34). Grundlage ist das bestehende Electron-Grundgerüst (Stand 0.1.0). Umsetzung in Tickets: [docs/tickets](../tickets/README.md).

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
- **Rechner wach halten:** Ein Schalter neben dem Zahnrad verhindert den Energiesparmodus, solange THub läuft, wahlweise auch das Ausschalten des Bildschirms. Er bleibt über einen Neustart von THub eingeschaltet.
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
10. Als Nutzer möchte ich, dass neue Tabs am Ende der Leiste erscheinen, damit ich einen neuen Tab immer an derselben Stelle finde, egal welcher Tab gerade aktiv ist. (Bis Ticket 26 „rechts neben dem aktiven Tab“; nach der Abnahme geändert. Duplizieren und Wiederöffnen behalten ihre eigene Stelle.)
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
51. Als Nutzer möchte ich, dass „Fertig“-Hinweise nach etwa sechs Sekunden verschwinden, der Countdown aber nur läuft, solange THub sichtbar auf dem Bildschirm ist (auch ohne Fokus), damit ich nichts verpasse, während THub minimiert oder verdeckt ist. (Bis Ticket 33: nur, solange THub im Vordergrund ist.)
52. Als Nutzer möchte ich, dass „Wartet auf dich“-Hinweise stehen bleiben, bis ich den Tab öffne oder Claude dort wieder arbeitet, damit eine offene Frage nicht untergeht.
53. Als Nutzer möchte ich, dass sich mehrere Hinweise stapeln, damit ich alle sehe.
54. Als Nutzer möchte ich die Hinweise in den Einstellungen abschalten können, damit mich THub nicht stört, wenn ich das nicht will.
55. Als Nutzer möchte ich keine Windows-Benachrichtigungen und kein Blinken in der Taskleiste, damit THub mein System nicht zumüllt.
95. Als Nutzer möchte ich, dass die Hinweise nie verdecken, was ich gerade tippe, auch wenn mein Text bis nach rechts reicht oder über mehrere Zeilen geht, damit ich ihn lesen kann, während die Hinweise sichtbar bleiben.

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
73. Als Nutzer möchte ich mit `Ctrl+Shift+C` / `Ctrl+Shift+V` und mit Rechtsklick im Terminal kopieren und einfügen, dazu mit `Ctrl+C` kopieren, wenn etwas markiert ist, und mit `Ctrl+V` einfügen, damit das wie gewohnt funktioniert, auch in Claude. (`Ctrl+C` und `Ctrl+V` seit Ticket 34.)
74. Als Nutzer möchte ich die Terminal-Schriftgrösse mit `Ctrl` + Mausrad oder `Ctrl` `+` / `Ctrl` `-` ändern, damit ich sie schnell anpassen kann.
83. Als Nutzer möchte ich in THub eine Übersicht aller Tastenkürzel öffnen können (über die Befehlspalette und aus den Einstellungen), damit ich sie nachschlagen kann, ohne das README zu suchen.

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

### Rechner wach halten

84. Als Nutzer möchte ich oben neben dem Zahnrad einen Schalter haben, der meinen Rechner wach hält, damit Claude-Sessions, Builds und Testläufe weiterlaufen, während ich nicht am Rechner bin, ohne dass ich in jeder Claude-Session ein Wachhalte-Skript starten lassen muss.
85. Als Nutzer möchte ich zwischen zwei Stufen wählen: nur den Rechner wach halten (der Bildschirm schaltet sich aus und sperrt wie gewohnt) oder Rechner und Bildschirm wach halten, damit ich je nach Lage den Fortschritt im Blick behalten oder den Rechner abgedunkelt arbeiten lassen kann.
86. Als Nutzer möchte ich das Wachhalten mit einem Klick auf den Schalter ein- und ausschalten, mit der zuletzt gewählten Stufe, und die Stufe über ein Pfeil-Menü neben dem Schalter wählen, damit das Umschalten schnell geht.
87. Als Nutzer möchte ich, dass ein eingeschaltetes Wachhalten nach einem Neustart von THub mit derselben Stufe von selbst wieder läuft, damit ich nicht daran denken muss.
88. Als Nutzer möchte ich, dass das Wachhalten endet, sobald ich es ausschalte oder THub beende, und dass weder ein Prozess noch eine geänderte Energieeinstellung zurückbleibt, damit mein System sauber bleibt.
89. Als Nutzer möchte ich das Wachhalten auch über die Befehlspalette ein- und ausschalten können, damit ich die Hände an der Tastatur behalte.
94. Als Nutzer möchte ich einen deutlich als Fehler markierten Hinweis bekommen, wenn THub den Rechner nicht wach halten kann, und dass der Schalter dann auf „aus“ geht, damit ich mich nicht auf ein Wachhalten verlasse, das gar nicht läuft.

### App-Symbol

90. Als Nutzer möchte ich THub in der Taskleiste, bei `Alt+Tab`, im Startmenü und auf dem Desktop an einem eigenen Symbol erkennen statt am Standardsymbol von Electron, damit ich es zwischen anderen Fenstern sofort finde.
91. Als Nutzer möchte ich, dass das Symbol zum Look von THub passt und auch klein und auf heller wie dunkler Taskleiste gut erkennbar ist, damit es nicht wie ein Platzhalter wirkt.

### Versionsnummer

92. Als Nutzer möchte ich in THub sehen und mit einem Klick kopieren können, welche Version installiert ist, damit ich bei einem Fehler sagen kann, welcher Stand betroffen ist.
93. Als Nutzer möchte ich, dass jeder neue Installer eine höhere Versionsnummer trägt und ich nachlesen kann, was sich geändert hat, damit ich weiss, ob eine Korrektur schon drin ist.

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
  - **Wachhalten** (Ticket 28): die Stufe, auf der Windows den Rechner wach hält (aus, nur Rechner, Rechner und Bildschirm).
- **Eingänge** in den Kern: Befehle aus dem Renderer (darunter „Ansicht des Tabs bereit“ mit Spalten und Zeilen, angezeigter Tab, Fenster im Vordergrund ja/nein, Fenster sichtbar ja/nein), Ausgabe und Ende aus dem Terminal-Backend (der Kern erkennt darin die Ordner-Meldungen der Shell), Meldungen des `claude`-Starters, Claude-Hook-Ereignisse und Prozess-Schnappschüsse.
- **Ausgänge**: der Zustand an den Renderer (vollständiger Schnappschuss beim Laden, danach Änderungsereignisse: Tabs, Status, Hinweise, Einstellungen), Startaufträge an das Terminal-Backend, Verlauf zum Wiederherstellen.
- **Vertrag zwischen Renderer und Kern:**
  - Der Kern erteilt die Startaufträge, nicht der Renderer.
  - Ein Startauftrag wird erst ausgeführt, wenn der Renderer die Ansicht des Tabs als bereit gemeldet hat. Verdeckte Ansichten melden ihre beste bekannte Grösse und passen sie beim Anzeigen an. So geht keine Ausgabe verloren, und ein wiederhergestellter Verlauf steht immer vor der ersten Shell-Ausgabe.
  - Pausierte Claude-Tabs bekommen ihre Ansicht erst beim ersten Anzeigen.
- **Entwicklung getrennt von der installierten App:** Unpaketiert (`npm start`, `npm run dev`) verwendet THub einen eigenen Datenordner („THub-dev“) und damit eine eigene Zustandsdatei, eigene Hook-Datei und eigene Einzelinstanz-Sperre. Die Tests starten die App nicht und arbeiten in eigenen Temp-Ordnern.
- Die bestehenden Module (Zustandsspeicher mit entprelltem, atomarem Schreiben; Shell-Verwaltung mit geordnetem Beenden) bleiben erhalten und werden zum Speicher bzw. Terminal-Backend erweitert.

### Shell-Erkennung

- Erkannt werden: PowerShell 7, Windows PowerShell, cmd, Git Bash (Standard-Installationsort und Registry) sowie jede installierte WSL-Distribution einzeln. Distributionen, deren Name mit `docker-desktop` beginnt, werden ausgeblendet.
- Stabile Kennungen: `pwsh`, `powershell`, `cmd`, `gitbash`, `wsl:<Distribution>`. Jede Shell hat ausserdem einen Anzeigenamen, das Programm, die Startargumente und ein Merkmal, ob Claude darin erfasst wird (alle ausser WSL).
- Standard-Shell ist PowerShell 7, falls vorhanden, sonst Windows PowerShell. Der Nutzer kann sie in den Einstellungen ändern.
- Ein Tab speichert die Kennung seiner Shell. Ist sie beim Wiederherstellen nicht mehr vorhanden, fällt der Tab auf die Standard-Shell zurück und zeigt einen Hinweis im Terminal. Seine Kennung behält er dabei: Gibt es die Shell wieder (oder hat WSL beim Start nur zu langsam geantwortet), startet er beim nächsten Mal wieder mit ihr. Ebenso bleibt eine eingestellte Standard-Shell, die gerade fehlt, eingestellt; bis dahin gilt die automatische Wahl.
- Der Kern bekommt die Liste der erkannten Shells übergeben. Die Erkennung selbst ist maschinenabhängig und wird von Hand geprüft.
- Die Erkennung läuft beim Start parallel zum Start von Electron. PowerShell 7 wird am Standardort, im PATH und als App-Ausführungsalias der Store-Version (`%LOCALAPPDATA%\Microsoft\WindowsApps`, nur mit `lstat` sichtbar) gesucht, Git Bash an den Standardorten und unter `HKLM`/`HKCU\SOFTWARE\GitForWindows` (`InstallPath`), nie als `bash.exe` im PATH. `wsl.exe -l -q` (UTF-16LE) hat ein Zeitlimit von 2 Sekunden; fehlt WSL oder antwortet es nicht, gibt es keine WSL-Shells.
- Anzeigenamen wie im Prototyp: „PowerShell 7“, „Windows PowerShell“, „Eingabeaufforderung“, „Git Bash“, „<Distribution> (WSL)“.

### Shell-Integration

THub startet jede Windows-Shell mit einer mitgelieferten Integration. Sie lädt **zuerst das normale Profil des Nutzers** und richtet dann drei Dinge ein; in PowerShell schaltet sie davor die Befehlsvorschau ab (Punkt 4).

**Robust laden:**
- PowerShell bekommt den Integrationscode per `-EncodedCommand`, nicht als Skriptdatei, damit eine restriktive Execution Policy ihn nicht blockiert. cmd lädt seine Integration per `/k`. Git Bash lädt über eine eigene Startdatei, was auch eine Login-Shell von Git Bash lädt (`/etc/profile`, dann `~/.bash_profile`, `~/.bash_login` oder `~/.profile`, sonst `~/.bashrc`), und danach die Integration.
- Fertige, geprüfte Skripte aus dem Spike: `resources/shell/` (`starter.ps1`, `integration.ps1`, `integration.cmd`, `integration.bash`); wie das Terminal-Backend jede Shell startet, steht in `src/main/shellLaunch.ts` (Ticket 07, nach der Vorlage `buildLaunch` aus dem Spike). Befunde: `docs/spikes/starter.md`. Die Skripte liegen im Paket ausserhalb des asar-Archivs (`extraResources`).
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
     - **mit Kennung:** `--resume <Kennung>` / `-r <Kennung>` oder `--session-id <Kennung>`; ein eigenes `--session-id` bestimmt die Kennung, auch zusammen mit `--resume` und `--fork-session`;
     - **ohne Kennung:** `--continue`/`-c`, `--resume` ohne Wert (Claudes Auswahlliste), `--from-pr`, `--teleport` sowie `--fork-session` zusammen mit `--resume` ohne eigenes `--session-id` (die neue Session bekommt eine eigene Kennung).
     - `--remote-control` ändert den Fall nicht.
3. **Startparameter holen:** Anfrage an THub mit Tab-Kennung, Fall, angegebener Kennung und aktuellem Ordner, ohne Proxy und mit etwa 1 Sekunde Zeitlimit. Antwort: aktueller Tab-Name, im Fall „neu“ eine neue Session-Kennung, Pfad zur Hook-Datei. Ist THub nicht erreichbar, startet `claude` unverändert.
4. **Optionen ergänzen:**
   - `--settings <Hook-Datei>`, ausser der Nutzer gibt selbst `--settings` an; dann laufen keine THub-Hooks, das Sicherheitsnetz gilt aber weiter.
   - Im Fall „neu“ `--session-id <neue Kennung>`, auch wenn der Nutzer `-n` oder ein eigenes `--settings` angibt (sonst fehlte das Sicherheitsnetz).
   - Im Fall „neu“ ohne eigenes `-n`/`--name` auch `-n <Tab-Name>`.
5. **Starten:** Bei `claude.exe` reicht der Starter den Rest seiner rohen Befehlszeile **unverändert** durch und setzt nur die ergänzten Optionen davor. Bei `claude.cmd` quotet er die Argumente neu für `cmd.exe /d /v:off /s /c` (jedes Argument in Anführungszeichen, `&|<>^()` ausserhalb von cmd-Anführungszeichen mit drei Caret, `%` als `%%cd:~,%`, weil cmd die Zeile zweimal auswertet). Er startet den Prozess direkt mit geerbter Konsole (`System.Diagnostics.Process`, ohne ShellExecute), nicht über PowerShells eigene Argumentübergabe an native Programme. Direkt nach dem Start meldet er die Prozess-ID (bei `claude.cmd` die des `cmd.exe`; node ist ein Nachfahre). Er wartet und gibt den Exit-Code weiter; alles nach dem Start läuft in `try`/`finally`, damit `Ctrl+C` die Ende-Meldung nicht verhindert.
6. **Ende melden:** Nach dem Ende von `claude` meldet der Starter Tab-Kennung, Session-Kennung (falls bekannt) und Exit-Code an THub, auch nach `Ctrl+C` und bei Exit-Code ungleich 0.

**3. Startbefehl einmalig ausführen:** Die Integration kann einen von THub mitgegebenen Befehl genau einmal ausführen, sobald die Shell bereit ist; es werden keine Tastendrücke simuliert. THub setzt damit Claude-Sessions fort. Der Startbefehl ruft den Starter direkt auf (mit `--resume <Kennung>`), nicht das Wort `claude`, weil doskey-Makros in cmd in Skripten nicht wirken. Übergabe: In PowerShell und Git Bash über die Umgebungsvariable `THUB_START_CMD`, die die Integration vor dem Ausführen entfernt (so läuft er genau einmal, auch nicht in verschachtelten Shells); in cmd in der `/k`-Zeile hinter der Integration, nicht in der Integrationsdatei, sonst fragt cmd nach `Ctrl+C` „Batchvorgang abbrechen?“.

**4. Keine Befehlsvorschau (PowerShell, Ticket 24):** Direkt nach dem Profil setzt die Integration `Set-PSReadLineOption -PredictionSource None`, wenn PSReadLine geladen ist und die Option kennt. Damit fallen die graue Vorschau beim Tippen und die Listenansicht weg, auch wenn das Profil sie einschaltet. Windows PowerShell 5.1 bringt PSReadLine 2.0 ohne die Option mit; dort ändert sich nichts. Das Profil selbst bleibt unverändert, ausserhalb von THub gilt es wie bisher.

**Umgebung jedes Terminals:**
- `THUB_TAB_ID` (Tab-Kennung), `THUB_API` (Adresse der lokalen Schnittstelle), `THUB_TOKEN` (pro App-Start zufällig) und `THUB_STARTER` (Pfad zum Starter).
- **Execution Policy:** THub prüft einmal beim Start die Richtlinien-Ebenen (`Get-ExecutionPolicy -Scope MachinePolicy` und `UserPolicy`). Steht dort `AllSigned` oder `Restricted`, lässt THub `THUB_STARTER` weg: `claude` läuft dann direkt, ohne Erfassung, aber ohne Fehler. Ein vorher erfasster Claude-Tab wird nach einem Neustart so ebenfalls ohne Erfassung fortgesetzt; ohne Start-Meldung fällt seine Zuordnung nach einer Frist weg (siehe „Wiederherstellen“).
  - Die Prüfung läuft versteckt (`powershell.exe -NoProfile -NonInteractive`, ohne `PSModulePath`, sonst scheitert sie, wenn THub aus PowerShell 7 gestartet wurde) und parallel zum übrigen Start; jede Shell fragt das Ergebnis erst beim eigenen Start ab (`src/main/executionPolicy.ts`).
  - Solange die Prüfung läuft, nach 10 Sekunden ohne Antwort oder wenn PowerShell mit einem Fehler endet, bekommen die Shells den Ersatz. Lässt sich `powershell.exe` gar nicht starten (fehlt oder gesperrt), fehlt `THUB_STARTER` ebenfalls, weil der Starter selbst ein `powershell.exe` ist.
- `NO_PROXY` wird um `127.0.0.1,localhost` ergänzt, damit Claudes HTTP-Hooks nicht über einen Firmen-Proxy laufen.
- `PSModulePath` verliert die Modulordner von PowerShell 7 (`…\PowerShell\Modules` und `$PSHOME\Modules`, erkannt am `pwsh.exe` daneben). Wurde THub aus PowerShell 7 gestartet, stehen sie vorne, und Windows PowerShell 5.1 (Tab, Starter, `powershell.exe` aus cmd oder Git Bash) kann dann Module wie `Microsoft.PowerShell.Security` nicht laden. PowerShell 7 tut dasselbe, wenn es `powershell.exe` startet, und ergänzt seine Ordner beim eigenen Start wieder.
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

**Präzisierungen aus der Umsetzung (Ticket 24):**
- **Ursache der trägen Pfeiltasten:** die ConPTY von Windows (`conhost.exe`). Sie schickt, was PSReadLine beim Blättern im Verlauf neu zeichnet, erst mit ihrem nächsten Bild, rund 16 ms nach der Taste; sofort kommt nur `ESC[?25l` (Cursor aus). Das Windows Terminal benutzt seine eigene ConPTY (`OpenConsole.exe`), dieselbe liefert node-pty 1.1.0 mit (`useConptyDll`, Version 1.23); sie reicht die Zeile nach 1 bis 5 ms weiter.
- **Gemessen** von der Taste bis zur neu gezeichneten Zeile (PowerShell 7, Median aus 40 Tasten):

  | Stelle | vorher | nachher |
  |---|---|---|
  | node-pty, eigenes pwsh ohne THub | 15,8 ms | 1,1–1,5 ms |
  | Terminal-Backend mit Integration (`PtyManager`) | 15,7 ms | 1,5 ms |
  | nach dem Workspace-Kern | 15,7 ms | 1,8 ms |
  | Shell-Test mit Zeitgrenze (15 Tasten, Grenze 10 ms) | 15,2–15,4 ms | grün |
  | in der App: Zeile im Renderer angekommen | 14,3 ms | 3,2 ms |
  | in der App: im DOM gezeichnet (nach `term.write` und Rendern) | 17,2 ms | 11,5 ms |
  | in der App: nächstes Bild danach | 23,0 ms | 17,2 ms |

  Kern (Zähler, Erkennung der Ordner-Meldung pro Stück, keine Sammlung der Ausgabe), IPC und xterm.js kosten zusammen rund 4 ms plus das Warten auf das nächste Bild des Renderers; das bleibt. Weder das Tastenkürzel-Handling (0,5 ms bis zum eigenen Handler) noch eine Pufferung um Esc (nur in Claude-Tabs, ohne Verzögerung der Eingabe) noch die Integration (nichts läuft pro Taste) tragen bei. Die App-Messung lief im Testmodus mit synthetischen Tasten über CDP.
- **Terminal-Backend:** startet jede Shell über die mitgelieferte ConPTY. Lässt sie sich nicht starten (etwa wenn `conpty.dll` oder `OpenConsole.exe` im Paket fehlt), startet es dieselbe Shell über die ConPTY von Windows und bleibt für den Rest der Sitzung dabei; scheitert auch das, gilt dieser Fehler.
- **Abfrage der Terminal-Merkmale:** Die mitgelieferte ConPTY schickt beim Start `ESC[c` (DA1) und startet die Shell erst nach der Antwort, ohne Antwort nach gut 3 Sekunden. In der App antwortet xterm.js, in den Shell-Tests das Testgerüst genauso.
- **Start im leeren Bereich:** Die mitgelieferte ConPTY leert den sichtbaren Bereich beim Start nicht, zeichnet aber ab seiner ersten Zeile und setzt den Cursor danach auch absolut. Darum setzt die Oberfläche vor jedem Start den Cursor oben links in einen leeren Bereich (`startArea` in `history.ts`): nach dem wiederhergestellten Verlauf, nach einem Hinweis vor dem Start und beim Neustart nach dem Ende der Shell. Beim Neustart rutscht das Bisherige samt der Zeile „Prozess beendet“ in den Scrollback; vorher löschte das `ESC[2J` der ConPTY von Windows den sichtbaren Teil.
- **Konsolen-Host:** `OpenConsole.exe` statt `conhost.exe`, wie schon von Prozess-Sonde und Regeln vorgesehen; nach einem `exit` endet er von selbst. Das Aufräumen nach Ticket 15 bleibt für den Rückfall und für den Worker von node-pty.
- **Befehlsvorschau:** geprüft wird mit `Get-Command Set-PSReadLineOption -ParameterName PredictionSource`, das auch im Constrained Language Mode geht. Ein Nutzer kann sie in einem THub-Tab von Hand wieder einschalten; die Integration setzt sie nur beim Start.

**Präzisierungen aus der Umsetzung (Ticket 24, zweite Runde):**
- **Befund:** Auch mit der mitgelieferten ConPTY brauchte beim Nutzer jede Pfeiltaste im Befehlsverlauf rund 1 Sekunde. Das galt in jedem PowerShell-Fenster, auch ausserhalb von THub und in Windows PowerShell 5.1; cmd war flüssig. Ein `Set-PSReadLineOption -HistorySaveStyle SaveNothing` im betroffenen Fenster machte es sofort flüssig, mit demselben Verlauf im Speicher. Die Ursache lag also nicht in THub, sondern beim Verlaufs-Mutex von PSReadLine.
- **Mechanismus** (Quelltext von PSReadLine 2.0.0 und 2.4.5, in beiden gleich):
  - Mit dem Standard `HistorySaveStyle SaveIncrementally` ruft jede Taste, die im Verlauf blättert oder sucht (`PreviousHistory`, `NextHistory`, `HistorySearchBackward`, `ReverseSearchHistory` usw.), zuerst `SaveCurrentLine` auf, das `MaybeReadHistoryFile`.
  - `MaybeReadHistoryFile` wartet mit `WaitOne(1000)` auf den benannten Mutex `PSReadLineHistoryFile_<Hash>` (FNV-1a über den kleingeschriebenen Pfad der Verlaufsdatei). Danach prüft es die Grösse der Datei und liest nur, was andere Sitzungen angehängt haben.
  - Alle PowerShell-Sitzungen mit derselben Verlaufsdatei teilen diesen Mutex, Windows PowerShell 5.1 und PowerShell 7 gleichermassen. Ein Enter schreibt den Befehl unter demselben Mutex, mit `WaitOne(100)`; eine neue Sitzung liest den Verlauf beim ersten Prompt mit `WaitOne(1000)`.
  - Ist der Mutex frei, kostet das alles unter 1 ms.
- **Externe Ursache:** Eine hängengebliebene Windows PowerShell 5.1 im Terminal von IntelliJ hielt den Mutex dauerhaft.
  - Ermittelt per `NtQueryMutant(MutantOwnerInformation)`: Besitzer war ihr Hauptthread, untätig am Prompt.
  - PSReadLine 2.0.0, das Windows PowerShell 5.1 mitbringt, gibt einen verlassenen Mutex nicht frei. Endet ein Prozess, während er den Mutex hält, bekommt die nächste Sitzung ihn mit `AbandonedMutexException`. 2.0.0 versucht es dann erneut, ohne vorher freizugeben, und der Thread besitzt den Mutex danach bis zum Ende seines Prozesses. Behoben ab PSReadLine 2.2.0-beta4; 2.4.5 gibt einen verlassenen Mutex richtig frei.
  - Solange der Mutex gehalten wird, wartet jede Taste im Verlauf bis zum Zeitlimit von 1 s. Ein Enter wartet ebenfalls und schreibt den Befehl nicht in die Datei. PSReadLine 2.4.5 holt das beim nächsten Befehl nach, sobald der Mutex frei ist; endet die Sitzung vorher, fehlt der Befehl. Eine neue Sitzung wartet beim ersten Prompt 1 s und hat danach keinen Verlauf aus der Datei.
  - Nach dem Schliessen der IntelliJ-Sitzung war der Mutex frei und das Blättern überall flüssig.
- **Gemessen** unter blankem node-pty mit der mitgelieferten ConPTY, ohne THub und ohne Integration, mit synthetischem Verlauf in einem Temp-Ordner (nie der echte). Die Zeit reicht von der Taste bis zum letzten Ausgabestück:

  | Fall | Pfeiltaste |
  |---|---|
  | cmd | 0,3 ms |
  | PowerShell 7.7, leerer Verlauf | 2,0 ms |
  | PowerShell 7.7, 9000 Einträge, Mutex frei | 2,9 ms (p95 4,6 ms) |
  | Windows PowerShell 5.1, 9000 Einträge, Mutex frei | 3,6 ms (p95 4,5 ms) |
  | PowerShell 7.7, Mutex von einer Windows PowerShell 5.1 gehalten | 1007 bis 1016 ms |
  | zweite Windows PowerShell 5.1, Mutex gehalten | 590 bis 870 ms |
  | neue PowerShell 7.7, nachdem die haltende Sitzung beendet ist | 2 bis 4 ms (erste Taste 19 ms) |

  - Nachgestellt wurde das so, zweimal mit demselben Ergebnis: Ein Prozess endet, während er den Mutex hält. Eine Windows PowerShell 5.1 blättert einmal und hält ihn ab dann (Besitzer laut `NtQueryMutant`: ihr Hauptthread). Eine PowerShell 7 auf derselben Datei braucht danach rund 1 s pro Pfeiltaste. Endet die Windows PowerShell 5.1, gibt die nächste PowerShell 7 den verlassenen Mutex richtig frei, und alles ist wieder schnell.
  - Verlaufsgrösse, Duplikate und Dateizugriffe sind nicht die Ursache. Mutex, Grösse der Datei und Öffnen kosten je unter 1 ms, auch mit dem Virenscanner, der Dateien namens `ConsoleHost_history.txt` gesondert prüft (Öffnen 0,35 statt 0,06 ms).
- **THub ändert nichts an der Speicherung des Verlaufs.** Die Auswege wurden geprüft und verworfen:
  - `SaveAtExit` überschriebe die Datei beim Beenden mit dem Stand der einen Sitzung: höchstens `MaximumHistoryCount` Einträge, ohne die Befehle anderer Sitzungen. Wird der Prozess beendet, speicherte es gar nichts.
  - `SaveNothing` oder ein eigener Pfad trennten den Verlauf der THub-Tabs von den übrigen Fenstern.
  - Abhilfe ist, die haltende Sitzung zu beenden. Vorbeugend PSReadLine in Windows PowerShell 5.1 aktualisieren (`Install-Module PSReadLine -Scope CurrentUser -Force`, ab 2.2) oder in anderen Terminals PowerShell 7 verwenden. Auch ein Windows-PowerShell-Tab in THub hat PSReadLine 2.0.
- **Prüfen** in einer beliebigen PowerShell. Der Befehl öffnet die Verlaufsdatei nicht. Er nimmt den Mutex nur, wenn er frei ist (wie PSReadLine bei jeder Taste), gibt ihn sofort zurück und zeigt `frei` oder `belegt`:

  ```powershell
  $p = (Get-PSReadLineOption).HistorySavePath.ToLower(); $h = [uint64]2166136261
  foreach ($c in [int[]]$p.ToCharArray()) { foreach ($b in ($c -band 255), ($c -shr 8)) { $h = (($h -bxor $b) * 16777619) % 4294967296 } }
  $m = $null
  if (-not [Threading.Mutex]::TryOpenExisting("PSReadLineHistoryFile_$h", [ref]$m)) { 'frei' }
  else { try { $frei = $m.WaitOne(0) } catch [Threading.AbandonedMutexException] { $frei = $true }; if ($frei) { $m.ReleaseMutex(); 'frei' } else { 'belegt' } }
  ```

  Bleibt es über mehrere Versuche bei `belegt`, hält eine Sitzung den Mutex fest.

### Hook-Empfänger und lokale Schnittstelle

- Ein kleiner HTTP-Server im Hauptprozess, gebunden nur an `127.0.0.1` auf einem zufälligen freien Port. Jede Anfrage muss das Token mitschicken, sonst wird sie mit 403 abgewiesen. Anfragen zu unbekannten Tabs werden ignoriert.
- **Endpunkte:**

| Endpunkt | Von | Inhalt | Antwort |
|---|---|---|---|
| `POST /claude/launch` | Starter, vor dem Start | Tab-Kennung, Fall, angegebene Kennung, aktueller Ordner | Tab-Name, neue Session-Kennung (nur Fall „neu“), Pfad zur Hook-Datei |
| `POST /claude/started` | Starter, direkt nach dem Start | Tab-Kennung, Prozess-ID von Claude | leer |
| `POST /claude/exit` | Starter, nach dem Ende | Tab-Kennung, Session-Kennung, Exit-Code | leer |
| `POST /hooks/<Ereignis>` | Claude Code (HTTP-Hooks; `SessionStart` über `curl.exe`, siehe unten) | Hook-Nutzdaten | immer sofort leerer Erfolg mit leerem Inhalt; einzige Ausnahme `SessionStart` mit der Anweisung für offene Punkte (siehe „Offene Punkte aus Claudes Antworten“) |

- Die **Hook-Datei** erzeugt THub bei jedem Start neu im eigenen Datenordner:
  - Hooks vom Typ `http` auf `/hooks/<Ereignis>`, mit den Kopfzeilen `X-THub-Tab: $THUB_TAB_ID` und `X-THub-Token: $THUB_TOKEN`. Beide Variablen stehen in `allowedEnvVars`. Timeout 2 Sekunden.
  - Registrierte Ereignisse per HTTP: `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure`, `Notification`.
  - **`SessionStart` unterstützt keine HTTP-Hooks** (Claude überspringt sie still). Dafür gibt es einen Befehls-Hook ohne Shell (Exec-Form), der die Nutzdaten mit dem `curl.exe` von Windows an `/hooks/SessionStart` weiterleitet. curl liest Tab-Kennung und Token selbst aus der Umgebung (`--variable %VAR` mit `--expand-header`), mit `--connect-timeout 1 -m 2` und Hook-Timeout 3 Sekunden. Die Ausgabe dieses Hooks liest Claude (curl gibt die Antwort unverändert aus); deshalb ist die Antwort leer, ausser THub gibt Claude bei eingeschalteter Einstellung die Anweisung für offene Punkte als JSON mit `additionalContext` mit. Fehlt `curl.exe`, entfällt der Eintrag; die Zuordnung läuft dann über die Ersatzregel „neue Kennung in einem anderen Ereignis“ (siehe Zustandsautomat).
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
| Nutzer drückt Enter oder eine Zifferntaste (die eigentliche Antwort, etwa „1“, „2“, „3“) in einem Claude-Tab, der „wartet“ | Zustand „arbeitet“. Nach einer Bestätigung kommt bis `PostToolUse` kein Ereignis; ein langer bestätigter Befehl bliebe sonst orange |
| Nach dieser Antwort kommt innerhalb von etwa 3 Sekunden weder ein Hook-Ereignis (ausser `Notification`) noch ein neuer Nachfahre des Claude-Prozesses, der nach der Antwort gestartet ist (Prozess-Sonde; Konsolen-Hosts zählen nicht) | Zustand „ruht“, ohne „fertig, noch nicht angeschaut“. So endet eine Ablehnung mit „No“ und Enter, nach der Claude nichts meldet; ein bestätigter langer Befehl bleibt „arbeitet“, weil sein Prozess läuft. Liefert die Sonde nichts Brauchbares (keine Sonde, Prozess-ID von Claude unbekannt oder Claude nicht zu finden), bleibt es bei „arbeitet“, bis ein Hook kommt |
| Pfeiltasten, andere Navigationstasten (Pos1, Ende, Bild auf/ab, Tab) und andere Tasten in einem Claude-Tab, der „wartet“ | keine Änderung: Sie wählen nur in der Rückfrage aus |
| `Stop`, `StopFailure` | Zustand „ruht“; war der Tab dabei nicht sichtbar (nicht aktiv oder Fenster nicht im Vordergrund), „fertig, noch nicht angeschaut“ setzen |
| `SessionEnd` mit Grund `clear` oder `resume` | keine Änderung (ein `SessionStart` mit neuer Kennung folgt) |
| `SessionEnd` mit anderem Grund; Ende-Meldung des Starters; Ende der Shell | Tab wird normales Terminal, Claude-Zuordnung entfällt. Ausnahme: Nach einem von THub gestarteten Fortsetzen ohne vorheriges `SessionStart` entscheidet erst die Ende-Meldung des Starters (ein fehlgeschlagenes Fortsetzen schickt `SessionEnd` mit Grund `other` etwa 1,5 Sekunden vor dem Prozessende) |
| Ende-Meldung **ohne** vorheriges `SessionStart` und mit Exit-Code ≠ 0 nach einem von THub gestarteten Fortsetzen | zusätzlich Hinweis im Terminal „Claude-Session konnte nicht fortgesetzt werden“. Exit-Code ≠ 0 heisst Fehlstart; `/exit` und zweimal `Ctrl+C` enden mit 0. Wie `SessionStart` zählt hier jedes andere Hook-Ereignis ausser `SessionEnd` als Lebenszeichen (etwa ohne `curl.exe`); ein späterer eigener Start von Claude in derselben Shell ist kein Fortsetzen mehr |
| Nach einem von THub abgesetzten Fortsetzen kommt innerhalb von 30 Sekunden keine Start-Meldung des Starters | Tab wird normales Terminal, Claude-Zuordnung entfällt; Claude läuft ohne Erfassung in der Shell weiter (siehe „Wiederherstellen“). Eine spätere Start-Meldung derselben Session stellt die Zuordnung wieder her |
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

**Präzisierungen aus der Umsetzung (Ticket 13):**
- Antworten des Terminals, die über denselben Weg wie Tasten kommen (Fokus-Meldungen, Maus, Cursor-Position, Geräteattribute, OSC- und DCS-Antworten), sind keine Eingabe des Nutzers; Claude Code schaltet etwa Fokus-Meldungen ein. Esc ist genau die Taste Esc allein; eine Antwort ist genau Enter oder eine einzelne Ziffer.
- Die Wartezeiten nach Esc und nach einer Antwort beendet jedes Hook-Ereignis ausser `Notification`: Benachrichtigungen kommen verzögert (Rückfrage nach etwa 6 Sekunden) und zeigen nicht, dass Claude weitermacht.
- Für die Wartezeit nach einer Antwort zählt nur eine Abfrage der Sonde, die nach der Antwort angefordert wurde; ein dabei gesehener neuer Prozess genügt, auch wenn er bei der nächsten Abfrage schon beendet ist. Läuft beim Ablauf der Wartezeit gerade eine Abfrage, entscheidet ihr Ergebnis mit.
- Bis der Renderer zum ersten Mal meldet, ob das Fenster im Vordergrund ist, gilt es als im Hintergrund.
- Mit der Claude-Zuordnung entfallen auch Zustand und „fertig, noch nicht angeschaut“. Ein neuer Start von Claude beginnt bei „ruht“. Der Zeitpunkt des letzten Prompts bleibt bei einer neuen Session (`/clear`) stehen, weil der Claude-Prozess derselbe bleibt.
- Verwaiste MSYS-Programme zählen nur in normalen Git-Bash-Tabs; in Claude-Tabs zählen allein die Nachfahren des Claude-Prozesses.

**Hinweise im Fenster:**
- Der Kern löst einen Hinweis aus, wenn ein nicht sichtbarer Tab in „wartet auf dich“ wechselt oder fertig wird. Pro Tab gibt es höchstens einen solchen Hinweis; ein neuer ersetzt den alten. Offene Punkte (siehe unten) haben einen eigenen Platz. Hinweise verschiedener Tabs stehen gleichzeitig übereinander; wird ein Tab angezeigt (auf welchem Weg auch immer), verschwindet nur dessen Hinweis.
- „Fertig“ verschwindet nach etwa 6 Sekunden, in denen das Fenster sichtbar ist (bis Ticket 33: Vordergrundzeit), oder beim Anzeigen des Tabs.
- „Wartet“ verschwindet beim Anzeigen des Tabs oder wenn der Tab wieder arbeitet.
- Hinweise nehmen dem Terminal nie den Fokus.
- Sind Hinweise in den Einstellungen abgeschaltet, löst der Kern keine aus. Die Status-Symbole bleiben.

**Präzisierungen aus der Umsetzung (Ticket 14):**
- Ein „wartet“-Hinweis entsteht nur beim Wechsel in „wartet auf dich“; die verspätete Benachrichtigung zur selben Rückfrage löst keinen neuen aus. Wurde der Tab angezeigt und wartet Claude weiter, kommt beim Wegwechseln kein neuer.
- „Wartet“ verschwindet, sobald der Tab nicht mehr wartet, auf jedem Weg: Hook-Ereignis, Antwort im Terminal, Esc, Ende von Claude oder der Shell.
- Das × nimmt nur den Hinweis weg; „fertig, noch nicht angeschaut“ und „wartet“ bleiben am Tab. Ein geschlossener Tab nimmt seinen Hinweis mit.
- Der Countdown von „fertig“ hält auch an, solange die Maus auf dem Hinweis steht (wie im Prototyp). Wird „fertig“ erneut ausgelöst, beginnt er von vorn.
- Beim Ausschalten der Einstellung verschwinden auch die Hinweise, die gerade stehen.
- Die Spalte der Hinweise beginnt unter der Titelleiste und überdeckt deren Zieh-Fläche nie; reicht der Platz nicht, scrollt sie. Die Karten sind deckend (kein Mica), auch beim Überfahren.

**Lage über der Eingabe (Ticket 32, vom Nutzer am 2026-11-23 gewählt):**
- Der Stapel verdeckt nie die Eingabe im sichtbaren Tab, also die Zeilen von ihrem Anfang bis zur Zeile mit dem Cursor von xterm.js. Er liegt unter der Eingabe, wenn der ganze Stapel dort Platz hat (der bisherige Platz), sonst über der Eingabe, wenn er dort ganz Platz hat, sonst im grösseren der beiden Bänder (scrollbar). Wie weit der Text nach rechts reicht, zählt nicht; so liegt der Stapel in einem Claude-Tab ruhig über dem Eingabefeld und springt beim Tippen nicht.
- Anfang der Eingabe: die erste nicht umbrochene Zeile (`isWrapped`) ab der Cursorzeile aufwärts; liegt in höchstens halber Terminalhöhe darüber eine Zeile nur aus Rahmenzeichen über mindestens die halbe Breite (Claudes Linie über dem Eingabefeld), gilt die nächste solche Zeile.
- Steht die Eingabe nicht im Bild (nach oben gescrollt), liegt der Stapel wie bisher. Er bewegt sich erst, wenn die neue Lage kurz unverändert war (kein Zucken beim Neuzeichnen von Claude), gleitet mit 180 ms an den neuen Platz und bleibt stehen, solange die Maus auf einer Karte steht. Gilt für alle Hinweise.
- Verworfen: erst ausweichen, wenn der Text in den Bereich der Karte reicht (springt beim Tippen); beim Tippen durchsichtig (offene Punkte verschwinden beim Beantworten); Terminal verkleinern (ändert die Grösse der Shell).

**Präzisierungen aus der Umsetzung (Ticket 32):**
- **Cursor von Claude Code** (belegt durch lesendes Durchsuchen des installierten Claude Code 2.1.330): Sein Ink-Renderer kennt eine Cursor-Deklaration. Eine Komponente meldet ihren Knoten und die Lage darin; nach jedem Bild setzt der Renderer den echten Terminal-Cursor dorthin (im Vollbild-Modus absolut, sonst relativ). Das Eingabefeld des Prompts meldet die Stelle, an der getippt wird, solange es den Fokus hat; ebenso Suchfelder, Auswahllisten (Rückfragen) und „Enter y/n“. Gesetzt wird der Cursor immer, sichtbar ist er nur mit der Option `nativeCursor`. Die Cursorzeile von xterm.js liegt in einem Claude-Tab also im Eingabefeld.
- **Zeichen der Linie:** Claude zeichnet das Eingabefeld mit `borderStyle: "round"` ohne linken und rechten Rand. Darüber und darunter steht also je eine volle Linie aus `─` (U+2500), ohne Ecken. Erkannt wird jede Zeile, die ohne Leerzeichen nur aus Zeichen des Blocks „Box Drawing“ (U+2500 bis U+257F) besteht und mindestens die halbe Breite einnimmt; das trifft auch die obere Zeile eines alten Rahmens `╭──╮`. Die Linie unter dem Eingabefeld und die Statuszeile bleiben frei, weil der Stapel ganz über dem Anfang der Eingabe oder ganz unter der Cursorzeile steht.
- **Umbrochene Zeilen:** ConPTY reicht in cmd das Umbrechen an xterm.js durch (`isWrapped`), für einen langen getippten Befehl ebenso wie für einen Prompt, der selbst über zwei Zeilen geht (langer Pfad). Die Eingabe beginnt dann in der ersten Zeile des Prompts.
- **Abstände:** Zur Eingabe bleibt eine halbe Zeile, zur Titelleiste 10 px und zum unteren Fensterrand 18 px wie bisher. Passt der Stapel in keines der beiden Bänder, endet die scrollbare Spalte auf der Seite der Eingabe genau an ihr, damit gescrollte Karten sie nicht streifen.
- **Masse:** Die Zeilenhöhe ist die Höhe des Terminal-Elements von xterm.js geteilt durch die Zahl der Zeilen; dessen Oberkante ist die Oberkante der ersten sichtbaren Zeile. Die Cursorzeile ist der Cursor im Puffer abzüglich der Scroll-Position.
- **Ruhe:** Ausgewertet wird höchstens einmal pro Bild. Der Stapel übernimmt eine neue Lage erst, wenn sie 100 ms unverändert war; kehrt die Lage vorher zur angezeigten zurück (Claude setzt den Cursor beim Neuzeichnen kurz woanders hin), bewegt er sich gar nicht. Steht noch keine Karte, gilt die neue Lage sofort: Der erste Hinweis erscheint gleich am richtigen Platz und gleitet dort herein. Ohne Karten misst die Oberfläche nichts.
- **Bewegung:** Die Spalte gleitet mit 180 ms und der Ease aus dem Design; bei reduzierter Bewegung springt sie.
- **Maus:** Der Stapel steht still, solange die Maus auf einer Karte steht. Die Lücke zwischen zwei Karten gehört dem Terminal; dort darf der Stapel nachrücken. Verschwindet die Karte unter der Maus, hält nichts mehr.
- **Verstecktes Fenster:** Ist das Fenster nicht sichtbar, ruft der Browser keine Bilder ab; dann wird stattdessen über einen Zeitgeber ausgewertet, damit der Stapel beim Zurückkehren schon richtig steht.

**Countdown, solange das Fenster sichtbar ist (Ticket 33, vom Nutzer am 2026-11-23 entschieden):**
- Der Countdown von „fertig“ läuft, solange das Fenster sichtbar ist und die Maus nicht auf der Karte steht; der Fokus spielt dafür keine Rolle mehr. Nicht sichtbar heisst: minimiert, versteckt, von anderen Fenstern ganz verdeckt oder Bildschirm gesperrt. Bis zur ersten Meldung gilt das Fenster als nicht sichtbar.
- Ob ein Tab als angeschaut gilt und ob ein Hinweis überhaupt erscheint, hängt weiter am Vordergrund.
- Bekannte Grenze: Ein nur teilweise verdecktes Fenster gilt als sichtbar, auch wenn gerade die Hinweise verdeckt sind.

### Offene Punkte aus Claudes Antworten

- **Anweisung:** Bei eingeschalteter Einstellung antwortet THub auf `/hooks/SessionStart` mit `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`. Wortlaut des Kontexts: „Hinweis von THub: Nur wenn du für den nächsten Schritt eine Entscheidung, Antwort oder Handlung des Nutzers brauchst, die du nicht selbst treffen oder erledigen kannst, schreibe sie am Ende der Antwort unter der Überschrift ‚Offene Punkte‘ als kurze Aufzählung, ein Punkt pro Zeile. Das ist die Ausnahme: Die meisten Antworten haben keine offenen Punkte, dann lass den Abschnitt weg. Keine Angebote für weitere Arbeit, keine Vorschläge, keine Zusammenfassung und nichts erfinden, nur um den Abschnitt zu füllen.“ Weil `SessionStart` auch bei Fortsetzen, `/clear` und Kompaktieren kommt, gilt die Anweisung in jeder Session. Sind Hooks gesperrt, entfällt das Feature.
- **Erkennung** beim Ereignis `Stop` im Feld `last_assistant_message`: eine Überschrift (Markdown-Überschrift, fette Zeile oder Zeile mit Doppelpunkt) „Offene Punkte“, „Offene Fragen“, „Noch offen“, „Fragen an dich“, „Zu klären“, „Open points“ oder „Open questions“, mit den Aufzählungspunkten darunter. Nur dieser ausdrückliche Abschnitt zählt: Eine Überschrift ohne Aufzählung darunter ergibt keinen Hinweis, und eine Frage am Ende einer Antwort ohne Abschnitt (etwa ein Angebot wie „Soll ich auch noch …?“) ist kein offener Punkt. Inhalt von Code-Blöcken zählt nie.
- **Hinweis:** unten rechts mit Tab-Name, „Offene Punkte (n)“ und höchstens vier Punkten (je höchstens zwei Zeilen, darunter „+ k weitere“). Ein Klick springt in den Tab und schliesst den Hinweis; × schliesst ihn ohne Sprung. Das blosse Anzeigen des Tabs lässt ihn stehen, und er erscheint auch für den sichtbaren Tab. Pro Tab höchstens einer; eine neue Antwort mit offenen Punkten ersetzt ihn, eine ohne lässt ihn stehen; er ersetzt den „Fertig“-Hinweis desselben Tabs.
- **Gespeichert:** Nicht geschlossene Hinweise stehen pro Tab im Zustand und erscheinen nach einem Neustart wieder; mit einem geschlossenen Tab verschwindet auch sein Hinweis.
- **Einstellung** „Offene Punkte aus Claudes Antworten anzeigen“ im Abschnitt „Hinweise“, Standard: an. Ausgeschaltet entfallen Hinweis und Anweisung.

**Präzisierungen aus der Umsetzung (Ticket 22):**
- Die Antwort auf `SessionStart` ist JSON nur aus ASCII-Zeichen (alles andere als `\uXXXX`), damit sie über die Ausgabe von `curl.exe` unabhängig von jeder Zeichenkodierung unverändert ankommt. Sie kommt für jeden bekannten Tab, auch während die Zuordnungen beim Beenden eingefroren sind; zu unbekannten Tabs bleibt sie leer. Geprüft mit Claude Code 2.1.329 ohne Prompt (Start, Vertrauensdialog, `/exit`) und der echten Hook-Datei: Das Debug-Log meldet „Parsed initial response“ mit korrekt dekodierten Umlauten und „Hook SessionStart (…curl.exe…) provided additionalContext (286 chars)“, genau die Länge des damaligen Wortlauts; mit ausgeschalteter Einstellung kein `additionalContext`. Zum Wortlaut aus Ticket 27 siehe unten.
- Überschriften: Hervorhebung, ein Doppelpunkt am Ende und alles vor dem ersten Buchstaben (Emoji, Nummerierung wie „3.“) zählen nicht; die Überschrift muss mit einem der Begriffe als ganzen Wörtern beginnen („Offene Punkte (2)“ zählt, „Offene Punkteliste“ nicht). Gross- und Kleinschreibung zählen nicht. Dazu „Noch offene Punkte“ und „Noch offene Fragen“, die gebeugte Form von „Noch offen“. Auch unterstrichene Markdown-Überschriften (Setext) zählen.
- Aufzählungen: `-`, `*`, `+`, `•`, `1.` und `1)`, auch mit Kästchen (`- [ ]`). Es zählen die Punkte der obersten Ebene, mit ihren Fortsetzungszeilen; Unterpunkte, eigene Absätze und eingerückte Code-Blöcke unter einem Punkt gehören zu ihm und zählen nicht einzeln. Die Aufzählung endet an einem Absatz nach einer Leerzeile, an einer Überschrift, einer Trennlinie oder einem nicht eingerückten Code-Block. Mehrere Abschnitte zählen zusammen.
- Steht unter keiner solchen Überschrift eine Aufzählung, gibt es keine offenen Punkte. Die Regel für die Frage am Ende des letzten Absatzes aus Ticket 22 ist mit Ticket 27 entfallen: Angebote wie „Soll ich auch noch …?“ lösten fast nach jeder Antwort einen Hinweis aus.
- Die Punkte kommen ohne Aufzählungszeichen, Kästchen, Hervorhebung, Links (nur ihr Text) und Backticks in den Hinweis. Höchstens 20 Punkte zu je höchstens 300 Zeichen (gekürzt mit „…“).
- Nur `Stop` zählt, nicht `StopFailure`. Ein Hinweis mit offenen Punkten setzt am Tab weiterhin „fertig, noch nicht angeschaut“, wenn der Tab nicht sichtbar war; nur der „fertig“-Hinweis entfällt. Kommt danach eine Antwort ohne Punkte, erscheint „fertig“ wie bisher neben dem stehenden Hinweis mit offenen Punkten. Neben „wartet“ kann er ebenfalls stehen. Das Anzeigen des Tabs nimmt nur „wartet“ und „fertig“ weg; der Hinweis mit offenen Punkten hat keinen Countdown.
- Endet Claude im Tab, bleibt der Hinweis. Ein geschlossener Tab kommt ohne seine offenen Punkte in die Liste der geschlossenen Tabs; wieder geöffnet erscheint der Hinweis nicht mehr. Beim Ausschalten der Einstellung verschwinden auch die stehenden und gespeicherten offenen Punkte; ein Zustand mit ausgeschalteter Einstellung und gespeicherten Punkten verliert sie beim Laden. „Hinweise im Fenster“ wirkt nur auf „wartet“ und „fertig“.
- Die Karte zeigt statt eines Status-Symbols ein neutrales Aufzählungssymbol; jeder Punkt hat seinen ganzen Text im Tooltip.

**Präzisierungen aus der Umsetzung (Ticket 27):**
- Der Klick auf einen Hinweis geht als eigener Befehl `openToast` an den Kern, nicht mehr als `activateTab`, das auch Tab-Leiste, Tastenkürzel und Befehlspalette benutzen. Der Kern zeigt den Tab an und nimmt dabei einen Hinweis mit offenen Punkten weg, auch aus dem gespeicherten Zustand. Das gilt auch, wenn der Tab schon aktiv ist; dann bekommt nur sein Terminal den Fokus. „Wartet“ und „fertig“ verhalten sich beim Klick wie bisher: Sie verschwinden, weil der Tab angezeigt wird. Ein Klick auf einen Hinweis, den der Kern inzwischen weggenommen oder ersetzt hat, ändert nichts.
- Eine ganz fette Zeile beendet eine Aufzählung jetzt immer, auch wenn sie mit „?“ endet; die Ausnahme für eine fette Frage diente nur der entfallenen Regel für die Frage am Ende.
- Gespeicherte offene Punkte aus der Zeit vor Ticket 27 (etwa eine Schlussfrage) erscheinen nach dem Update weiter, bis sie geschlossen werden; beim Laden wird nicht neu erkannt.
- Der neue Wortlaut hat 511 Zeichen. Er geht wie bisher als JSON nur aus ASCII-Zeichen zurück. Geprüft mit echten HTTP-Anfragen und mit dem `curl.exe`-Befehl aus der Hook-Datei gegen eine Test-Schnittstelle; ein Start von Claude Code entfiel, weil er Einträge in der Claude-Konfiguration des Nutzers hinterlässt. Eine laufende Session behält die alte Anweisung bis zum nächsten `SessionStart` (neue Session, `/clear`, Fortsetzen, Kompaktieren).

### Wiederherstellen

- **Beim Start**, pro Tab in gespeicherter Reihenfolge:
  - **Normaler Tab:** Shell im zuletzt aktiven Ordner starten, mit Rückfall auf Startordner, Standardordner und Benutzerordner.
    - Vor dem Start der Shell schreibt der Renderer den gespeicherten Verlauf ausgegraut ins Terminal, dazu eine Trennlinie „Wiederhergestellt · <Datum, Uhrzeit>“ und so viele Leerzeilen, dass alles im Scrollback liegt; danach steht der Cursor oben links im leeren sichtbaren Bereich, wo ConPTY die Shell zeichnet (Ticket 24, siehe „Shell-Integration“).
    - Den Verlauf mit `conptyInheritCursor` direkt über dem neuen Prompt stehen zu lassen, wurde versucht und verworfen (Ticket 21): ConPTY zeichnet beim Ändern der Fenstergrösse seinen Bereich an festen Zeilen neu und überschreibt dabei Trennlinie, Verlauf oder Zeilen der Shell, und ohne Antwort auf die Cursor-Abfrage startet die Shell gar nicht. Befunde: `docs/spikes/verlauf-sichtbar.md`.
    - Das Ausgrauen muss auch über Farb-Resets im gespeicherten Inhalt hinweg wirken.
  - **Claude-Tab, der fortgesetzt werden soll:** Er hat eine Session-Kennung und entweder einen Prompt erlebt oder ist unbestätigt (Sicherheitsnetz ohne Hooks).
    - Eine Kennung, die nicht nur aus Buchstaben, Ziffern, `-` und `_` besteht (etwa ein getipptes `claude --resume <Suchbegriff>`, das Claude nie bestätigt hat), kommt nie in einen Startbefehl; der Tab kommt dann als normales Terminal zurück. Claude selbst vergibt UUIDs.
    - Ist er der zuletzt aktive Tab, startet die Shell sofort im Ordner der Session (Rückfallkette, falls er fehlt) mit dem Startbefehl „Starter mit `--resume <Kennung>`“. Kein alter Verlauf.
    - Sonst ist er **pausiert**: Es läuft noch kein Prozess, beim ersten Anzeigen startet er wie oben. Ein pausierter Tab übersteht weitere Neustarts unverändert.
    - Ist der zuletzt aktive Tab ein normaler Tab, sind alle fortzusetzenden Claude-Tabs pausiert.
    - **Ohne Start-Meldung:** Meldet der Starter innerhalb von 30 Sekunden nach dem Startbefehl keinen Start für den Tab, läuft Claude ohne Erfassung: `THUB_STARTER` fehlt (Gruppenrichtlinie, die erst nach dem Erfassen dazugekommen ist), `starter.ps1` fehlt oder die lokale Schnittstelle läuft nicht. Ohne Hooks und ohne Ende-Meldung bliebe der Tab sonst ein Claude-Tab, bis die Shell endet, und jeder weitere Neustart setzte dieselbe Session wieder fort. Die Claude-Zuordnung fällt deshalb weg: Der Tab ist ein normales Terminal, wie nach einem `claude`, das ohne Starter getippt wurde, und beim nächsten Neustart wird nichts fortgesetzt. Die Session läuft in der Shell ungestört weiter. Kommt die Meldung später doch noch (sehr langsames Profil), gilt die Zuordnung wieder. Die Frist beginnt erst mit dem Startbefehl, bei einem pausierten Tab also erst beim Öffnen; ein nie geöffneter pausierter Tab behält seine Zuordnung.
  - **Claude-Tab, der nicht fortgesetzt wird** (keine Kennung, oder bestätigt, aber nie ein Prompt): Er kommt als normales Terminal im Ordner der Session zurück, ohne Verlauf.
- **Verlauf sichern:**
  - Der Inhalt normaler Tabs wird im Renderer aus dem Terminal-Puffer serialisiert (`@xterm/addon-serialize`, ohne Alternativ-Puffer von Vollbildprogrammen, letzte ca. 1000 Zeilen) und im Hauptprozess pro Tab in einer eigenen Datei abgelegt.
  - Gesichert wird beim Schliessen eines Tabs, periodisch etwa alle 30 Sekunden für geänderte Tabs und beim Beenden (siehe „App-Verhalten“).
  - Für Claude-Tabs wird kein Verlauf gesichert.
- **Geschlossene Tabs:** Beim Schliessen wandert der Tab mit allen Angaben (inklusive Verlauf bzw. Claude-Zuordnung, eingefroren) in eine Liste der letzten zehn. Wiederöffnen stellt ihn an seiner alten Position wie beim Start wieder her; ein fortzusetzender Claude-Tab wird dabei sofort fortgesetzt. Fällt ein Tab aus der Liste, wird seine Verlaufsdatei gelöscht.
- **Beenden der App** fragt nie nach, auch wenn Claude gerade arbeitet: Alles kommt beim nächsten Start zurück. Eine dabei unterbrochene Antwort setzt Claude ab dem gespeicherten Gesprächsstand fort.

**Präzisierungen aus der Umsetzung (Ticket 15):**
- **Rückfrage:** Grund nach Vorrang „wartet auf dich“ → „arbeitet“ → „Prozesse laufen“. „Fertig, noch nicht angeschaut“ und „pausiert“ zählen nicht. Bei mehreren Tabs nennt die Rückfrage nur die Tabs, in denen etwas läuft; bestätigt schliessen alle angefragten Tabs, abgebrochen keiner.
- **Verlauf beim Schliessen:** angefordert nur, wenn der Tab seit der letzten Sicherung neue Ausgabe hatte, und zwar vor dem Ereignis, das den Tab aus der Leiste nimmt; angenommen wird genau diese eine Antwort. Wird die Ansicht vorher geschlossen, gilt ihr Inhalt bis dahin. Beim Beenden wartet THub auch auf solche ausstehenden Antworten.
- **Wiederöffnen** behält Kennung und Namen des Tabs, auch wenn inzwischen ein gleichnamiger Tab offen ist. Kennung, Liste und Verlaufsdatei bleiben so verknüpft.
- **Nachfahren beenden:** Vor dem Beenden fragt der Kern die Sonde ab (höchstens 1 Sekunde, sonst endet die Shell ohne diesen Schritt) und beendet danach die Shell (Pseudokonsole schliessen) und ihren ganzen Baum über gültige Eltern-Kanten, Eltern vor Kindern, jeden Prozess nur mit passender Startzeit. Prozesse, deren Eltern-Kette schon vorher abgerissen ist, findet das nicht (wie bei „Prozesse laufen“). Wird der Tab wieder geöffnet, bevor die Sonde antwortet, endet die alte Shell sofort; ihr Baum folgt mit der Antwort.
- **node-pty 1.1.0:** Es schliesst die Pseudokonsole nur in `kill`; nach einem `exit` blieben pro Shell `conhost.exe` und ein Worker-Thread bis zum Ende von THub. Das Terminal-Backend beendet deshalb den Konsolen-Host einer von selbst beendeten Shell (das Kind von THub, das unmittelbar vor der Shell gestartet ist) und räumt den Worker weg. Den Hilfsprozess, mit dem `kill` die Prozesse der Konsole auflisten will, schaltet das Backend ab: Er scheitert, weil ConPTY die Shell bis dahin schon beendet hat, und nach 5 Sekunden beendete node-pty ersatzweise die Prozess-ID der Shell, die dann womöglich einem anderen Prozess gehört.

**Präzisierungen aus der Umsetzung (Ticket 23):**
- **Frist:** 30 Sekunden über die Uhr des Kerns, gezählt ab dem Startauftrag mit dem Startbefehl: beim zuletzt aktiven Claude-Tab mit „Ansicht bereit“, bei einem pausierten Tab beim Anzeigen, bei einem wieder geöffneten Tab beim Wiederöffnen. Ohne Startbefehl (etwa wenn nur WSL da ist) gibt es keine Frist.
- **Ohne Wirkung enden** lassen die Frist: jede Start-Meldung des Starters für den Tab, ein Hook-Ereignis, die Ende-Meldung, das Ende der Shell, Schliessen des Tabs, Einfrieren (Windows-Abmeldung) und Beenden der App. Eingefroren oder beim Beenden schreibt sie nie einen geänderten Zustand.
- **Nach Ablauf:** Die Zuordnung fällt weg und wird gespeichert, ohne Hinweis; THub tippt nichts und beendet nichts. Der Tab steht im Ordner, in dem seine Shell gestartet ist (dem Ordner der Session), ausser die Shell hat seit dem Start selbst einen Ordner gemeldet (Claude schon beendet, Ordner gewechselt). Als normales Terminal bekommt er ab jetzt einen Verlauf, auch mit dem, was Claude darin anzeigt.
- **Späte Start-Meldung** derselben Session, solange dieselbe Shell läuft: Die weggefallene Zuordnung gilt wieder; `linkAfterLaunch` bekommt sie als vorige Zuordnung, „hatte Prompt“ bleibt also erhalten. Das Fortsetzen gilt weiter als von THub gestartet: Schlägt es fehl, kommt der Hinweis „Claude-Session konnte nicht fortgesetzt werden“. Die Start-Meldung einer anderen Session ist ein gewöhnlicher Start.
- **Grenzen:** Braucht ein Profil länger als 30 Sekunden, ist der Tab bis zur Start-Meldung ein normales Terminal; endet THub in dieser Zeit, kommt er als normales Terminal zurück. Den Verlauf aus dieser Zeit löscht die Start-Meldung wieder, wie bei jedem Claude-Tab.
- Tests verkürzen die Frist über `WorkspaceOptions.resumeLaunchGraceMs`.

### Gespeicherter Zustand (Schema Version 2)

Der gespeicherte Zustand wird auf Version 2 angehoben, mit automatischer Übernahme aus Version 1.

- **Einstellungen:**
  - Standardordner (optional, leer bedeutet Benutzerordner)
  - Kennung der Standard-Shell
  - Design (System / Hell / Dunkel)
  - Terminal-Schriftgrösse (8 bis 32)
  - Hinweise an/aus
  - offene Punkte aus Claudes Antworten an/aus
  - Rechner wach halten an/aus und die gewählte Stufe (nur Rechner / Rechner und Bildschirm); fehlen die Angaben, gilt aus und „nur Rechner“, ohne neue Schema-Version (Ticket 28)
- **Tabs (geordnet):**
  - Kennung, Name, ob der Name von Hand vergeben wurde
  - Shell-Kennung, Startordner, zuletzt aktiver Ordner
  - bei Claude-Tabs die Claude-Zuordnung (Session-Kennung, Ordner der Session, bestätigt, hatte Prompt)
  - offene Punkte, deren Hinweis noch nicht geschlossen ist
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
  - Schalter „Rechner wach halten“ mit Pfeil-Menü für die Stufe, links neben dem Zahnrad (siehe „Rechner wach halten“)
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
  - **Status-Animationen:** „arbeitet“ = violetter Claude-Stern, der rotiert und pulsiert; „wartet auf dich“ = oranger Punkt mit Ping-Ring; „Prozesse laufen“ = blauer, ruhig atmender Punkt; „fertig“ = grüner Punkt; „pausiert“ = graues Pause-Symbol. Bei reduzierter Bewegung (Windows-Einstellung) stehen die Animationen still; nur der Claude-Stern dreht sich langsam weiter.
- **Design-Variablen** (vom Nutzer am 2026-11-19 freigegeben, `--st-working` im dunklen Design am 2026-11-20 aufgehellt; vollständige Liste mit allen Werten in `prototype/styles.css`):

| Zweck | Variable | Dunkel | Hell |
|---|---|---|---|
| Fenster und Titelleiste (deckend) | `--win-solid` | `#1d1d22` | `#f3f3f6` |
| Text / gedämpft / schwach | `--text`, `--text-muted`, `--text-faint` | `#ececf1`, `#a1a1ad`, `#71717c` | `#1b1b1f`, `#5b5b66`, `#8a8a95` |
| Tab-Fläche / Rand / Überfahren | `--tab-bg`, `--tab-border`, `--tab-hover` | Weiss mit 4 %, 7 %, 7,5 % Deckkraft | Schwarz mit 3,5 %, 7 %, 6,5 % Deckkraft |
| Aktiver Tab | `--tab-active-bg`, `--tab-active-shadow` | Weiss 10 %, Rand Weiss 16 % | `#ffffff`, Rand Schwarz 12 % |
| Neutrale Hervorhebung (kein Akzent) | `--accent`, `--on-accent` | `#f4f4f5` auf `#111114` | `#18181b` auf `#ffffff` |
| Dialoge, Menüs, Hinweise | `--dialog-bg` | `#25252b` | `#ffffff` |
| Gefahr (Schliessen-Bestätigung) | `--danger` | `#f2555a` | `#dc2626` |
| Status arbeitet / wartet / Prozesse | `--st-working`, `--st-waiting`, `--st-processes` | `#c4b5fd`, `#fb923c`, `#60a5fa` | `#7c3aed`, `#ea580c`, `#2563eb` |
| Status fertig / pausiert | `--st-finished`, `--st-paused` | `#4ade80`, `#8b8b96` | `#16a34a`, `#9090a0` |
| Terminal Hintergrund / Text | `--term-bg`, `--term-fg` | `#141417`, `#d4d4dc` | `#ffffff`, `#24242b` |
| Terminal Rot / Grün / Gelb / Blau | `--a-red` … `--a-blue` | `#f87171`, `#4ade80`, `#facc15`, `#60a5fa` | `#c62828`, `#1a7f37`, `#9a6700`, `#0550ae` |
| Terminal Magenta / Cyan / Gedämpft | `--a-magenta`, `--a-cyan`, `--a-dim` | `#c084fc`, `#22d3ee`, `#6e6e7a` | `#8250df`, `#0e7490`, `#8a8a95` |

- **Masse:** Titelleiste 44 px; Tabs 34 px hoch (bis Ticket 26: 30 px; die Klickfläche reicht über die ganze Titelleiste), 200 px breit, mindestens 112 px, 5 px Abstand; Radien 4 / 6 / 8 / 12 px, Terminal-Karte 10 px mit 7 px Rand zum Fenster; Status-Feld 14 px mit 8-px-Punkten; Hinweise 320 px breit.
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
| `Ctrl+C` | Kopieren, wenn THub etwas markiert hat; sonst Abbrechen im Programm (Ticket 34) |
| `Ctrl+V` | Einfügen; in PowerShell ohne Bracketed Paste an PSReadLine (Ticket 34) |
| `Ctrl` + Klick auf einen Link | Im Standardbrowser öffnen (nur `http:`/`https:`; bei eingeschalteter Mausmeldung des Programms mit `Ctrl+Shift`) |
| `Ctrl` + Mausrad, `Ctrl` `+` / `Ctrl` `-` / `Ctrl` `0` | Schriftgrösse ändern / zurücksetzen |

- `Ctrl+K` wird nicht abgefangen.
- **Übersicht der Tastenkürzel:** ein Dialog im Stil der Einstellungen, gruppiert (Tabs, Bearbeiten, Darstellung, Fenster). Geöffnet über den Befehl „Tastenkürzel anzeigen“ in der Befehlspalette und den Link „Alle Tastenkürzel …“ im Einstellungsdialog; kein eigenes Kürzel. Erzeugt aus derselben Tabelle, nach der die Tasten verarbeitet werden.
- Kürzel, die vom Tastaturlayout abhängen (`+`, `-`), werden über das erzeugte Zeichen erkannt, nicht über die Tastenposition. So funktionieren die Schweizer Tastatur (`+` auf Shift+1) und der Ziffernblock.
- Der eingebaute Zoom von Chromium und die Zoom-Kürzel des Entwicklermenüs sind abgeschaltet.

**Präzisierungen aus der Umsetzung (Ticket 16):**
- **Rechtsklick-Menü:** geht an der Stelle des Klicks auf, aktiviert den Tab nicht und bleibt links der Fensterknöpfe. Einträge wie im Prototyp; neben „Umbenennen“ und „Schliessen“ steht das Kürzel aus derselben Tabelle wie in der Übersicht. „Ordner im Explorer öffnen“ und „Pfad kopieren“ nehmen den aktuellen Ordner wie im Tooltip (zuletzt gemeldet, sonst Startordner). Für den Explorer schickt der Renderer nur die Tab-Kennung; den Ordner bestimmt der Kern, und der Hauptprozess öffnet mit `shell.openPath` nur einen Ordner, den es gibt (nie eine Datei, die sonst ausgeführt würde). Im Testmodus öffnet sich kein Explorer-Fenster; der Ordner steht in der Ausgabe.
- **Duplizieren:** neuer Tab direkt rechts neben der Quelle, auch wenn sie nicht aktiv ist; er wird aktiv. Ordner wie beim Start der Shell (zuletzt aktiver, Startordner, Standardordner, Benutzerordner, der erste, den es gibt), dieselbe Shell-Kennung (auch eine hier fehlende: dann wie die Quelle mit der Standard-Shell), automatischer Name nach diesem Ordner, ohne Claude-Zuordnung, Verlauf und offene Punkte. Der Ordner kommt an die Spitze der zuletzt benutzten Ordner.
- **Umsortieren:** Der Kern verschiebt einen Tab an eine Position der Leiste (`moveTab`, ausserhalb gilt das nächste Ende). Gezogen wird mit Pointer-Ereignissen, nicht mit HTML5 Drag and Drop: Chromium beginnt dieses nur, wenn das mousedown nicht abgefangen wird, und dann verlöre das Terminal bei jedem Klick auf einen Tab den Fokus (samt Fokus-Meldungen an Programme wie Claude); ausserdem liesse sich der Tab auf andere Programme oder ins Terminal fallen lassen. Ab 4 px Bewegung wird gezogen; ein Abbild folgt der Maus, der Tab steht blass an seinem Platz, eine Marke zeigt die Einfügestelle (vor dem ersten Tab, dessen Mitte die Maus noch nicht erreicht hat). Ablegen nur über der Leiste; anderswo, mit Escape oder bei Fokusverlust bricht es ab. In den äussersten 28 px einer überlaufenden Leiste scrollt sie von selbst, je näher am Rand, desto schneller. Der Klick nach dem Loslassen aktiviert den Tab nicht.

**Präzisierungen aus der Umsetzung (Ticket 25):**
- **Ursache des doppelten Einfügens, belegt am installierten Claude Code 2.1.329** (nur lesend durchsucht) und mit einem Stub in der echten App (Testmodus, synthetischer Rechtsklick über CDP):
  - Claude schaltet im Vollbild die Mausmeldung ein (Modus „full“: `?1000h?1002h?1003h?1006h`, „scroll“: `?1000h?1006h`).
  - xterm.js meldet den Rechtsklick dann als `ESC[<2;x;yM` / `ESC[<2;x;ym` ans Programm. Claude merkt sich das Drücken der rechten Taste und fügt beim Loslassen unter Windows selbst ein, wenn bei ihm nichts markiert ist (mit Markierung kopiert es); THub fügte zusätzlich ein.
  - Claude unterlässt das eigene Einfügen nur in Terminals, die sich als VS Code oder auf die Frage nach dem Namen (XTVERSION) als „xterm.js…“ melden; xterm.js 6 beantwortet XTVERSION nicht.
  - Ebenso öffnet Claude im Vollbild einen OSC-8-Link selbst, wenn die Mausmeldung eines Linksklicks Ctrl oder Alt trägt.
- **Regel wie im Windows Terminal:** Solange das Programm die Mausmeldung eingeschaltet hat (`term.modes.mouseTrackingMode` nicht `none`), gehören Rechtsklick und Ctrl+Klick dem Programm; THub kopiert, fügt ein und öffnet dann nichts, auch eine Auswahl von THub wird nicht kopiert. Mit Shift handelt THub (xterm.js meldet den Klick dann nicht ans Programm). Ohne Mausmeldung (Shells, Claude ohne Vollbild) bleibt der Rechtsklick wie bisher. Die Regel gilt für jedes Programm mit Mausmeldung, nicht nur für Claude.
- **Ctrl+Klick:** OSC-8-Links über die Option `linkHandler` von xterm.js (ersetzt dessen Rückfrage per `window.confirm`), URLs im Klartext über `@xterm/addon-web-links` 0.12 (erschienen mit xterm.js 6.0.0). xterm.js meldet das Loslassen jeder Maustaste; geöffnet wird nur bei der linken Taste mit Ctrl. Andere Protokolle als `http:` und `https:` erkennt xterm.js für OSC 8 gar nicht erst (`allowNonHttpProtocols` bleibt aus). Überlappen ein OSC-8-Link und eine erkannte URL, gilt nur der OSC-8-Link; ein Klick öffnet einmal.
- **Öffnen im Hauptprozess:** neuer IPC-Kanal `link:open` (`window.thub.openLink`). Der Hauptprozess prüft die Adresse selbst mit dem URL-Parser (nur `http:`/`https:`, höchstens 8192 Zeichen) und öffnet die normalisierte Form mit `shell.openExternal`. Im Testmodus öffnet er nichts und schreibt „Testmodus: Der Browser würde … öffnen.“ in die Ausgabe.
- **Keine gestrichelte Linie:** xterm.js 6 liefert im Getter `underlineStyle` der erweiterten Zellattribute für jede Zelle mit Link-Kennung „gestrichelt“ (5), egal, was das Programm verlangt hat; der DOM-Renderer setzt daraus die Klasse `xterm-underline-5`, dieselbe wie für SGR 4:5. CSS kann die beiden nicht trennen, und eine Option gibt es nicht. THub ersetzt deshalb diesen einen Getter (`linkUnderline.ts`): Für Link-Zellen liefert er den Stil, den das Programm gesetzt hat, meist keinen. Ausdrücklich verlangte Unterstreichungen bleiben, auch SGR 4:5 in einem Link. Hand-Zeiger und durchgezogene Unterstreichung beim Überfahren zeichnet xterm.js selbst. Passt der Aufbau von xterm.js nach einem Update nicht mehr, bleibt alles wie bisher, und die Tests schlagen an.

**Kopieren mit Ctrl+C, Einfügen mit Ctrl+V (Ticket 34, Wunsch des Nutzers am 2026-11-23):**
- Claude Code hat unter Windows `Ctrl+V` nicht belegt (Bilder: `Alt+V`) und verlässt sich darauf, dass das Terminal `Ctrl+V` abfängt und einfügt, wie Windows Terminal und VS Code. Claude schaltet Bracketed Paste ein. Im Vollbild markiert Claude selbst und kopiert dann auch mit `Ctrl+C`.
- `Ctrl+C` kopiert wie im Windows Terminal, wenn THub im aktiven Terminal etwas markiert hat, und hebt die Markierung auf; sonst geht es ans Programm. Das gilt auch bei eingeschalteter Mausmeldung (Markierung von THub dann mit `Shift` + Ziehen), anders als beim Rechtsklick.
- `Ctrl+V` fügt ein wie `Ctrl+Shift+V`. Ausnahme: In einem Tab mit PowerShell oder Windows PowerShell (`pwsh`, `powershell`) geht `Ctrl+V` ans Programm, solange dieses keinen Bracketed Paste verlangt. Dort fügt PSReadLine selbst ein und übernimmt mehrzeiligen Text als Ganzes, statt jede Zeile auszuführen. Die Oberfläche entscheidet beim Tastendruck; im Ausnahmefall fängt sie die Taste nicht ab.
- In Eingabefeldern der Oberfläche gehört `Ctrl+V` dem Feld.

**Präzisierungen aus der Umsetzung (Ticket 26):**
- **Klickfläche der Tabs:** Die Karte ist 34 px hoch und steht mittig in der 44 px hohen Titelleiste. Ein unsichtbares Pseudo-Element jedes Tabs (`::before`, in der eigenen Stapelebene des Tabs hinter Name, Symbol und ×) reicht über die ganze Höhe der Titelleiste, also auch 5 px unter die Karte, nicht nur darüber. Klick, Rechtsklick, mittlere Taste, Doppelklick, Ziehen, Überfahren und Tooltip wirken dort wie auf der Karte. Gemessen wird weiter die Karte: Tooltip, Abbild und Einfügemarke beim Ziehen stehen wie bisher. Die 5-px-Lücken zwischen den Tabs bleiben Leiste (kein Ziehen des Fensters, kein Tab).
- **Rand zum Grössenziehen:** Den regelt Electron, nicht die Oberfläche. Im nicht maximierten Fenster meldet es die obersten Pixel vor der Seite als `HTTOP` (Rahmen plus Polsterung von Windows, gemessen bei 150 %: 8 CSS-px, also die Fläche über der Karte und deren oberste 3 px); das Fenster lässt sich dort wie bei Chrome in der Höhe ziehen. Im maximierten Fenster gibt es keinen Rand: Ab der obersten Pixelreihe trifft ein Klick über einem Tab den Tab, die freie Fläche bleibt `HTCAPTION`. Der Renderer braucht dafür den Maximiert-Zustand nicht zu kennen.
- **Neue Tabs am Ende:** `createTab` hängt an, egal welcher Tab aktiv ist; das gilt für `+`, `Ctrl+Shift+T`, das Pfeil-Menü, die Befehlspalette und den Knopf „Neues Terminal“ ohne offene Tabs. Nur Duplizieren (rechts neben der Quelle) und Wiederöffnen (alte Stelle) setzen eine Position.
- **Aufgeklappte Auswahlliste:** Chromium zeichnet die Liste eines `<select>` als eigenes Fenster. Es übernimmt das Farbschema des Felds (`color-scheme`, vom Design über `data-theme` geerbt, auch bei „System“), seine Hintergrund- und Textfarbe, und legt die Liste auf eine weisse Fläche. Das halbdurchsichtige `--btn-bg` des dunklen Designs ergab so eine weisse Liste mit heller Schrift. Die Hintergrundfarbe des Felds ist deshalb deckend (`--dialog-bg`), `--btn-bg` liegt als Bild-Ebene darüber; geschlossen sieht es aus wie vorher. Die Hervorhebung des gewählten Eintrags kommt von Chromium selbst und lässt sich ohne eigene Liste nicht gestalten: im dunklen Design hellblau mit dunkler Schrift, im hellen dunkelblau mit weisser Schrift. Andere native Bedienelemente: Die Bildlaufleisten folgen über `color-scheme` dem Design; ein weiteres `<select>` gibt es nicht. Native Tooltips (`title`, etwa am Standardordner) sind nicht Teil dieses Tickets.

### Rechner wach halten

Umsetzung: Ticket 28.

- **Zweck:** Lange Claude-Sessions, Builds und Testläufe sollen weiterlaufen, während der Nutzer nicht am Rechner ist, ohne dass Windows nach der eingestellten Zeit in den Energiesparmodus geht. Bisher liess der Nutzer dafür in einzelnen Claude-Sessions ein Wachhalte-Skript starten: PowerShell, das in einer Schleife `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` aufruft. THub übernimmt das mit derselben Wirkung und bietet zusätzlich eine Stufe, die auch den Bildschirm anlässt.
- **Stufen:**
  - **Nur Rechner:** Windows geht nach einer Zeit ohne Eingabe nicht in den Energiesparmodus. Der Bildschirm schaltet sich nach der eingestellten Zeit weiterhin aus, und die Sperre greift wie gewohnt. Das entspricht dem bisherigen Skript.
  - **Rechner und Bildschirm:** zusätzlich bleibt der Bildschirm an und wird nicht abgedunkelt.
  - Die Energieeinstellungen von Windows bleiben in beiden Stufen unverändert. THub simuliert keine Eingaben.
- **Technik:** kein Skript und kein eigener Prozess.
  - Der Hauptprozess stellt über koffi (wie die Prozess-Sonde) Energie-Anforderungen bei Windows. Beim ersten Einschalten erzeugt er eine Anforderung mit `PowerCreateRequest`, als Grund der einfache Text „THub hält den Rechner wach“ (`POWER_REQUEST_CONTEXT_SIMPLE_STRING`).
  - „Nur Rechner“ setzt darauf `PowerSetRequest(…, PowerRequestSystemRequired)`; „Rechner und Bildschirm“ setzt zusätzlich `PowerRequestDisplayRequired`. Ausschalten hebt die gesetzten Arten mit `PowerClearRequest` auf.
  - Wechselt die Stufe bei eingeschaltetem Wachhalten, setzt THub zuerst die neue Art und hebt danach die nicht mehr gewünschte auf, damit keine Lücke entsteht.
  - Endet THub, auf welchem Weg auch immer (auch bei einem Absturz), gibt Windows die Anforderung mit dem Prozess frei. Es bleibt nichts zurück.
  - Die Anforderung erscheint in `powercfg /requests` (braucht Administratorrechte) unter `SYSTEM` bzw. zusätzlich `DISPLAY`, mit dem Grund.
  - **Verworfen:** `powerSaveBlocker` von Electron. `prevent-app-suspension` stellt unter Windows eine `PowerRequestExecutionRequired`-Anforderung (Chromium, `services/device/wake_lock/power_save_blocker/power_save_blocker_win.cc`). Laut Microsoft hält diese nur auf Rechnern mit klassischem Standby (S3) auch das System wach. Der Rechner des Nutzers hat Modern Standby (`powercfg /a`: „Standby (S0 Niedriger Energiestand – Leerlauf)“), dort wäre die Wirkung nicht gesichert. `prevent-display-sleep` setzt unter Windows 11 nur `PowerRequestDisplayRequired`.
  - **Verworfen:** ein mitgeliefertes PowerShell-Skript als eigener Prozess. Es könnte nach einem Absturz von THub weiterlaufen, braucht `powershell.exe` und scheitert im Constrained Language Mode.
- **Eingeschaltet bleiben:**
  - An/aus und die Stufe sind Einstellungen (`keepAwake`, Standard aus; `keepAwakeMode` mit `system` oder `display`, Standard `system`) und stehen im gespeicherten Zustand.
  - Beenden von THub, Windows-Abmeldung und Absturz ändern sie nicht. Beim nächsten Start stellt der Kern die Anforderung von selbst wieder, sobald er den Zustand geladen hat.
  - Ein Neustart des Rechners startet THub nicht (kein Autostart); das Wachhalten beginnt mit dem nächsten Start von THub.
  - Eine zweite Instanz stellt keine Anforderung.
- **Kern:**
  - Er besitzt beide Einstellungen und meldet über den Port **Wachhalten** die wirksame Stufe (aus, nur Rechner, Rechner und Bildschirm): einmal beim Start mit dem geladenen Zustand, danach bei jeder Änderung, die die wirksame Stufe ändert.
  - Der Port ist idempotent: Dieselbe Stufe zweimal ergibt eine einzige Anforderung.
  - Umgeschaltet wird über den bestehenden Befehl `updateSettings` mit `keepAwake` und `keepAwakeMode`.
  - Eine Änderung der Stufe bei ausgeschaltetem Wachhalten schaltet es nicht ein; das tut nur die Wahl im Pfeil-Menü (siehe unten), die beides zusammen ändert.
- **Oberfläche:**
  - **Platz:** in der Titelleiste links neben dem Zahnrad, rechts von der freien Zieh-Fläche, deren Mindestbreite bleibt. Schalter und Pfeil sind von der Zieh-Fläche ausgenommen.
  - **Schalter:** ein Symbol für die gewählte Stufe (Kaffeetasse für „nur Rechner“, Bildschirm für „Rechner und Bildschirm“) und ein kleiner Schalter im Stil der Schalter im Einstellungsdialog, neutral ohne Akzentfarbe, in der Höhe der Symbolknöpfe. Symbol und Schalter sind eine einzige Schaltfläche (`role="switch"`, `aria-checked`, Name „Rechner wach halten“), per Tab erreichbar; Leertaste und Enter schalten um. Ausgeschaltet ist das Symbol gedämpft, eingeschaltet in voller Textfarbe.
  - **Ein Klick** auf den Schalter schaltet ein oder aus, mit der gewählten Stufe.
  - **Pfeil-Menü:** Der Pfeil rechts neben dem Schalter öffnet ein Menü wie der Pfeil neben dem `+`, mit den Einträgen „Nur Rechner wach halten“ und „Rechner und Bildschirm wach halten“, je mit ihrem Symbol. Die gewählte Stufe hat ein Häkchen. Eine Wahl setzt die Stufe und schaltet das Wachhalten ein; die schon laufende Stufe noch einmal zu wählen, ändert nichts und schaltet nicht aus.
  - **Tooltips:** Schalter „Rechner wach halten: aus“, „Rechner wach halten: an“ bzw. „Rechner und Bildschirm wach halten: an“; Pfeil „Stufe wählen“.
  - **Befehlspalette:** „Rechner wach halten“ und „Rechner und Bildschirm wach halten“ (setzen die Stufe und schalten ein, wie das Pfeil-Menü), bei eingeschaltetem Wachhalten zusätzlich „Wachhalten beenden“. Kein Tastenkürzel, kein Eintrag im Einstellungsdialog.
- **Testmodus:** Mit `THUB_TEST_HIDDEN=1` stellt THub keine echte Anforderung, sondern schreibt „Testmodus: THub würde jetzt den Rechner wach halten.“, „… den Rechner und den Bildschirm wach halten.“ bzw. „… nichts mehr wach halten.“ in die Ausgabe.
- **Fehler** (Ticket 31; bis dahin blieb die Einstellung stehen, und der Fehler stand nur in der Ausgabe des Hauptprozesses):
  - Der Port meldet dem Kern, wenn eine Stufe nicht gesetzt werden konnte, mit dem Grund (Windows lehnt ab, koffi lädt nicht, anderes System als Windows mit 64 Bit).
  - Scheitert das Einschalten oder ein Wechsel der Stufe, auch beim Start mit gespeichertem „an“: Der Port hebt auf, was er dabei schon gesetzt hatte; der Kern schaltet das Wachhalten aus und speichert das (die Stufe bleibt), und unten rechts erscheint der Hinweis „Rechner wach halten ausgeschaltet“ mit dem Grund. Erneut versuchen heisst: den Schalter wieder einschalten.
  - Scheitert das Aufheben, bleibt die Einstellung wie gewählt, und der Hinweis „Wachhalten liess sich nicht beenden“ sagt, dass Windows womöglich weiter wach hält, bis THub endet.
  - Ein Fehler für eine Stufe, die inzwischen nicht mehr gewünscht ist, ändert nichts und zeigt keinen Hinweis.
  - Der Hinweis ist **als Fehler markiert:** Fehlersymbol (Kreis mit Ausrufezeichen) und Rand der Karte in der Fehlerfarbe `--danger` (wie beim Gefahr-Knopf), für Screenreader `role="alert"`. Beide Fehlerfälle sehen gleich aus, nur Titel und Grund unterscheiden sich.
  - Er gehört zu keinem Tab: Er bleibt, bis `×` oder ein Klick ihn schliesst, erscheint auch bei „Hinweise im Fenster: aus“, steht höchstens einmal da (mit dem letzten Grund) und kommt nach einem Neustart nicht wieder.
  - Der Fehler steht zusätzlich in der Ausgabe des Hauptprozesses. Im Testmodus lässt `THUB_TEST_KEEPAWAKE_FAIL=1` jede Anforderung scheitern.
- **Grenzen:**
  - Zuklappen des Deckels, der Ein-/Aus-Knopf und „Energie sparen“ im Startmenü versetzen den Rechner trotzdem in den Energiesparmodus; Windows hebt die Anforderungen dabei auf.
  - Im Akkubetrieb beendet Windows auf Rechnern mit Modern Standby die Anforderung, den Rechner wach zu halten, 5 Minuten nach Ablauf der eingestellten Zeit bis zum Energiesparmodus. Über Nacht braucht der Rechner deshalb das Netzteil.
  - Ob eine von einer Firmenrichtlinie vorgegebene Sperre nach Inaktivität in der Stufe „Rechner und Bildschirm“ ausbleibt, hängt von deren Einrichtung ab. THub umgeht sie nicht; das Verhalten wird von Hand geprüft.
  - Ein Administrator kann die Anforderungen eines Programms übergehen (`powercfg /requestsoverride`).
  - Der Ruhezustand bei fast leerem Akku greift weiterhin.

### App-Symbol

Umsetzung: Ticket 29.

- **Ausgangslage:** Weder electron-builder noch das Fenster bekommen bisher ein eigenes Symbol. THub zeigt deshalb überall das Standardsymbol von Electron.
- **Wo das Symbol erscheint:**
  - als Symbol von `THub.exe` und damit in Taskleiste, `Alt+Tab`, Startmenü, Desktop-Verknüpfung und beim Anheften an die Taskleiste;
  - im Installer, im Deinstaller und im Eintrag unter „Installierte Apps“;
  - am Fenster über die Option `icon` von `BrowserWindow`, damit auch `npm start` nicht das Electron-Symbol zeigt.
  - **Nicht** in der Titelleiste von THub selbst; die bleibt wie im Prototyp.
- **Gestaltung** (am 2026-11-22 an vier Entwürfen in `prototype/icon.html` gewählt: Entwurf C in Graphit):
  - **Motiv:** zwei gestapelte Terminals, also mehrere Sessions, die bleiben. Vorne ein helles Terminal mit dem Prompt `>_`, dahinter versetzt nach rechts oben ein zweites, gedämpftes; zwischen beiden eine schmale Lücke.
  - **Farben (Graphit):** Kachel mit abgerundeten Ecken im Verlauf von `#44444d` (oben links) nach `#17171b` (unten rechts), in den kleinen Grössen flach `#26262c`; eine feine helle Innenkante (Weiss, 18 % Deckkraft), damit sich die Kachel auch auf einer dunklen Taskleiste abhebt. Vorderes Terminal `#f4f4f5`, hinteres dieselbe Farbe mit 42 % Deckkraft, Prompt `#1c1c21`. Damit bleibt das Symbol neutral wie die Oberfläche, ohne Akzentfarbe.
  - **Von Hand nachgezogen:** 16, 20 und 24 px haben eigene Vorlagen auf ganzen Pixeln. In 16 und 20 px ist das vordere Terminal so gross wie möglich, vom hinteren bleibt oben und rechts ein Rand, und der Prompt besteht aus einzelnen Pixeln. Ab 32 px wird die grosse Vorlage (256 px) verkleinert.
  - Vorgaben, die dabei galten: passt zum Look von THub (Stil wie Warp, Linear oder Raycast); ab 16 px lesbar; auf heller und dunkler Taskleiste gut erkennbar; keine fremden Marken, auch nicht der Claude-Stern von den Tabs.
- **Dateien:**
  - Vorlagen `resources/icon/icon-16.svg`, `icon-20.svg`, `icon-24.svg` und `icon-256.svg`; sie sind die Quelle.
  - Daraus erzeugt `npm run icon` (`scripts/build-icon.cjs`) die `resources/icon/icon.ico` mit 16, 20, 24, 32, 40, 48, 64 und 256 px, die Grössen, die Windows bei 100 % bis 200 % Skalierung und in grossen Ansichten anfragt. Chromium zeichnet jede Grösse aus ihrer Vorlage (Electron, unsichtbar); `scripts/ico.cjs` schreibt die Datei ohne weitere Abhängigkeiten.
  - Unter 256 px stehen die Bilder als 32-Bit-Bitmap mit Alphakanal in der `.ico`, so wie jede Windows-Komponente sie liest; 256 px als PNG.
  - Die `.ico` liegt im Repository, damit `npm run dist` ohne vorheriges `npm run icon` funktioniert. Wer eine Vorlage ändert, erzeugt sie neu und committet beides.
  - electron-builder nimmt sie für `THub.exe`, Installer und Deinstaller (`build.win.icon`); `build.mjs` legt sie als `dist/icon.ico` für das Fenster ab.

### Versionsnummer

Umsetzung: Ticket 30.

- **Eine Quelle:** `version` in `package.json`. electron-builder nimmt sie für den Namen des Installers, die Datei- und Produktversion von `THub.exe` und den Eintrag unter „Installierte Apps“.
- **Schema** `Haupt.Neben.Korrektur` (Semantic Versioning): Der erste Installer mit Versionsnummer ist **0.2.0**; davor hiess jeder Installer 0.1.0, und 0.0.2 wäre niedriger gewesen. Solange THub in Entwicklung ist, bleibt die erste Stelle 0: neue Funktionen erhöhen die zweite Stelle (0.3.0), reine Korrekturen die dritte (0.2.1). 1.0.0 erst, wenn der Nutzer THub für fertig erklärt.
- **Anzeige:** im Einstellungsdialog unten eine gedämpfte Zeile „THub 0.2.0“.
  - Unpaketiert steht zusätzlich „Entwicklung“.
  - Kein Commit: Die Zeile mit Commit und „+ Änderungen“ (Installer 0.2.0) war dem Nutzer zu viel; seit dem 2026-11-22 steht nur die Version da. Dass ein Installer genau einem Commit entspricht, sichert der Tag `v<Version>`.
  - Ein Klick kopiert die Zeile (Tooltip „Version kopieren“), ebenso der Befehl „Version kopieren“ in der Palette. Im Testmodus geht das in die eigene Zwischenablage.
- **Änderungen** stehen je Version in `CHANGELOG.md`: Datum, was neu ist und was korrigiert wurde, mit Ticketnummern.
- **Neuer Installer für den Nutzer:** Version erhöhen (falls sich an der App etwas geändert hat), `CHANGELOG.md` ergänzen, committen, Tag `v<Version>` setzen, dann erst `npm run dist`. So entspricht jeder Installer genau einem Commit mit Tag.
- Die App-Kennung `ch.custom.thub` bleibt, damit ein neuer Installer die bestehende Installation ersetzt.
- **Nicht dabei:** Auto-Update, Prüfung auf neue Versionen, eine eigene Seite „Über THub“.

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
  - **Hinweise:** nur für nicht sichtbare Tabs, Countdown nur bei sichtbarem Fenster, höchstens einer pro Tab, abgeschaltet heisst keine Hinweise.
  - **Wiederherstellen:** alle Fälle aus dem Abschnitt „Wiederherstellen“.
  - **Übernahme** eines Zustands der Version 1.
  - **Wachhalten:** Mit nachgemachtem Port meldet der Kern die wirksame Stufe beim Start und bei jeder Änderung; Ein- und Ausschalten, Wechsel der Stufe bei eingeschaltetem und ausgeschaltetem Wachhalten, dieselbe Stufe zweimal; nach einem Neustart läuft ein eingeschaltetes Wachhalten mit derselben Stufe von selbst wieder; Beenden und Einfrieren ändern die gespeicherte Einstellung nicht; ein Zustand ohne die Angaben ergibt „aus“ und „nur Rechner“.

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
  - **Befehlsvorschau (PowerShell):** Mit einem Profil, das die Vorhersage einschaltet, ist `PredictionSource` danach `None`; mit PSReadLine 2.0 bleibt die Integration still.
  - **Pfeiltasten (PowerShell):** Die Zeile aus dem Verlauf kommt im Median nach weniger als 10 ms beim Terminal-Backend an (mit der ConPTY von Windows rund 15 ms). Der Konsolen-Host jeder Shell ist `OpenConsole.exe`.
  - **Startbefehl:** Ein Startbefehl „Starter mit `--resume x`“ erreicht das nachgemachte `claude` mit `--settings`, in allen vier Shells, genau einmal.
  - **Ende zu Ende:** mit dem echten Kern und der echten lokalen Schnittstelle statt der Testattrappe. `claude` im Tab macht ihn zum unbestätigten Claude-Tab mit der Kennung, die der Kern vergeben hat; das Ende macht ihn wieder normal. Tab-Name und Ordner mit Umlauten kommen richtig an. Mit nachgemachter Gruppenrichtlinie `AllSigned` fehlt der Ersatz, und `claude` läuft direkt. Ein Fortsetzen ohne `THUB_STARTER` lässt die Zuordnung nach der (verkürzten) Frist fallen, während `claude` weiterläuft; ein weiterer Neustart setzt nichts fort.
- Diese Tests sind langsamer und laufen in einem eigenen Testlauf, getrennt von Teststelle 1.

### Nicht automatisch getestet

- Die React-Oberfläche: Das Aussehen wird am Prototyp abgestimmt, die Bedienung von Hand anhand der User Stories abgenommen.
- Die Shell-Erkennung selbst und das Verhalten unter Gruppenrichtlinien: werden von Hand geprüft.
- Die tatsächliche Wirkung des Wachhaltens (kein Energiesparmodus, Bildschirm bleibt an): Sie zeigt sich erst nach der eingestellten Zeit ohne Eingabe und wird von Hand geprüft. Automatisch geprüft wird, dass der echte Port die Anforderungen ohne Fehler von Windows setzt und wieder aufhebt.

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
- Beim Wachhalten: simulierte Eingaben (etwa Tastendrücke gegen Sperre oder „Abwesend“-Status), eine Zeitbegrenzung („für 2 Stunden“) und ein automatisches Wachhalten nur, solange Claude arbeitet oder Prozesse laufen.
- Beim App-Symbol: ein Symbol in der Titelleiste von THub und Status-Overlays am Taskleisten-Symbol.
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
