# Abnahme von Hand: THub 2

Eine Liste für die gesammelte Abnahme am Schluss ([Ticket 19](tickets/19-readme-und-abschluss.md)). Sie enthält alle Punkte „Abnahme von Hand“ der Tickets 01 bis 20 und 22, dazu die Punkte, die die umsetzenden Agenten der Tickets 16, 17 und 22 nachgereicht haben. Doppelte sind zusammengelegt; in Klammern steht, aus welchem Ticket ein Punkt stammt, etwa „(T16)“.

- Ticket 10 hat keine eigenen Punkte; die Prüfung mit echtem Claude steckt in Ticket 11.
- Ticket 21 ist verworfen (der Verlauf steht nach einem Neustart weiterhin im Scrollback); seine Punkte entfallen.
- Wie sich THub verhalten soll, steht im [Handbuch](handbuch.md) und in der [Spezifikation](specs/termhub-v2.md).

**Kennzeichen**

- **[Claude]**: braucht ein installiertes, angemeldetes Claude Code.
- **[Frisch]**: braucht einen zweiten Rechner oder einen frischen Windows-Benutzer ohne THub-Daten.

**Vorbereitung**

- Installer bauen: `npm run dist` → `release\THub Setup <version>.exe`. Die meisten Punkte gehen mit der installierten App; `npm start` nimmt den eigenen Datenordner `%APPDATA%\THub-dev`.
- Bereithalten: einen Projektordner mit einem `npm run dev`, das weiterläuft (Dev-Server); PowerShell 7 mit einem Profil (etwa oh-my-posh), Git Bash und eine WSL-Distribution, soweit vorhanden.
- Weicht etwas ab, unten unter [Gefundene Abweichungen](#gefundene-abweichungen) eintragen und weitermachen.

## Installation und erster Start

- [ ] Fenstertitel und Taskleiste zeigen „THub“. (T20)
- [ ] Eine Zustandsdatei aus Version 0.1.0 (Version 1) wird beim ersten Start übernommen: Dazu sie einmal als `state.json` in den Entwicklungs-Datenordner `%APPDATA%\THub-dev` kopieren und `npm start` starten; die Tabs sind da, mit ihren Namen. (T01)
- [ ] Eine vorhandene TermHub-Entwicklungsinstallation (`%APPDATA%\TermHub-dev`) wird beim ersten Start übernommen, solange `%APPDATA%\THub-dev` noch keine `state.json` hat: Die Tabs sind wieder da, der alte Ordner bleibt unverändert. (T20)
- [ ] `npm start` neben einer installierten THub: Beide laufen unabhängig. (T09)
- [ ] In der installierten App (bzw. im gebauten Paket `release\win-unpacked`) funktioniert die Shell-Integration ebenfalls: In einem Tab mit `cd` den Ordner wechseln, der Tooltip zeigt den neuen Ordner. (T07)

## Fenster

- [ ] Das Überfahren von „Maximieren“ zeigt die Andock-Layouts von Windows 11. Das Fenster lässt sich an der freien Fläche neben den Tabs verschieben und per Doppelklick darauf maximieren. (T04)
- [ ] Maximiert beenden → THub startet maximiert, und „Wiederherstellen“ ergibt die alte Grösse. (T09)
- [ ] THub ein zweites Mal starten, auch während das Fenster minimiert ist → das bestehende Fenster kommt nach vorne, es gibt kein zweites. Mit einem Claude-Tab: nichts wird doppelt fortgesetzt. (T09)

## Tabs

- [ ] Terminals öffnen, umbenennen und schliessen, THub beenden und neu starten: Alles verhält sich wie im Handbuch beschrieben. (T01)
- [ ] Mit 20 Tabs: Die Tabs werden schmaler, die Leiste scrollt, auch mit dem Mausrad, und der aktive Tab bleibt sichtbar. (T03)
- [ ] Umbenennen per Doppelklick und mit `F2`: Enter übernimmt, Escape bricht ab, danach ist der Fokus wieder im Terminal. (T03)
- [ ] `exit` in einer Shell, danach eine beliebige Taste → die Shell startet neu. (T03)
- [ ] Einen Tab mit laufendem `npm run dev` mit `×` schliessen → Rückfrage. (T15)
- [ ] **[Claude]** Einen ruhenden Claude-Tab schliessen → keine Rückfrage; `Ctrl+Shift+Z` → der Tab ist wieder da, und das Gespräch geht weiter. (T15)

## Shells und Shell-Integration

- [ ] Im Pfeil-Menü neben `+` erscheinen die Shells dieses Rechners (hier PowerShell 7, Windows PowerShell, Eingabeaufforderung, Git Bash und WSL Ubuntu), `docker-desktop` nicht. Alle starten im richtigen Ordner. (T06)
- [ ] Einen Git-Bash-Tab anlegen, THub neu starten → der Tab ist wieder Git Bash. (T06)
- [ ] Ein vorhandenes PowerShell-Profil (etwa mit oh-my-posh) funktioniert weiter; der Prompt sieht aus wie ausserhalb von THub. (T07)
- [ ] Optional, falls verfügbar: Mit Execution Policy `AllSigned` startet PowerShell trotzdem. (T07)
- [ ] Windows PowerShell 5.1: Die Fenstergrösse mehrmals ändern, dann tippen → die Shell reagiert. Im Versuch zu Ticket 21 blieb sie einmal ohne Ausgabe hängen; bestätigt es sich, als Ticket erfassen. (T19)

## Ordner

- [ ] „Neues Terminal in …“ → „Ordner wählen …“ → der Tab startet im gewählten Ordner und heisst wie er; der Ordner steht danach oben in der Liste. (T05)
- [ ] In jeder Shell mit `cd` den Ordner wechseln, THub neu starten → der Tab startet im neuen Ordner. (T07)

## Wiederherstellen nach einem Neustart

- [ ] Befehle ausführen, das Fenster mit `×` schliessen, THub neu starten → der frühere Inhalt steht ausgegraut mit der Trennlinie „Wiederhergestellt · …“ über dem neuen Prompt (im Scrollback, einmal hochscrollen), gut lesbar in hell und dunkel. (T08)
- [ ] Mit offenem `vim` bzw. `less` beenden → im Verlauf steht die normale Shell-Ausgabe, nicht der Vollbildinhalt. (T08)
- [ ] THub per Task-Manager beenden → nach dem Neustart ist der Inhalt bis höchstens etwa 30 Sekunden vor dem Absturz da. (T08)
- [ ] Windows mit offenem THub neu starten (T08, T12):
  - der Verlauf der normalen Tabs ist da;
  - **[Claude]** ein offener Claude-Tab setzt seine Session fort.
- [ ] **[Claude]** Zwei Claude-Tabs und ein normaler Tab, einer der Claude-Tabs aktiv; das Fenster mit `×` schliessen, THub neu starten → der aktive Claude-Tab läuft sofort mit dem bisherigen Gespräch weiter; der andere ist pausiert (graues Pause-Symbol) und startet beim Anklicken. (T12)
- [ ] **[Claude]** In einem Claude-Tab `/exit`, THub neu starten → der Tab kommt als normales Terminal mit Verlauf zurück. (T12)
- [ ] **[Claude]** Story 38: In einem Testordner `.claude/settings.local.json` mit `"disableAllHooks": true` anlegen, dort `claude` starten, etwas schreiben, THub neu starten → die Session wird fortgesetzt, nur ohne Status. (T12)
- [ ] **[Claude]** Das Fenster schliessen, während Claude arbeitet → keine Rückfrage; nach dem Neustart geht es weiter. (T15)

## Claude: Erkennung und Status

- [ ] **[Claude]** In einem Tab `claude` tippen → der Tab ist als Claude-Tab mit der richtigen Kennung vermerkt (`state.json` bzw. Entwicklerwerkzeuge), und die Session trägt den Tab-Namen in Claudes `/resume`-Liste. (T11)
- [ ] **[Claude]** `/clear` → die neue Kennung ist vermerkt. `/exit` → der Tab ist wieder ein normales Terminal. (T11)
- [ ] **[Claude]** In cmd `claude` starten und mit `Ctrl+C` beenden → keine Rückfrage „Batchvorgang abbrechen?“. (T11)
- [ ] **[Claude]** `~/.claude/settings.json` ist unverändert. Eine Claude-Session ausserhalb von THub zeigt keine Hook-Fehler. (T11)
- [ ] **[Claude]** Prompt senden → violett; eine Aktion, die eine Berechtigung braucht → orange; Claude wird in einem anderen Tab fertig → grün, und der grüne Punkt verschwindet beim Öffnen des Tabs. (T13)
- [ ] **[Claude]** Claude startet einen Dev-Server im Hintergrund → nach dem Ende der Antwort blau. (T13)
- [ ] `npm run dev` in einem normalen Tab → blau, nach `Ctrl+C` kein Symbol mehr. (T13)
- [ ] Ein Git-Bash-Tab und ein PowerShell-Tab mit oh-my-posh im Leerlauf zeigen kein Symbol. (T13)
- [ ] Mit 20 offenen Tabs braucht THub im Leerlauf im Mittel unter 1 % CPU (Task-Manager). (T13)
- [ ] **[Claude]** Hinter einem Firmen-Proxy (falls vorhanden) funktionieren Status und Fortsetzen. (T19)

## Hinweise im Fenster

- [ ] **[Claude]** Eine Berechtigungsfrage in einem Hintergrund-Tab → der Hinweis unten rechts bleibt stehen; ein Klick darauf öffnet den Tab, und der Hinweis ist weg. (T14)
- [ ] **[Claude]** Während ein Hinweis sichtbar ist, im aktiven Terminal weitertippen → nichts geht verloren. (T14)
- [ ] **[Claude]** Aussehen und Stapeln mehrerer Hinweise wie im Prototyp. (T14)

## Offene Punkte

- [ ] **[Claude]** Eine Aufgabe geben, bei der Claude Rückfragen hat → der Hinweis „Offene Punkte“ erscheint unten rechts mit den Fragen, auch im aktiven Tab: höchstens vier Punkte zu je höchstens zwei Zeilen, bei mehr „+ k weitere“. (T22)
- [ ] **[Claude]** Den Tab wechseln und zurück → der Hinweis bleibt; erst ein Klick auf den Hinweis (springt in den Tab) oder `×` schliesst ihn. (T22, T27)
- [ ] **[Claude]** Eine spätere Antwort mit neuen Punkten ersetzt den Hinweis. Eine Antwort ohne Punkte lässt ihn stehen, und liegt der Tab im Hintergrund, erscheint „fertig“ daneben. (T22)
- [ ] **[Claude]** THub neu starten → der nicht geschlossene Hinweis ist wieder da. (T22)
- [ ] **[Claude]** Den Tab schliessen und mit `Ctrl+Shift+Z` wieder öffnen → der Hinweis kommt nicht zurück. (T22)
- [ ] **[Claude]** „Offene Punkte aus Claudes Antworten anzeigen“ ausschalten → der stehende Hinweis verschwindet, und es kommen keine neuen mehr. (T22)

## Befehlspalette und Tastenkürzel

- [ ] Mit 15 offenen Tabs: `Ctrl+Shift+P`, einen Teil eines Tab-Namens tippen, Enter → der Tab wird angezeigt, ohne die Maus, und man kann sofort ins Terminal tippen. (T17)
- [ ] Palette und Übersicht der Tastenkürzel sehen aus wie im Prototyp, in hell und dunkel. (T17)
- [ ] `Ctrl+Shift+P` in PowerShell, cmd und **[Claude]** einem Claude-Tab erzeugt kein Zeichen im Terminal; `Ctrl+K` funktioniert weiterhin in Claude und in den Shells. (T17)
- [ ] Bei offener Palette geht Tippen ins Suchfeld, nichts erreicht das Terminal; ein Klick daneben schliesst sie. (T17)
- Jeden Befehl der Palette einmal ausführen (T17):
  - [ ] „Neues Terminal“
  - [ ] „Neues Terminal in …“: einen zuletzt benutzten Ordner, und „Ordner wählen …“
  - [ ] „Tab umbenennen“
  - [ ] „Tab schliessen“ auf einem Tab mit laufendem `npm run dev` → Rückfrage
  - [ ] „Andere Tabs schliessen“ → eine gemeinsame Rückfrage
  - [ ] „Zuletzt geschlossen …“ → der gewählte Tab öffnet wieder
  - [ ] „Einstellungen“
  - [ ] „Standardordner ändern“ → der Ordner-Dialog von Windows, danach ist der Fokus wieder im Terminal
  - [ ] „Tastenkürzel anzeigen“
- [ ] Einstellungen → „Alle Tastenkürzel …“ → Übersicht → „Fertig“ → wieder in den Einstellungen. (T17)
- [ ] Bei einem niedrigen Fenster scrollt die Übersicht der Tastenkürzel, auch mit der Tastatur. (T17)
- [ ] Auf einer Schweizer Tastatur funktionieren `Ctrl+Shift+P`, `Ctrl` `+` (Shift+1), `Ctrl` `-`, `Ctrl` `0`, `Ctrl+Shift+Z` und `+` / `-` auf dem Ziffernblock wie in der Übersicht angegeben. (T17, T18)
- [ ] Lange Ordnerpfade sind in der Palette in der Mitte gekürzt (`C:\…\a\b\c`); der ganze Pfad steht im Tooltip. (T17)

## Rechtsklick-Menü und Ziehen

- [ ] Der Rechtsklick auf einen Tab öffnet sein Menü an der Stelle des Mauszeigers, nie das Fenstermenü von Windows, auch nicht bei einem Rechtsklick auf das offene Menü. Pfeiltasten, Enter und Escape funktionieren. (T04, T16)
- [ ] „Umbenennen“ benennt den Tab um, auf den rechts geklickt wurde, auch wenn er nicht der aktive ist. (T16)
- [ ] „Duplizieren“: Der neue Tab erscheint rechts neben der Quelle, in ihrem aktuellen Ordner nach `cd`, mit derselben Shell; von einem **[Claude]** Claude-Tab nur das Terminal, ohne Claude. (T16)
- [ ] „Ordner im Explorer öffnen“ zeigt den richtigen Ordner, auch nach `cd`. (T16)
- [ ] „Pfad kopieren“: Einfügen in einem anderen Programm ergibt den aktuellen Ordner. (T16)
- [ ] „Schliessen“ auf einem Tab mit laufendem Dev-Server und „Andere Tabs schliessen“, während in einem der anderen Tabs ein Dev-Server läuft: jeweils genau eine Rückfrage; „Abbrechen“ lässt alle Tabs offen. (T16)
- [ ] Beim Ziehen sehen die Marke, das Abbild des Tabs und der blasse Tab in hell und dunkel richtig aus. (T16)
- [ ] Mit 15 oder mehr Tabs: Ziehen an den Rand der Leiste scrollt sie, und ein Tab lässt sich an beiden Enden ablegen. (T16)
- [ ] Ziehen auf die Fensterknöpfe, die freie Fläche, das Terminal oder aus dem Fenster hinaus: Nichts verschiebt sich, nichts bleibt hängen. Die freie Fläche verschiebt danach weiterhin das Fenster, und ein Doppelklick darauf maximiert es. (T16)
- [ ] Nach dem Umsortieren und einem Neustart ist die Reihenfolge erhalten, und `Ctrl+1` … `9` folgen ihr. (T16)
- [ ] Ein Klick auf einen Tab lässt den Fokus im Terminal (der Cursor bleibt ausgefüllt) und beginnt kein Ziehen. (T16)

## Einstellungen

- [ ] Das Umschalten zwischen System, Hell und Dunkel wirkt sofort, ohne Neustart. (T18)
- [ ] Nach einer Änderung der Schriftgrösse laufen **[Claude]** Claude und andere Vollbildprogramme (etwa `vim`) ohne Darstellungsfehler weiter. (T18)

## Aussehen

- [x] Der Look des Prototyps ist freigegeben. (T02)
- [ ] Tab-Leiste und Fenster sehen aus wie im freigegebenen Prototyp, in hell und dunkel; bei „System“ zieht ein Wechsel in den Windows-Einstellungen sofort mit. (T03, T04, T18)
- [ ] Die Fensterknöpfe sind in beiden Designs gut lesbar. (T04)
- [ ] Pfeil-Menü und Einstellungsdialog sehen aus wie im Prototyp. (T05)
- [ ] **[Claude]** Ob die helle Terminalfläche mit Claude gut aussieht, ist entschieden und in der Spezifikation vermerkt („Weitere Hinweise“). (T19)

## Frischer Rechner oder frischer Windows-Benutzer

Den Installer auf einem zweiten Rechner oder unter einem frischen Windows-Benutzer ohne THub-Daten installieren. (T19)

- [ ] **[Frisch] [Claude]** Mit installiertem Claude Code: Die Installation läuft ohne Einrichtung oder Rückfrage, die Claude betrifft. (T19)
- [ ] **[Frisch]** Die erkannten Shells stimmen; PowerShell 7 ist Standard, falls vorhanden. (T19)
- [ ] **[Frisch] [Claude]** `claude` in einem Tab → die Status-Symbole funktionieren. (T19)
- [ ] **[Frisch] [Claude]** `~/.claude/settings.json` ist danach unverändert. (T19)
- [ ] **[Frisch] [Claude]** Nach einem Neustart des Rechners ist alles wieder da: normale Tabs mit Verlauf im letzten Ordner, der aktive Claude-Tab läuft weiter, die anderen sind pausiert. (T19)
- [ ] **[Frisch]** Ohne installiertes Claude Code funktioniert THub als normales Terminal-Fenster, ohne Fehlermeldungen beim Start. (T19)

## Abschluss

- [ ] Alle Abschnitte dieser Liste sind durchgeklickt; jede Abweichung steht unten und ist als neues Ticket erfasst. (T19)

## Nachprüfung nach den Korrekturen (Tickets 23 bis 27)

Nach der Installation des neuen Installers. Die Abweichungen unten sind in diesen Tickets behoben.

**PowerShell (T24)**

- [ ] In einem PowerShell-7-Tab mit dem echten Profil mit den Pfeiltasten durch den Verlauf blättern, auch mit gedrückt gehaltener Pfeiltaste → so flüssig wie im Windows Terminal. (T24)
- [ ] `cd` tippen → keine graue Vorschau, keine Vorschlagsliste. (T24)
- [ ] THub neu starten → im wiederhergestellten Tab steht der Prompt oben, die Trennlinie „Wiederhergestellt“ direkt darüber im Scrollback; Tippen und Pfeiltasten zeichnen in der richtigen Zeile. (T24)
- [ ] `exit` in einem Tab, dann eine Taste → die neue Shell beginnt oben, der alte Inhalt steht im Scrollback. (T24)
- [ ] Fenster- und Schriftgrösse in einem PowerShell-Tab und einem **[Claude]** Claude-Tab ändern → der Inhalt bleibt intakt. (T24)
- [ ] cmd, Git Bash, WSL und Windows PowerShell starten und funktionieren normal; **[Claude]** Claude Code im Tab läuft normal (Darstellung, Status, Esc). (T24)

**Links und Rechtsklick (T25)**

- [ ] **[Claude]** Claude gibt eine URL aus → keine gestrichelte Linie; beim Überfahren Hand und durchgezogene Linie; Ctrl+Klick öffnet sie im Browser, ein normaler Klick nicht. Auch im Vollbild von Claude öffnet Ctrl+Klick den Link genau einmal. (T25)
- [ ] Eine Dev-Server-Adresse in einer normalen Shell → Ctrl+Klick öffnet sie. (T25)
- [ ] **[Claude]** Rechtsklick in Claude fügt die Zwischenablage genau einmal ein, Shift+Rechtsklick ebenfalls; mit einer Auswahl in Claude kopiert der Rechtsklick. (T25)
- [ ] In PowerShell und cmd verhält sich der Rechtsklick wie bisher (mit Auswahl kopieren, sonst einfügen). (T25)

**Tab-Leiste, Farben, Dropdown (T26)**

- [ ] Die Tabs sind etwas höher. Im maximierten Fenster wählt ein Klick ganz oben am Bildschirmrand den Tab darunter; Rechtsklick, Ziehen und Tooltip gehen dort auch. (T26)
- [ ] Im nicht maximierten Fenster lässt sich das Fenster am oberen Rand weiterhin vergrössern; die freie Fläche verschiebt es, ein Doppelklick maximiert, das Überfahren von „Maximieren“ zeigt die Andock-Layouts. (T26)
- [ ] Mit dem ersten Tab aktiv: `+`, `Ctrl+Shift+T`, Pfeil-Menü und Palette öffnen den neuen Tab am Ende; „Duplizieren“ legt weiterhin rechts neben der Quelle an. (T26)
- [ ] Im dunklen Design ist die aufgeklappte Liste „Standard-Shell“ dunkel und lesbar. (T26)
- [ ] **[Claude]** Der Claude-Stern „arbeitet“ ist im dunklen Design gut sichtbar. (T26)

**Offene Punkte (T27)**

- [ ] **[Claude]** In einer neuen Session (oder nach `/clear`) einige normale Prompts → nur noch selten ein Hinweis, und nur bei echten Rückfragen, nicht bei Angeboten wie „Soll ich auch noch …?“. (T27)
- [ ] **[Claude]** Ein Klick auf einen Hinweis „Offene Punkte“ öffnet den Tab und schliesst den Hinweis, auch im gerade aktiven Tab; `×` schliesst ihn ohne Wechsel. (T27)
- [ ] **[Claude]** THub neu starten → ein per Klick geschlossener Hinweis kommt nicht zurück, ein stehen gelassener schon. (T27)

**Fortsetzen ohne Starter (T23, optional)**

- [ ] **[Frisch] [Claude]** Auf einem Testbenutzer: Claude-Tab erfassen, Ausführungsrichtlinie `AllSigned` setzen, THub neu starten → die Session läuft weiter, nach etwa 30 s wird der Tab ein normales Terminal; nach `/exit` und einem weiteren Neustart wird sie nicht wieder fortgesetzt. (T23)

## Gefundene Abweichungen

Pro Abweichung einen Eintrag; daraus wird später ein Ticket in [docs/tickets](tickets/README.md).

```markdown
### <kurzer Titel>

- **Was:** <was nicht stimmt, in einem Satz>
- **Wo:** <Abschnitt und Punkt dieser Liste, z.B. „Tabs, T15“; Shell, Design hell/dunkel, installierte App oder npm start>
- **Erwartet:** <was laut Liste, Handbuch oder Spezifikation passieren sollte>
- **Tatsächlich:** <was passiert ist; wenn möglich mit Schritten zum Nachstellen und einem Screenshot>
```

### Verwendung von Tastaturpfeilen im Terminal
→ [Ticket 24](tickets/24-powershell-fluessig.md)

Wenn ich einen Befehl im Terminal eingegeben ahbe und dann zum beispiel einen früheren nochmals ausführen will, kann ich mit den Tastaturpfeilen durch die bereits ausgeführen befehle navigieren. Diese Navigation ist langsam und fühlt sich nicht nach realtime an.

### Die Befehlspreview
→ [Ticket 24](tickets/24-powershell-fluessig.md)

In den Terminals wird wenn ich zum Beipsiel "cd" eingebe, gleich eine Vorschau angezeigt, was ich noch eingeben könnte. das soll komplett wegfallen.

### Die Tableiste
→ [Ticket 26](tickets/26-tableiste-und-dropdown.md)

Die einelnen Tabs könnten ein wenig mehr Höhe haben.
Die einzelnen Tabs sollen ausserdem bis ganz an den oberen Rand der applikation gehen, sodass man nicht daneben klickt

### Nachrichten
→ [Ticket 27](tickets/27-offene-punkte-seltener.md)

Die Nachrichten für noch offene Puntke sind gut, aber ich denke die können ebenfalls automatische geschlossen werden, wenn darauf geklickt wird

### Links in Claude
→ [Ticket 25](tickets/25-links-und-rechtsklick.md)

Ich weiss nicht, ob das das Terminal ist oder von wo das kommt, aber Claude hat mir eine URL angezeigt "http://localhost:3100/#/search-input" und die url wir mit einer komischen gestrichelten Linie unterschrichen. Wenn das von THub kommt, will ich das gerne entfernen

### Offene Punkte
→ [Ticket 27](tickets/27-offene-punkte-seltener.md)

Das mit den offenen Punkten ist grundsätzlch gut, aber aktuell kommt so etwa nach fast jedem prompt was nicht die idee davon war. Die Idee war, dass falls claude mal noch offene punkte hat, diese nicht übersehen werden und nicht, dass claude dazu aufgefordert wird jedesmal noch etwas zu finder oder zu erfinden

### Kopieren mit rechter Maustaste
→ [Ticket 25](tickets/25-links-und-rechtsklick.md)

Wenn ich etwas auf dem Computer kopiere und dann nach Claude Pase wird der Text 2mal eingefügt anstatt nur einmal

### Dropdown in den Einstellungen
→ [Ticket 26](tickets/26-tableiste-und-dropdown.md)

Wird das "Standard-Shell" dropdown im darkmodus aufgeklappt sieht man nur eine weisse liste

### Neue Tabs
→ [Ticket 26](tickets/26-tableiste-und-dropdown.md)

Hat man mehrere Tabs offen und den ganz links ausgewähl und öffnet dann über das + einen neuen Tab wird der neue Tab direkt neben dem ausgewählten Tab geöffnet anstatt am ende der liste. Der neue Tab soll auch am ende der Liste erscheinen

