# THub – Handbuch

Ausführliche Bedienung von THub. Eine Kurzfassung steht im [README](../README.md), Aufbau, Tests und Entwicklung in [docs/entwicklung.md](entwicklung.md).

## Bedienung

### Tabs

- **Neues Terminal:** `+` oder `Ctrl+Shift+T` öffnet sofort ein Terminal mit der Standard-Shell im Standardordner, am Ende der Leiste. Das gilt für jeden neuen Tab (Pfeil-Menü, Befehlspalette), egal welcher Tab aktiv ist; nur „Duplizieren“ legt ihn direkt neben die Quelle, und ein wieder geöffneter Tab kommt an seine alte Stelle.
- **Pfeil neben `+`** („Shell oder Ordner wählen“): zuerst die erkannten Shells, die Standard-Shell mit dem Etikett „Standard“; ein Klick öffnet einen Tab mit dieser Shell im Standardordner. Darunter „Neues Terminal in …“ mit den zuletzt benutzten Ordnern (Name, darunter der Pfad) und „Ordner wählen …“ (Ordner-Dialog von Windows).
- **Namen:** Ein neuer Tab heisst wie sein Ordner, im Benutzerordner wie der Benutzer, auf einem Laufwerk wie das Laufwerk (`D:`). Bei Gleichstand kommt „ 2“, „ 3“ usw. dazu; Gross- und Kleinschreibung zählen dabei nicht. Der Name bleibt danach, auch nach `cd`.
- **Umbenennen:** Doppelklick auf den Tab, `F2`, Rechtsklick-Menü oder Befehlspalette. Der Tab wird selbst zum Eingabefeld; Enter oder ein Klick daneben übernimmt, Escape bricht ab. Ein leerer Name zählt nicht; ein von Hand vergebener Name wird nie automatisch überschrieben.
- **Wechseln:** Klick auf den Tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` und `Ctrl+PageDown` / `Ctrl+PageUp` (im Kreis), `Ctrl+1` … `Ctrl+9` oder die Befehlspalette. Ein Klick auf einen Tab lässt den Fokus im Terminal. Die Klickfläche eines Tabs reicht über die ganze Höhe der Titelleiste: Im maximierten Fenster trifft auch ein Klick ganz oben am Bildschirmrand den Tab; im normalen Fenster bleibt dort der Rand, an dem man die Fenstergrösse zieht.
- **Tooltip** beim Überfahren: Name, aktueller Ordner, Shell und Status.
- **Viele Tabs:** Die Tabs werden schmaler (bis 112 px), die Leiste wird scrollbar, auch mit dem Mausrad; der aktive Tab bleibt sichtbar. Zwischen `+` und dem Zahnrad bleibt immer eine freie Fläche von mindestens 56 px: Sie verschiebt das Fenster, ein Doppelklick maximiert es.
- **Beendete Shell** (etwa nach `exit`): Im Terminal steht „Prozess beendet mit Code n – beliebige Taste startet die Shell neu“.
- **Kopieren und Einfügen:** `Ctrl+Shift+C` / `Ctrl+Shift+V` oder Rechtsklick ins Terminal (mit Auswahl kopieren, sonst einfügen). `Ctrl+C` geht an die Shell. Hat das Programm im Terminal die Maus eingeschaltet (etwa Claude im Vollbild), gehört ihm der Rechtsklick: Claude kopiert bzw. fügt dann selbst ein, genau einmal. Mit `Shift` + Rechtsklick kopiert bzw. fügt THub trotzdem ein, wie im Windows Terminal.
- **Links:** Adressen im Terminal (Links, die Claude ausgibt, und URLs im Klartext wie die eines Dev-Servers) haben keine Linie; beim Überfahren erscheinen eine durchgezogene Unterstreichung und der Hand-Zeiger. `Ctrl` + Klick öffnet sie im Standardbrowser, nur `http:` und `https:`, ohne Rückfrage; ein Klick ohne `Ctrl` öffnet nichts. Hat das Programm die Maus eingeschaltet, geht auch `Ctrl` + Klick an das Programm (Claude öffnet den Link dann selbst); `Ctrl+Shift` + Klick öffnet ihn über THub.
- **Kein Tab mehr offen:** Die Fläche zeigt „Kein Terminal offen.“ mit dem Knopf „Neues Terminal“. Startet THub ohne gespeicherte Tabs, öffnet es selbst ein Terminal.

### Schliessen und wieder öffnen

- **Schliessen:** `×` am Tab (sichtbar beim aktiven Tab und beim Überfahren), mittlere Maustaste, `Ctrl+Shift+W`, Rechtsklick-Menü oder Befehlspalette.
- **Rückfrage nur, wenn noch etwas läuft:** Claude wartet auf dich, Claude arbeitet, oder im Terminal laufen Prozesse. Ein ruhender Tab schliesst sofort, auch ein ruhender Claude-Tab. Massgeblich ist, was wirklich läuft, nicht das Symbol: Ein grüner Tab mit laufendem Dev-Server fragt nach, „fertig“ oder „pausiert“ allein nicht. Die Rückfrage nennt den Grund und `Ctrl+Shift+Z`; den Fokus hat „Abbrechen“, „Schliessen“ ist der Gefahr-Knopf.
- **Andere Tabs schliessen** (Rechtsklick-Menü, Befehlspalette): höchstens eine gemeinsame Rückfrage, die die Tabs nennt, in denen noch etwas läuft. Bestätigt schliessen alle, „Abbrechen“ lässt alle offen.
- **Fenster schliessen oder THub beenden** fragt nie nach, auch nicht, wenn Claude gerade arbeitet: Alles kommt beim nächsten Start zurück.
- **Mit dem Tab endet alles, was darin läuft:** die Shell und alle ihre Nachfahren, auch Programme mit eigener Konsole (etwa per `Start-Process` gestartet). THub beendet einen Prozess nur, wenn Prozess-ID und Startzeit noch stimmen.
- **Wieder öffnen:** `Ctrl+Shift+Z` öffnet den zuletzt geschlossenen Tab, „Zuletzt geschlossen …“ in der Befehlspalette jeden der letzten zehn. Der Tab kommt an seiner alten Stelle mit Name, Shell und Ordner zurück und wird aktiv: ein normaler Tab mit seinem Verlauf im zuletzt aktiven Ordner, ein Claude-Tab setzt seine Session sofort fort. Die Liste übersteht einen Neustart. Offene Punkte (siehe unten) kommen nicht mit zurück.

### Rechtsklick-Menü am Tab

Rechtsklick auf einen Tab öffnet sein Menü an der Stelle des Klicks, ohne den Tab zu aktivieren, nie das Fenstermenü von Windows. Bedienung auch mit Pfeiltasten, Pos1/Ende, Enter und Escape.

| Eintrag | Wirkung |
|---|---|
| Umbenennen (`F2`) | wie ein Doppelklick auf diesen Tab |
| Duplizieren | neuer Tab direkt rechts daneben, im aktuellen Ordner des Tabs (gibt es ihn nicht mehr: Startordner, Standardordner, Benutzerordner), mit derselben Shell und einem Namen nach dem Ordner. Er wird aktiv und startet eine eigene Shell ohne Verlauf. Von einem Claude-Tab nur das Terminal, ohne Claude-Session und ohne offene Punkte. |
| Ordner im Explorer öffnen | der aktuelle Ordner des Tabs wie im Tooltip, also auch nach `cd`; nur, wenn es ihn gibt |
| Pfad kopieren | derselbe Ordner in die Zwischenablage |
| Schliessen (`Ctrl+Shift+W`) | wie `×`, mit Rückfrage, wenn noch etwas läuft |
| Andere Tabs schliessen | alle übrigen Tabs, mit höchstens einer gemeinsamen Rückfrage |

### Umsortieren per Ziehen

- Ab 4 px Bewegung mit gedrückter linker Taste wird ein Tab gezogen: Ein Abbild folgt der Maus, der Tab steht blass an seinem Platz, eine Marke zeigt, wo er landet.
- In den äussersten 28 px einer überlaufenden Leiste scrollt sie von selbst, je näher am Rand, desto schneller; das Mausrad scrollt sie auch.
- Abgelegt wird nur über der Leiste. Losgelassen über den Fensterknöpfen, der freien Fläche, dem Terminal oder ausserhalb des Fensters, mit Escape oder bei Fokusverlust bricht das Ziehen ab.
- Ein Klick ohne Bewegung aktiviert den Tab wie gewohnt.
- Die Reihenfolge übersteht einen Neustart, und `Ctrl+1` … `Ctrl+9` folgen ihr.

### Befehlspalette

`Ctrl+Shift+P` öffnet sie, aus jedem Tab heraus. Oben steht das Suchfeld, darunter die Gruppen „Tabs“ (Name, Ordner, Status-Symbol; Enter zeigt den Tab an) und „Befehle“:

| Befehl | Wirkung |
|---|---|
| Neues Terminal | wie `+` |
| Neues Terminal in … | Unterliste: zuletzt benutzte Ordner und „Ordner wählen …“, wie im Pfeil-Menü |
| Tab umbenennen | den aktiven Tab |
| Tab schliessen | den aktiven Tab, mit Rückfrage nach denselben Regeln |
| Andere Tabs schliessen | nur, wenn mehr als ein Tab offen ist |
| Zuletzt geschlossen … | Unterliste der letzten zehn geschlossenen Tabs; Enter öffnet den gewählten wieder |
| Einstellungen | öffnet den Einstellungsdialog |
| Standardordner ändern | Ordner-Dialog wie „Ändern …“ in den Einstellungen |
| Tastenkürzel anzeigen | Übersicht aller Tastenkürzel |
| Version kopieren | die Versionszeile aus den Einstellungen in die Zwischenablage |
| Rechner wach halten | Stufe „nur Rechner“ wählen und einschalten, wie im Pfeil-Menü am Schalter |
| Rechner und Bildschirm wach halten | Stufe „Rechner und Bildschirm“ wählen und einschalten |
| Wachhalten beenden | nur, solange der Rechner wach gehalten wird; wie ein Klick auf den Schalter |

- Rechts neben einem Befehl steht sein Tastenkürzel. Befehle für Claude gibt es bewusst keine; was einen aktiven Tab braucht, fehlt ohne ihn.
- **Suche:** unscharf. Die Zeichen müssen in dieser Reihenfolge vorkommen, nicht nebeneinander: „termhb“ findet „termhub“, „neu term“ findet „Neues Terminal“. Zusammenhängende Treffer und Wortanfänge zählen mehr. Vom Ordner eines Tabs zählen nur die letzten zwei Teile, und schwächer als der Name. Die Gruppe mit dem besten Treffer steht oben, bei gleich gutem Treffer Tabs vor Befehlen.
- **Bedienung:** Pfeiltasten wählen, Enter führt aus, Escape schliesst; in einer Unterliste führen Escape und die Rücktaste im leeren Suchfeld zurück. Ein Klick daneben schliesst die Palette. Danach ist der Fokus im Terminal. Solange die Palette offen ist, erreicht keine Taste das Terminal.
- Lange Pfade sind in der Mitte gekürzt (`C:\…\a\b\c`); der ganze Pfad steht im Tooltip.

### Ordner

- **Standardordner:** Hier starten neue Terminals (`+`, `Ctrl+Shift+T`, eine Shell aus dem Pfeil-Menü). Ohne Einstellung gilt der Benutzerordner. Eine Änderung gilt nur für neue Tabs; offene Tabs bleiben, wo sie sind.
- **Aktueller Ordner:** Jede Windows-Shell meldet THub bei jedem Prompt ihren Ordner (siehe [Shell-Integration](entwicklung.md#shell-integration-und-starter)); WSL-Tabs bleiben bei ihrem Startordner. THub zeigt ihn im Tooltip, nimmt ihn für „Duplizieren“, „Ordner im Explorer öffnen“ und „Pfad kopieren“ und startet den Tab nach einem Neustart dort.
- **Zuletzt benutzte Ordner:** die Startordner neuer Tabs (auch duplizierter) und der letzte Ordner eines Tabs beim Schliessen. Höchstens acht, neueste zuerst, ohne Doppelte, auch nicht als 8.3-Kurzname und Langform. Angeboten werden nur Ordner, die es noch gibt; die anderen bleiben gespeichert, etwa ein gerade nicht verbundenes Netzlaufwerk.
- **Rückfall:** Gibt es einen Ordner nicht mehr, startet der Tab im ersten, den es gibt: zuletzt aktiver Ordner → Startordner → Standardordner → Benutzerordner.

### Shells

- THub erkennt die installierten Shells selbst: PowerShell 7 (Standardort, PATH oder Store-Version), Windows PowerShell, Eingabeaufforderung (cmd), Git Bash (Standardorte oder Installationsort laut Registry, nie ein `bash.exe` aus dem PATH) und jede WSL-Distribution einzeln, ohne die internen von Docker Desktop.
- Standard-Shell ist PowerShell 7, sonst Windows PowerShell; in den Einstellungen wählbar.
- Jeder Tab behält seine Shell, auch über einen Neustart. Fehlt sie beim Start (etwa nach einer Deinstallation), läuft der Tab mit der Standard-Shell und zeigt einen Hinweis über der ersten Zeile; gibt es sie wieder, startet er wieder mit ihr.
- Profile laden wie gewohnt: die PowerShell-Profile, das AutoRun von cmd, bei Git Bash `/etc/profile` und `~/.bash_profile` usw. Ein eigener Prompt (etwa oh-my-posh) bleibt, wie er ist.
- In PowerShell-Tabs ist die Befehlsvorschau von PSReadLine aus (die graue Vorschau beim Tippen und die Listenansicht), auch wenn das Profil sie einschaltet. Das Profil selbst bleibt unverändert; ausserhalb von THub gilt es wie bisher.
- Die Shells laufen über dieselbe ConPTY wie im Windows Terminal (`OpenConsole.exe`, mit node-pty geliefert): Was eine Shell neu zeichnet, etwa beim Blättern im Befehlsverlauf mit den Pfeiltasten, kommt nach wenigen Millisekunden an statt erst nach rund 16.
- WSL-Tabs starten mit `wsl.exe -d <Distribution> --cd <Ordner>`, ohne Integration.

### Nach einem Neustart

Beim Beenden sichert THub alles. Beim nächsten Start ist es wieder da:

- **alle Tabs** in ihrer Reihenfolge, mit Namen und Shell; der zuletzt aktive Tab wird angezeigt.
- **Normale Tabs** starten im zuletzt aktiven Ordner. Ihr früherer Inhalt steht ausgegraut im Scrollback über der neuen Eingabezeile, mit der Trennlinie „Wiederhergestellt · <Datum, Uhrzeit der Sicherung>“; eine Bewegung des Mausrads nach oben zeigt ihn. Laufende Programme kommen nicht zurück, nur die Shell.
- **Claude-Tabs** setzen ihre Session fort, siehe [Claude Code in THub](#claude-code-in-thub).
- **Das Fenster** mit Grösse, Position und Maximiert-Zustand. Beim allerersten Start öffnet es maximiert. Liegt es ausserhalb aller Bildschirme (etwa nach dem Abziehen eines Monitors), öffnet es zentriert auf dem Hauptbildschirm.
- **Offene Punkte,** deren Hinweis du nicht geschlossen hast.

Gesichert werden pro normalem Tab die letzten etwa 1000 Zeilen mit Farben, ohne den Bildschirm von Vollbildprogrammen wie `vim` oder `less`: alle 30 Sekunden für Tabs mit neuer Ausgabe, beim Schliessen eines Tabs und beim Beenden (THub wartet dafür höchstens 2 Sekunden auf die Oberfläche). Bei einer Windows-Abmeldung oder einem Neustart von Windows schreibt THub sofort, mit dem zuletzt gesicherten Verlauf. Nach einem Absturz fehlen höchstens die letzten etwa 30 Sekunden.

**Nur eine Instanz:** Ein zweiter Start holt das bestehende Fenster nach vorne, auch aus minimiertem Zustand, und beendet sich sofort. So setzen nie zwei Instanzen dieselben Sessions fort.

### Status am Tab

Links vom Tab-Namen zeigt ein Symbol, was im Tab los ist; der Tooltip nennt es als Text.

| Symbol | Status | Wann |
|---|---|---|
| gedämpft `>_` bzw. Stern | Ruht | normales Terminal bzw. Claude-Tab, nichts los |
| violetter Stern, rotiert und pulsiert | Claude arbeitet | Claude schreibt eine Antwort oder führt dabei Werkzeuge aus |
| oranger Punkt mit Ping-Ring | Claude wartet auf dich | Claude braucht eine Bestätigung oder stellt eine Rückfrage |
| grüner Punkt | Claude ist fertig (noch nicht angeschaut) | Claude wurde fertig, während der Tab nicht sichtbar war; verschwindet, sobald er angezeigt wird |
| blauer, atmender Punkt | Prozesse laufen | im Terminal läuft ein Programm (Build, `npm run dev`); in einem Claude-Tab ein Programm, das Claude in der letzten Antwort gestartet hat |
| graues Pause-Symbol | Pausiert, wird beim Öffnen fortgesetzt | Claude-Session nach einem Neustart, noch nicht angezeigt |

- Trifft mehreres zu, gilt: pausiert → wartet → arbeitet → fertig → Prozesse laufen → ruht.
- Nicht sichtbar heisst: nicht der aktive Tab, oder das Fenster ist nicht im Vordergrund.
- Bei reduzierter Bewegung (Windows-Einstellung) stehen die Animationen still; nur der Stern dreht sich langsam.
- Wie THub die Zustände erkennt: [Status erkennen](#status-erkennen).

### Hinweise im Fenster

Wartet Claude in einem Tab, den du gerade nicht siehst, auf dich oder wird dort fertig, erscheint unten rechts im Fenster ein Hinweis mit Status-Symbol, Tab-Name und „Claude wartet auf deine Bestätigung.“ bzw. „Claude ist fertig.“

- Ein Klick auf die Karte zeigt den Tab an. Das `×` (beim Überfahren) nimmt nur den Hinweis weg, das Symbol am Tab bleibt. Die Karten nehmen dem Terminal nie den Fokus: Tippen geht weiter ins aktive Terminal, auch nach einem Klick auf das `×`.
- Pro Tab höchstens ein solcher Hinweis; ein neuer ersetzt den alten. Hinweise mehrerer Tabs stehen übereinander, der neueste oben. Reicht der Platz nicht, scrollt die Spalte; sie beginnt immer unter der Titelleiste.
- Wird ein Tab angezeigt, auf welchem Weg auch immer (Klick auf Hinweis oder Tab, Tastenkürzel, Schliessen des Nachbarn, Fenster kommt mit ihm nach vorne), verschwinden seine Hinweise „wartet“ und „fertig“.
- **„Fertig“** verschwindet nach 6 Sekunden; die Zeit läuft nur, solange THub im Vordergrund ist und die Maus nicht auf der Karte steht. Die Linie am unteren Rand zeigt die übrige Zeit.
- **„Wartet“** bleibt, bis der Tab angezeigt wird oder Claude dort nicht mehr wartet.
- Abschaltbar in den Einstellungen („Hinweise im Fenster“); dann gibt es keine, auch die stehenden verschwinden. Die Status-Symbole bleiben. Windows-Benachrichtigungen und Blinken in der Taskleiste gibt es nie.

### Offene Punkte aus Claudes Antworten

Braucht Claude für den nächsten Schritt eine Entscheidung, Antwort oder Handlung von dir, schreibt es sie am Ende der Antwort in einen Abschnitt „Offene Punkte“, und THub zeigt sie unten rechts als eigenen Hinweis an: Aufzählungssymbol, Tab-Name, „Offene Punkte (n)“ und höchstens vier Punkte zu je höchstens zwei Zeilen (der ganze Text im Tooltip), darunter „+ k weitere“. Das ist die Ausnahme: Die meisten Antworten haben keine offenen Punkte, und eine blosse Frage oder ein Angebot am Ende („Soll ich auch noch …?“) ergibt keinen Hinweis.

- Ein Klick auf den Hinweis zeigt den Tab an und schliesst den Hinweis; `×` schliesst ihn, ohne den Tab anzuzeigen. Wechselst du nur zum Tab, bleibt er stehen, und er erscheint auch für den Tab, den du gerade siehst.
- Pro Tab höchstens einer: Eine neue Antwort mit offenen Punkten ersetzt ihn, eine ohne lässt ihn stehen. Er ersetzt den „Fertig“-Hinweis desselben Tabs (der grüne Punkt am Tab bleibt); kommt danach eine Antwort ohne Punkte, erscheint „fertig“ daneben. Neben „wartet“ kann er ebenfalls stehen.
- Nicht geschlossene Hinweise erscheinen nach einem Neustart wieder. Ein geschlossener Tab nimmt seinen Hinweis mit, auch beim Wiederöffnen kommt er nicht zurück. Endet Claude im Tab, bleibt er.
- Abschaltbar in den Einstellungen („Offene Punkte aus Claudes Antworten anzeigen“), unabhängig von „Hinweise im Fenster“. Ausgeschaltet verschwinden auch die stehenden Hinweise, und THub gibt Claude die Anweisung nicht mehr mit.
- Wie THub die Punkte findet: [Offene Punkte erkennen](#offene-punkte-erkennen).

### Rechner wach halten

Links neben dem Zahnrad sitzt ein Schalter mit einem Pfeil daneben. Eingeschaltet hält THub den Rechner wach, solange THub läuft: Windows geht nach der eingestellten Zeit ohne Eingabe nicht in den Energiesparmodus, und lange Claude-Sessions, Builds oder Testläufe laufen weiter, während du nicht am Rechner bist.

| Stufe | Symbol | Wirkung |
|---|---|---|
| Nur Rechner (Standard) | Kaffeetasse | kein Energiesparmodus; der Bildschirm schaltet sich nach der eingestellten Zeit trotzdem aus und sperrt wie gewohnt |
| Rechner und Bildschirm | Bildschirm | zusätzlich bleibt der Bildschirm an und wird nicht abgedunkelt |

- **Ein- und ausschalten:** Klick auf den Schalter (Symbol und kleiner Schalter), mit der gewählten Stufe. Per Tastatur mit `Tab` hingehen, dann Leertaste oder Enter. Ausgeschaltet ist das Symbol gedämpft, eingeschaltet in voller Textfarbe. Der Tooltip nennt Zustand und Stufe.
- **Stufe wählen:** Der Pfeil öffnet ein Menü mit beiden Stufen; die gewählte hat ein Häkchen. Eine Wahl setzt die Stufe und schaltet ein; die schon laufende Stufe noch einmal zu wählen, ändert nichts.
- **Befehlspalette:** „Rechner wach halten“, „Rechner und Bildschirm wach halten“ und, solange es läuft, „Wachhalten beenden“. Ein Tastenkürzel gibt es nicht.
- **Bleibt eingeschaltet:** Nach einem Neustart von THub hält es den Rechner mit derselben Stufe von selbst wieder wach. Ein Neustart des Rechners startet THub nicht; das Wachhalten beginnt mit dem nächsten Start von THub.
- **Sauber:** THub ändert keine Energieeinstellungen und startet kein Skript. Es stellt bei Windows eine Anforderung, die endet, sobald du ausschaltest oder THub endet, auch nach einem Absturz. In einer Administrator-PowerShell zeigt `powercfg /requests` sie unter `SYSTEM` (in der zweiten Stufe auch unter `DISPLAY`) mit dem Grund „THub hält den Rechner wach“.
- **Wenn es scheitert:** Lehnt Windows die Anforderung ab (oder lässt sich die Verbindung zu Windows nicht herstellen), schaltet THub das Wachhalten sofort wieder aus, auch beim Start mit gespeichertem „an“, und zeigt unten rechts einen rot markierten Fehler-Hinweis: Fehlersymbol und roter Rand, Titel „Rechner wach halten ausgeschaltet“, darunter der Grund, etwa „Windows hat die Anforderung abgelehnt (Fehler 5).“ Der Schalter steht dann auf „aus“, damit du dich nicht auf ein Wachhalten verlässt, das nicht läuft. Erneut versuchen: den Schalter wieder einschalten. Scheitert umgekehrt das Ausschalten, heisst der Hinweis „Wachhalten liess sich nicht beenden“; Windows hält dann womöglich weiter wach, bis THub beendet wird.
- Der Fehler-Hinweis gehört zu keinem Tab. Er bleibt stehen, bis du ihn anklickst oder mit `×` schliesst, erscheint auch, wenn „Hinweise im Fenster“ aus ist, und steht höchstens einmal da.

**Grenzen**

- Deckel zuklappen, der Ein-/Aus-Knopf und „Energie sparen“ im Startmenü schicken den Rechner trotzdem in den Energiesparmodus.
- Im Akkubetrieb hebt Windows auf Rechnern mit Modern Standby die Anforderung 5 Minuten nach Ablauf der eingestellten Zeit auf. Über Nacht braucht der Rechner deshalb das Netzteil.
- Eine von der Firma vorgegebene Sperre nach Inaktivität umgeht THub nicht. Ob sie in der Stufe „Rechner und Bildschirm“ ausbleibt, hängt von ihrer Einrichtung ab.
- Ein Administrator kann die Anforderung übergehen (`powercfg /requestsoverride`). Der Ruhezustand bei fast leerem Akku greift weiterhin.

### Einstellungen

Das Zahnrad rechts in der Titelleiste öffnet die Einstellungen. Jede Änderung wirkt sofort. Escape, ein Klick daneben oder „Fertig“ schliesst den Dialog, der Fokus geht zurück ins Terminal.

| Abschnitt | Einstellung | Standard |
|---|---|---|
| Allgemein | **Standardordner:** „Ändern …“ öffnet den Ordner-Dialog, „Zurücksetzen“ stellt auf den Benutzerordner zurück | Benutzerordner |
| Allgemein | **Standard-Shell** für `+` und `Ctrl+Shift+T`, unter den erkannten Shells; offene Tabs behalten ihre Shell | PowerShell 7, sonst Windows PowerShell |
| Darstellung | **Design:** System, Hell oder Dunkel | System |
| Darstellung | **Schriftgrösse im Terminal:** 8 bis 32, auch mit `Ctrl` + Mausrad | 14 |
| Hinweise | **Hinweise im Fenster** | an |
| Hinweise | **Offene Punkte aus Claudes Antworten anzeigen** | an |

„Alle Tastenkürzel …“ unten links öffnet die Übersicht der Tastenkürzel; deren „Fertig“ führt zurück in die Einstellungen.

**Version:** Ganz unten in den Einstellungen steht gedämpft die Version, etwa „THub 2.0.0 · e8e865a“: die Versionsnummer und die Kennung des Commits, aus dem THub gebaut ist. „+ Änderungen“ dahinter heisst, dass beim Bauen nicht alles committet war; „Entwicklung“, dass THub unpaketiert läuft (`npm start`). Ein Klick kopiert die Zeile in die Zwischenablage, ebenso der Befehl „Version kopieren“ in der Palette. Füge sie bei einer Fehlermeldung ein. Was sich je Version geändert hat, steht im [CHANGELOG](../CHANGELOG.md).

### Hell und dunkel

- **Design „System“** folgt Windows und zieht bei einem Wechsel in Windows sofort mit; „Hell“ und „Dunkel“ legen es fest. Die Wahl gilt für die Oberfläche, die Terminalfläche (je ein abgestimmtes Farbschema), die Fensterknöpfe und die Dialoge von Windows.
- **Eigene Titelleiste** ohne Windows-Rahmen: Die Tabs sitzen in der Titelleiste, rechts davon die nativen Fensterknöpfe mit den Andock-Layouts von Windows 11. Deckender Hintergrund ohne Transparenz, neutrale Hervorhebung ohne Akzentfarbe, das Terminal als abgerundete Karte.
- **Schriftgrösse** aller Terminals zugleich: in den Einstellungen, mit `Ctrl` + Mausrad, `Ctrl` `+` / `Ctrl` `-` und `Ctrl` `0` (zurück auf 14). Die Terminals passen Spalten und Zeilen an, die Shells erfahren die neue Grösse. Der Zoom der ganzen Oberfläche ist abgeschaltet, und `Ctrl` + Mausrad scrollt das Terminal nicht.

## Tastenkürzel

Die Tabelle entspricht `SHORTCUTS` in [src/renderer/shortcuts.ts](../src/renderer/shortcuts.ts). In THub zeigt dieselbe Übersicht: Befehlspalette → „Tastenkürzel anzeigen“, oder Einstellungen → „Alle Tastenkürzel …“. Beide entstehen aus dieser Tabelle, nach der auch die Tasten verarbeitet werden.

| Gruppe | Aktion | Kürzel |
|---|---|---|
| Tabs | Neues Terminal | `Ctrl+Shift+T` |
| Tabs | Tab schliessen | `Ctrl+Shift+W` |
| Tabs | Zuletzt geschlossenen Tab wieder öffnen | `Ctrl+Shift+Z` |
| Tabs | Nächster Tab | `Ctrl+Tab` oder `Ctrl+PageDown` |
| Tabs | Vorheriger Tab | `Ctrl+Shift+Tab` oder `Ctrl+PageUp` |
| Tabs | Zum ersten bis neunten Tab | `Ctrl+1` … `9` |
| Tabs | Tab umbenennen | `F2` |
| Bearbeiten | Kopieren | `Ctrl+Shift+C` |
| Bearbeiten | Einfügen | `Ctrl+Shift+V` |
| Darstellung | Schrift grösser | `Ctrl` `+` |
| Darstellung | Schrift kleiner | `Ctrl` `-` |
| Darstellung | Schriftgrösse zurücksetzen | `Ctrl` `0` |
| Darstellung | Schriftgrösse ändern | `Ctrl` + Mausrad |
| Fenster | Befehlspalette | `Ctrl+Shift+P` |

- `+`, `-` und `0` zählen nach dem erzeugten Zeichen, nicht nach der Tastenposition: Die Schweizer Tastatur (`+` auf Shift+1) und der Ziffernblock funktionieren, `Ctrl` `=` zählt wie `Ctrl` `+`.
- `Z` zählt nach dem erzeugten Buchstaben, also auch auf der Schweizer und der deutschen Tastatur, wo `Z` dort liegt, wo die US-Tastatur `Y` hat. Ohne lateinischen Buchstaben (etwa im russischen Layout) gilt die Position der US-Tastatur.
- Mit Alt oder AltGr ist nie ein Kürzel gemeint.
- Alle anderen Tasten gehen ans Terminal, auch `Ctrl+K` und `Ctrl+C`.
- Solange ein Menü, ein Dialog oder die Befehlspalette offen ist oder ein Tab umbenannt wird, ruhen die Kürzel.
- Mit der Maus: Doppelklick auf einen Tab benennt ihn um, die mittlere Maustaste schliesst ihn, Rechtsklick öffnet sein Menü; Rechtsklick ins Terminal kopiert bzw. fügt ein, `Ctrl` + Klick auf einen Link öffnet ihn im Browser. Hat das Programm im Terminal die Maus eingeschaltet (Claude im Vollbild), gehören ihm Rechtsklick und `Ctrl` + Klick; mit zusätzlich `Shift` handelt THub.

## Claude Code in THub

Claude startest du wie gewohnt mit `claude`, ohne Knopf und ohne Einrichtung. THub erkennt den Start, zeigt den Status am Tab und setzt die Session nach einem Neustart fort.

### Wie THub `claude` erkennt

In jeder Windows-Shell (PowerShell 7, Windows PowerShell, cmd, Git Bash) überdeckt die Shell-Integration `claude` mit einem Ersatz: eine PowerShell-Funktion, ein doskey-Makro in cmd, eine Bash-Funktion. Alle rufen denselben mitgelieferten Starter auf, [`resources/shell/starter.ps1`](../resources/shell/starter.ps1), über `powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File …\starter.ps1` mit den Argumenten wie getippt. Der Starter liest seine rohe Befehlszeile; so kommen beim echten `claude` genau dieselben Argumente an wie bei einem direkten Aufruf in derselben Shell, plus die ergänzten Optionen.

Der Starter

1. **findet das echte `claude`** im PATH, ohne den eigenen Ordner: pro Ordner `claude.exe` vor `claude.cmd`, nie `claude.ps1`. Findet er keines, schreibt er „claude wurde nicht gefunden“ und endet mit Exit-Code 1.
2. **reicht Hilfsaufrufe unverändert durch,** ohne THub zu fragen: Unterbefehle (etwa `claude mcp list`, `claude update`), `-p`/`--print`, `-v`/`--version`, `-h`/`--help`, `--bg`/`--background`, `--desktop` und `--cloud`. Sie machen den Tab nicht zum Claude-Tab.
3. **fragt sonst THub** über die [lokale Schnittstelle](entwicklung.md#lokale-schnittstelle-und-hooks) (ohne Proxy, etwa 1 Sekunde Zeitlimit) und ergänzt `--settings <Hook-Datei>`; bei einer neuen Session dazu `--session-id <Kennung von THub>` und `-n <Tab-Name>`, damit die Session in Claudes `/resume`-Liste wie der Tab heisst. Eigene Angaben gelten: Mit `-n` kommt kein zweites `-n`, mit `--resume`, `--continue` oder `--session-id` keine neue Kennung, mit eigenem `--settings` kein zweites (dann laufen keine THub-Hooks).
4. **meldet** die Prozess-ID von Claude und am Ende Kennung und Exit-Code, auch nach `Ctrl+C`.

Ist THub nicht erreichbar, startet `claude` unverändert. In cmd fragt `Ctrl+C` nicht „Batchvorgang abbrechen?“, weil das Makro `powershell.exe` direkt aufruft.

**`~/.claude/settings.json` bleibt unberührt.** Die Hooks stehen in einer eigenen Datei `claude-hooks.json` im Datenordner von THub, die THub bei jedem Start neu schreibt und die der Starter mit `--settings` mitgibt. Claude führt sie zusätzlich zu deinen eigenen Hooks aus, und nur in Sessions, die in einem THub-Tab gestartet wurden. Sessions ausserhalb von THub merken davon nichts.

Hilfen zur Fehlersuche: `THUB_STARTER_DEBUG=1` zeigt die gebaute Befehlszeile, `THUB_STARTER_DRYRUN=1` nur die Einordnung des Aufrufs, ohne etwas zu starten.

### Status erkennen

Die Hooks melden THub, was Claude tut; THub hört nur zu. Daraus folgt der Status am Tab:

- **arbeitet:** `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`. Ausserdem Enter oder eine Ziffer (die Antwort) in einem wartenden Tab, weil Claude nach einer Bestätigung bis `PostToolUse` nichts meldet.
- **wartet auf dich:** `PermissionRequest`, sofort, auch bei Rückfragen. Die verspätete `Notification` (`permission_prompt`, `elicitation_dialog`) zählt nur, wenn der Tab noch arbeitet und seit `PreToolUse` weder `PermissionRequest` noch `PostToolUse` kam.
- **ruht:** `Stop` oder `StopFailure`; war der Tab dabei nicht sichtbar, wird er grün. Esc in einem arbeitenden oder wartenden Tab setzt ihn nach etwa 1,5 Sekunden ohne weiteres Hook-Ereignis auf „ruht“, ohne grün: Nach einer Unterbrechung meldet Claude nichts. Kommt nach einer Antwort etwa 3 Sekunden lang weder ein Hook-Ereignis (ausser `Notification`) noch ein neuer Prozess unter Claude, ruht Claude ebenfalls, ohne grün (so endet eine Ablehnung mit „No“); ein bestätigter langer Befehl bleibt violett, weil sein Prozess läuft.
- Pfeil- und andere Navigationstasten in einer Rückfrage ändern nichts, ebenso Antworten des Terminals (Fokus-Meldungen, Maus, Cursor-Position, Farben).
- **Prozesse laufen:** Etwa alle 1,5 Sekunden fragt THub für alle Tabs zusammen einmal die Prozessliste von Windows ab (siehe [Prozess-Sonde](entwicklung.md#prozess-sonde)). In einem normalen Tab zählt jeder Nachfahre der Shell, sobald er in zwei Abfragen nacheinander vorkommt (kurzlebige Prompt-Helfer wie das `git.exe` von posh-git zählen so nicht); `conhost.exe` und `OpenConsole.exe` nie. Bei Git Bash zählen auch verwaiste MSYS-Programme (`sleep`, `ssh`, `vim`, `less`) mit dem Konsolen-Host des Tabs. In einem Claude-Tab zählen nur Nachfahren von Claude, die nach dem letzten Prompt gestartet sind, und nur, solange Claude ruht: Ein MCP-Server zählt nicht, ein während der Antwort gestarteter Dev-Server schon.
- Ohne Hooks (siehe unten) gibt es keinen Claude-Status; das Fortsetzen funktioniert trotzdem.

### Fortsetzen nach einem Neustart

- **Fortgesetzt** wird ein Claude-Tab mit Session-Kennung, in dem ein Prompt geschrieben wurde oder dessen Session nie per Hook bestätigt wurde. Das Zweite ist das Sicherheitsnetz, wenn Hooks gesperrt sind: Die Kennung hat THub beim Start selbst vergeben.
- **Nur der zuletzt aktive Tab startet sofort.** Die übrigen fortzusetzenden Claude-Tabs sind pausiert (graues Pause-Symbol): Sie haben weder Prozess noch Ansicht, bis sie angezeigt werden, auf welchem Weg auch immer. Ein pausierter Tab bleibt über weitere Neustarts pausiert. Ist der zuletzt aktive Tab ein normaler Tab, sind alle fortzusetzenden Claude-Tabs pausiert.
- Die Shell startet im **Ordner der Session** (fehlt er: Startordner, Standardordner, Benutzerordner), weil Claude nach `--resume` im aktuellen Ordner läuft, und führt einmal den Starter mit `--resume <Kennung>` aus. Claude läuft also in der Shell; nach dem Beenden bist du wieder dort. Claude-Tabs zeigen keinen alten Verlauf.
- **Nicht fortgesetzt** wird ein Claude-Tab ohne Kennung, mit einer bestätigten Session ohne Prompt oder mit einer Kennung, die nicht nur aus Buchstaben, Ziffern, `-` und `_` besteht: Er kommt als normales Terminal im Ordner der Session zurück, ohne Verlauf.
- **Schlägt das Fortsetzen fehl** (Claude endet mit einem Exit-Code ungleich 0, ohne sich vorher gemeldet zu haben, etwa bei einer unbekannten Kennung oder einem abgelehnten Vertrauensdialog), steht im Terminal „Claude-Session konnte nicht fortgesetzt werden“; der Tab bleibt als normales Terminal offen.
- **Läuft der Starter beim Fortsetzen nicht** (eine Gruppenrichtlinie ist erst nach dem Erfassen dazugekommen, `starter.ps1` fehlt oder die lokale Schnittstelle konnte nicht starten), ruft der Startbefehl `claude --resume <Kennung>` direkt auf, ohne Erfassung. Meldet der Starter nicht innerhalb von 30 Sekunden einen Start, wird der Tab ein normales Terminal: Die Session läuft darin ungestört weiter, und nach dem nächsten Neustart wird sie nicht wieder fortgesetzt. Kommt die Meldung später doch noch (sehr langsames Profil), ist der Tab wieder ein Claude-Tab. Die Frist beginnt erst mit dem Fortsetzen, bei einem pausierten Tab also erst beim Öffnen.
- **Beendest du Claude** (`/exit`, `Ctrl+C`), wird der Tab wieder ein normales Terminal im selben Ordner und kommt nach einem Neustart auch so zurück.
- **`/clear`, `/resume`, `/compact`:** THub übernimmt die neue Kennung aus `SessionStart`, nach einem Neustart kommt die richtige Session zurück.
- **Beendet THub sich selbst** (App beenden, Tab schliessen, Windows-Abmeldung), wird die Zuordnung eingefroren: Spätere Meldungen wie `SessionEnd` oder das Ende der Shell ändern sie nicht mehr. Sonst käme nach jedem Beenden jeder Claude-Tab als normales Terminal zurück.

### Offene Punkte erkennen

- **Anweisung an Claude:** Auf `SessionStart` antwortet THub bei eingeschalteter Einstellung mit `hookSpecificOutput.additionalContext`: Nur wenn Claude für den nächsten Schritt eine Entscheidung, Antwort oder Handlung von dir braucht, die es nicht selbst treffen oder erledigen kann, schreibt es sie am Ende der Antwort unter der Überschrift „Offene Punkte“ als kurze Aufzählung. Sonst lässt es den Abschnitt weg, und es füllt ihn nicht mit Angeboten, Vorschlägen oder einer Zusammenfassung. `SessionStart` kommt auch beim Fortsetzen, nach `/clear` und beim Kompaktieren, die Anweisung gilt also in jeder Session. Die Antwort ist JSON nur aus ASCII-Zeichen, damit sie über `curl.exe` unverändert ankommt.
- **Erkennung** am Ende einer Antwort (`Stop`, Feld `last_assistant_message`): eine Überschrift „Offene Punkte“, „Offene Fragen“, „Noch offen“ (auch „Noch offene Punkte/Fragen“), „Fragen an dich“, „Zu klären“, „Open points“ oder „Open questions“, als Markdown-Überschrift, fette Zeile oder Zeile mit Doppelpunkt; die Aufzählungspunkte darunter sind die offenen Punkte, Unterpunkte gehören zu ihrem Punkt. Nur dieser Abschnitt zählt: Eine Überschrift ohne Aufzählung darunter oder eine Frage am Ende der Antwort ergibt keinen Hinweis. Inhalt von Code-Blöcken zählt nie. Höchstens 20 Punkte zu je höchstens 300 Zeichen.

### Ohne Claude Code

THub funktioniert als normales Terminal-Fenster, ohne Fehlermeldung beim Start. `claude` in einem Tab meldet „claude wurde nicht gefunden“ (Exit-Code 1). Lokale Schnittstelle und Hook-Datei gibt es trotzdem; sie stören nicht.

### Execution Policy und Gruppenrichtlinien

- Die PowerShell-Integration kommt per `-EncodedCommand`, nicht als Skriptdatei, und der Starter läuft mit `-ExecutionPolicy Bypass`. Eine lokal gesetzte Execution Policy blockiert also weder das eine noch das andere.
- Eine **Gruppenrichtlinie** (Ebene `MachinePolicy` oder `UserPolicy`) mit `AllSigned` oder `Restricted` würde den Starter trotz `Bypass` blockieren. THub prüft das beim Start versteckt (`Get-ExecutionPolicy -Scope MachinePolicy` und `UserPolicy`, parallel zum Start, ohne ihn zu verzögern). Steht dort eine solche Richtlinie, bekommen die Shells keinen Ersatz (`THUB_STARTER` fehlt): `claude` läuft direkt, ohne Fehler, aber ohne Erfassung, also ohne Status und ohne Fortsetzen. Ein Claude-Tab, der vor der Richtlinie erfasst wurde, wird nach dem Neustart noch einmal fortgesetzt und danach ein normales Terminal (siehe [Fortsetzen nach einem Neustart](#fortsetzen-nach-einem-neustart)).
- Solange die Prüfung läuft, nach 10 Sekunden ohne Antwort oder wenn PowerShell mit einem Fehler endet, bekommen die Shells den Ersatz. Lässt sich `powershell.exe` gar nicht starten, fehlt er, weil der Starter selbst ein `powershell.exe` ist.
- Scheitert die Integration selbst (Gruppenrichtlinie, Constrained Language Mode), startet die Shell trotzdem, nur ohne Integration. Im Constrained Language Mode richtet die PowerShell-Integration den Ersatz nicht ein.

### Hooks gesperrt, Proxy

- Ist `"disableAllHooks": true` gesetzt oder gibst du ein eigenes `--settings` an, laufen keine THub-Hooks: Der Status fehlt, das Fortsetzen funktioniert über das Sicherheitsnetz trotzdem. Ob von Administratoren verwaltete Einstellungen mit `allowManagedHooksOnly` auch Hooks aus `--settings` sperren, ist nicht dokumentiert; das Sicherheitsnetz deckt das Fortsetzen ab.
- `NO_PROXY` wird in jedem Terminal um `127.0.0.1,localhost` ergänzt, damit Claudes HTTP-Hooks nicht über einen Firmen-Proxy laufen; Starter und `curl.exe` fragen THub ohnehin ohne Proxy.

## Bekannte Grenzen und bewusst weggelassen

Ausführlich in der Spezifikation unter [„Shell-Integration“ → „Bekannte Grenzen“](specs/termhub-v2.md#shell-integration), [„Claude-Status“](specs/termhub-v2.md#claude-status-zustandsautomat-pro-tab) und [„Ausserhalb des Umfangs“](specs/termhub-v2.md#ausserhalb-des-umfangs).

**Bekannte Grenzen**

- In cmd wird `claude` nur am Anfang einer getippten Zeile erfasst, nicht in `cd x && claude`.
- Claude über den vollen Pfad oder per `npx` wird nicht erfasst.
- Claude in WSL wird nicht erfasst; WSL-Tabs sind normale Terminals und zeigen nie „Prozesse laufen“.
- Laufende Programme ausser Claude kommen nach einem Neustart nicht zurück, nur die Shell im zuletzt aktiven Ordner.
- Der frühere Inhalt steht nach einem Neustart im Scrollback, nicht direkt über dem neuen Prompt: ConPTY gehört der sichtbare Bereich, die Shell beginnt oben links. Der Versuch mit `conptyInheritCursor` wurde verworfen (Ticket 21, `docs/spikes/verlauf-sichtbar.md`).
- **PowerShell: Pfeiltaste nach oben braucht rund 1 Sekunde, in jedem Fenster.** Dann hält eine andere PowerShell-Sitzung den Verlaufs-Mutex von PSReadLine fest, meist eine Windows PowerShell 5.1 in einem anderen Terminal, etwa dem einer IDE. Ihr PSReadLine 2.0 gibt ihn nicht mehr frei, wenn ein anderer Prozess ihn verlassen hat. Solange er gehalten wird, wartet jede Taste im Verlauf bis zum Zeitlimit von 1 s, und keine Sitzung schreibt neue Befehle in den Verlauf. THub kann daran nichts ändern; dasselbe passiert ausserhalb von THub. Prüfen in einer beliebigen PowerShell (öffnet die Verlaufsdatei nicht, zeigt `frei` oder `belegt`):

  ```powershell
  $p = (Get-PSReadLineOption).HistorySavePath.ToLower(); $h = [uint64]2166136261
  foreach ($c in [int[]]$p.ToCharArray()) { foreach ($b in ($c -band 255), ($c -shr 8)) { $h = (($h -bxor $b) * 16777619) % 4294967296 } }
  $m = $null
  if (-not [Threading.Mutex]::TryOpenExisting("PSReadLineHistoryFile_$h", [ref]$m)) { 'frei' }
  else { try { $frei = $m.WaitOne(0) } catch [Threading.AbandonedMutexException] { $frei = $true }; if ($frei) { $m.ReleaseMutex(); 'frei' } else { 'belegt' } }
  ```

  Bleibt es bei `belegt`: die übrigen PowerShell-Sitzungen nacheinander schliessen, zuerst Windows PowerShell 5.1 (auch in IDEs oder einem Windows-PowerShell-Tab in THub). Sobald die haltende zu ist, sind die Pfeiltasten überall wieder flüssig. Vorbeugend PSReadLine in Windows PowerShell aktualisieren (`Install-Module PSReadLine -Scope CurrentUser -Force`) oder dort PowerShell 7 verwenden. Hintergrund in der Spezifikation unter „Präzisierungen aus der Umsetzung (Ticket 24, zweite Runde)“.
- Aus der Shell oder von Claude geöffnete GUI-Programme halten den Tab blau, solange sie offen sind; ein Prompt, der länger als 1,5 Sekunden rechnet, kann kurz blau aufblitzen. Vollständig abgekoppelte Prozesse lassen sich keinem Tab zuordnen.
- Eigenheiten des Ersatzes: `claude --% …` (Stop-Parsing in PowerShell) wirkt anders als direkt; ein Argument, das nur aus `-` besteht oder mit `-:` beginnt, lässt `powershell.exe -File` abbrechen; Zeilenumbrüche in Argumenten erreichen `claude.cmd` nicht; in Git Bash wandelt MSYS Prompts um, die mit `/` beginnen (wie bei einem direkten Aufruf); ein Pfad zum Starter mit `$` funktioniert in cmd nicht; im Constrained Language Mode scheitert der Starter. Jeder Start über den Ersatz kostet rund 0,5 Sekunden.

**Bewusst nicht dabei**

- ein Knopf oder Befehl zum Starten von Claude, zusätzliche Claude-Startoptionen oder Claude-Profile;
- eigene Startbefehle pro Tab (etwa `npm run dev` nach einem Neustart);
- geteilte Ansicht und mehrere Fenster, Abgleich von Tabs zwischen Rechnern;
- ein globaler Hook in `~/.claude/settings.json`;
- Windows-Benachrichtigungen und Blinken in der Taskleiste;
- weitere Einstellungen wie die Terminal-Schriftart, eine Akzentfarbe;
- Auto-Update, Autostart und Code-Signing;
- beim Wachhalten: simulierte Eingaben gegen Sperre oder „Abwesend“-Status, eine Zeitbegrenzung („für 2 Stunden“) und ein automatisches Wachhalten nur, solange Claude arbeitet;
- automatisierte Tests der Oberfläche.
