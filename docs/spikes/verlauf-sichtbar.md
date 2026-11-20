# Spike: Verlauf nach dem Neustart direkt sichtbar (Ticket 21)

> Stand: 2026-11-20 · Spezifikation: [termhub-v2.md](../specs/termhub-v2.md), „Wiederherstellen“ (normaler Tab) · Ticket: [21](../tickets/21-verlauf-direkt-sichtbar.md)

## Frage und Ergebnis

Heute steht der wiederhergestellte Verlauf eines normalen Tabs im Scrollback, weil ConPTY beim Start der Shell den sichtbaren Bereich leert. Der Spike sollte zeigen, ob die node-pty-Option `conptyInheritCursor` (Windows-Flag `PSEUDOCONSOLE_INHERIT_CURSOR`, wie VS Code sie für wiederhergestellte Terminals nutzt) den Verlauf **direkt über dem neuen Prompt** stehen lässt, und zwar auch nach dem Verkleinern und Vergrössern.

**Ergebnis: Es funktioniert nicht sauber. THub bleibt beim heutigen Verhalten** (Verlauf mit Leerzeilen in den Scrollback).

Kurz:

- **Start:** In allen vier Shells genau wie gewünscht. ConPTY fragt die Cursorposition ab (`ESC[6n`), xterm.js antwortet, Verlauf und Trennlinie bleiben stehen, der Prompt erscheint direkt darunter. Bei langem Verlauf liegt der Anfang im Scrollback, das Ende ist sichtbar.
- **Verkleinern und Vergrössern:** In **allen vier Shells kaputt**, je nach Shell und Verlauf in anderer Form: Die Trennlinie wird überschrieben oder gelöscht, Zeilen der Shell erscheinen doppelt oder verschwinden, der Prompt wird verstümmelt, eine Befehlszeile geht verloren.
- **Ursache:** ConPTY zeichnet beim Ändern der Grösse seinen eigenen Bereich mit **festen Zeilennummern** neu, beginnend bei der Zeile, an der es gestartet ist. xterm.js bricht den Verlauf darüber bei einer anderen Breite neu um (Reflow), dadurch verschiebt sich alles darunter. ConPTY weiss davon nichts und schreibt an die alte Stelle.
- **Ohne Reflow in xterm.js** wird es besser, aber nicht gut: PowerShell überschreibt die Trennlinie trotzdem, und in cmd und Git Bash gehen Befehlszeilen verloren. Ausserdem würden lange Zeilen in allen Tabs beim Verkleinern abgeschnitten statt umgebrochen.
- **Ausbleibende Antwort auf die Cursor-Abfrage:** Die Shell startet **gar nicht** (nach 60 Sekunden noch kein Prompt, in allen vier Shells). ConPTY hat auf diesem Windows kein eigenes Zeitlimit. Eine verspätete Antwort verzögert den Start um die Verspätung.
- **Heutiges Verhalten:** Verlauf und Trennlinie bleiben in allen vier Shells und in allen Schritten heil.

## Dateien

| Pfad | Inhalt |
|---|---|
| `spikes/verlauf-sichtbar/versuch.mts` | Versuchsaufbau: echte Shell über node-pty, xterm.js als Terminal-Abbild, Szenarien und Auswertung |
| `spikes/verlauf-sichtbar/package.json` | nur `"type": "module"`; node-pty und xterm.js kommen aus dem Wurzelordner |
| `spikes/verlauf-sichtbar/ergebnisse/<shell>.txt` | pro Shell: Zusammenfassung, Bildschirm nach jedem Schritt, rohe Ausgabe von ConPTY (Benutzer- und Rechnername ersetzt) |

`src/` bleibt unverändert bis auf einen Verweis auf dieses Dokument im Kommentar von `restoredHistory`.

## Versuchsaufbau

- **Umgebung:** Windows 11 (`10.0.26200.9911`), ConPTY des Systems (nicht das mit node-pty gelieferte `conpty.dll`), node-pty 1.1.0, xterm.js 6.0.0.
- **Terminal-Abbild:** dasselbe Paket `@xterm/xterm` wie im Renderer, in Node ohne Bildschirm, mit denselben Optionen wie `TerminalView` (`windowsPty: { backend: 'conpty' }`, Scrollback 5000). Es beantwortet die Cursor-Abfrage über `onData`, so wie der Renderer über den normalen Eingabeweg. `@xterm/headless` war deshalb nicht nötig, und es kam keine neue Abhängigkeit dazu.
- **Ablauf wie in THub:** zuerst den Verlauf ins Terminal schreiben, dann die Shell in derselben Grösse starten. Beim Ändern der Grösse zuerst xterm.js (wie `fit`), dann die Shell (wie `onResize` → `resizeTab`).
- **Shells**, ohne die Profile des Nutzers und ohne Einträge in einen Verlauf:
  - PowerShell 7 und Windows PowerShell: `-NoLogo -NoProfile -NoExit -Command "Set-PSReadLineOption -HistorySaveStyle SaveNothing"`;
  - cmd: ohne Argumente;
  - Git Bash (`C:\Program Files\Git\bin\bash.exe --login -i`): eigenes `HOME` mit `HISTFILE=/dev/null`, sonst die normale Konfiguration von Git for Windows (Prompt mit führender Leerzeile).
- **Verlauf:**
  - kurz: 7 Zeilen, darunter eine farbige und zwei lange mit 82 und 110 Zeichen, die bei 60 bzw. schon bei 100 Spalten umbrechen;
  - lang: 80 Zeilen, also mehr als sichtbar.
  - Ausgegraut und mit Trennlinie über `dimmed` und `separator` aus `src/renderer/terminal/history.ts`. Heutiges Verhalten über `restoredHistory` (mit Leerzeilen), neues ohne Leerzeilen, der Cursor steht am Anfang der Zeile unter der Trennlinie.
- **Schritte:** Start bei 100×24; danach 60×24, 100×24, 100×12, 100×24, 140×40, 50×10, 100×24, 70×30, 100×24; dann `echo hallo-nach-resize`; dann 60×12 und zurück auf 100×24. Nach jedem Schritt wird gewartet, bis die Shell ruhig ist, und der ganze Puffer geprüft:
  - steht jede Verlaufszeile genau einmal und in der richtigen Reihenfolge vor der Trennlinie;
  - gibt es genau eine Trennlinie, ist sie sichtbar, wie viele Zeilen liegen zwischen ihr und dem Cursor;
  - ist der Verlauf ausgegraut;
  - stehen Befehlszeile und Ausgabe nach dem Befehl genau einmal da.
- **Szenarien pro Shell:** heute (kurz), `conptyInheritCursor` (kurz, lang), `conptyInheritCursor` ohne Reflow (kurz, lang), Antwort 1,5 s zu spät, Antwort bleibt aus, Gegenprobe „Shell gibt den Verlauf selbst aus“.

## Ergebnisse

### Start

| Shell | Cursor-Abfrage nach | Antwort (kurz / lang) | Prompt nach | Bild |
|---|---|---|---|---|
| PowerShell 7 | 0,2–0,45 s | `ESC[10;1R` / `ESC[24;1R` | 0,7–1,5 s | Prompt direkt unter der Trennlinie |
| Windows PowerShell | 0,1 s | wie oben | 0,4–0,5 s | Prompt direkt unter der Trennlinie |
| cmd | 0,1–0,2 s | wie oben | 0,15–0,3 s | Kopfzeilen von cmd und Prompt direkt unter der Trennlinie |
| Git Bash | 0,1–0,15 s | wie oben | 1,2–2,3 s | Leerzeile (aus dem Prompt von Git for Windows), dann Prompt |

Die Zeiten stammen aus Läufen mit zwei Shells gleichzeitig. Je einmal kamen Ausreisser vor (Cursor-Abfrage bei cmd erst nach 3,3 s, Prompt bei Windows PowerShell erst nach 12,5 s); sie hängen an der Last, nicht an der Antwort, die jeweils nach wenigen Millisekunden kam. In allen Fällen war der Verlauf ausgegraut und vollständig, beim langen Verlauf mit dem Ende im sichtbaren Bereich.

Die ersten Ausgaben von ConPTY mit `conptyInheritCursor` (cmd, Zeiten ab dem Start):

```
+76ms  ESC[6n                                   ← Cursor-Abfrage
+92ms  ESC[?9001h ESC[?1004h                    ← nach der Antwort ESC[10;1R
       ESC[m ESC]0;C:\WINDOWS\System32\cmd.exe BEL ESC[?25h
       ESC[?25l Microsoft Windows [Version …] \r\n (c) Microsoft Corporation … ESC[13;1H C:\…>
```

Ohne die Option beginnt ConPTY mit `ESC[2J ESC[H` (sichtbaren Bereich leeren, Cursor nach oben links).

### Verkleinern und Vergrössern

Mit `conptyInheritCursor` und Reflow, also so, wie es in THub laufen würde:

| Shell | kurzer Verlauf | langer Verlauf |
|---|---|---|
| PowerShell 7 | Verlauf und Trennlinie bleiben, aber der Bereich der Shell geht kaputt: Prompt doppelt bzw. abgeschnitten (50×10), getippter Befehl hinter einem Rest des alten Prompts, nach 60×12 und zurück fehlt die Befehlszeile | nach 60×24 → 100×24 springt der Prompt auf die Zeile der Trennlinie und überschreibt sie; ab 100×12 ist die Trennlinie weg; nach dem Befehl fehlt auch die letzte Verlaufszeile |
| Windows PowerShell | wie PowerShell 7: Verlauf bleibt, nach 60×12 und zurück fehlen Befehlszeile und Ausgabe | wie PowerShell 7: Trennlinie überschrieben, dann weg |
| cmd | schon beim ersten Verkleinern (60×24) überschreiben die Kopfzeilen von cmd die Trennlinie; beim Vergrössern steht die erste Kopfzeile doppelt da; nach 60×12 und zurück fehlt die Befehlszeile | Verlauf und Trennlinie bleiben, dafür verschluckt ConPTY Zeilen der Shell: nach 60×24 fehlt die erste Kopfzeile von cmd, nach 50×10 → 100×24 auch die zweite; nach 60×12 und zurück fehlt die Befehlszeile |
| Git Bash | schon beim ersten Verkleinern löscht ConPTY die Trennlinie (es zeichnet dort die Leerzeile seines Prompts), sie kommt nicht wieder; nach mehreren Schritten fehlt auch die erste Zeile des Prompts, und vom danach getippten `echo` kam das erste Zeichen nicht an (`bash: cho: command not found`) | Verlauf und Trennlinie bleiben; nach 60×12 und zurück fehlt die Ausgabe des Befehls |

Heutiges Verhalten (Leerzeilen, ohne die Option) in denselben Schritten: In allen vier Shells blieben Verlauf und Trennlinie in jedem Schritt vollständig und genau einmal erhalten, Befehlszeile und Ausgabe ebenso. Einzige Auffälligkeit: Windows PowerShell gab in einem Lauf nach dem Schritt 70×30 nichts mehr aus, und der getippte Befehl kam nicht an. Das hat mit dem Verlauf nichts zu tun (siehe [Nebenbefunde](#nebenbefunde)).

### Was ConPTY beim Ändern der Grösse schickt

Ohne die Option gehört ConPTY der ganze sichtbare Bereich. Beim Ändern der Grösse zeichnet es ihn ab der ersten Zeile neu (`ESC[H`, dann jede Zeile mit `ESC[K`). xterm.js bricht seinen Teil genauso um wie ConPTY, deshalb passt beides zusammen. Der Verlauf liegt im Scrollback und blieb in allen Schritten unberührt.

Mit der Option beginnt der Bereich von ConPTY erst bei der Zeile unter der Trennlinie. Beim Ändern der Grösse zeichnet es ab dieser **festen** Zeile neu, etwa bei cmd mit kurzem Verlauf nach 100×24 → 60×24:

```
ESC[8;24;60t ESC[10;1H Microsoft Windows [Version …] ESC[K \r\n (c) Microsoft Corporation … ESC[K \r\n ESC[K \r\n C:\…> ESC[K …
```

xterm.js hat den Verlauf darüber für 60 Spalten neu umgebrochen. Er ist eine Zeile länger geworden, die Trennlinie ist von Zeile 8 nach Zeile 9 gerutscht (von 0 gezählt, wie in den Ergebnisdateien). Genau dort beginnt ConPTY mit `ESC[10;1H` (von 1 gezählt) und schreibt die erste Kopfzeile hin:

```
nach dem Start (100×24)                        nach 60×24
 4|PS C:\Projekte\demo> echo "eine lange …      4|PS C:\Projekte\demo> echo "eine lange Zeile, die bei 60 Spal
 5|hen sieht"                                    5|ten umbrechen muss, damit man das Umbrechen sieht"
 6|eine lange Zeile, … das Umbrechen sieht      6|eine lange Zeile, die bei 60 Spalten umbrechen muss, damit m
 7|PS C:\Projekte\demo>                          7|an das Umbrechen sieht
 8|──── Wiederhergestellt · Do., 19.11.… ────    8|PS C:\Projekte\demo>
 9|Microsoft Windows [Version 10.0.26200.9911]   9|Microsoft Windows [Version 10.0.26200.9911]   ← hier stand die Trennlinie
10|(c) Microsoft Corporation. …                 10|(c) Microsoft Corporation. Alle Rechte vorbehalten.
12|C:\…\thub-verlauf-sichtbar-qO1LnV>           12|C:\…\thub-verlauf-sichtbar-q
                                                13|O1LnV>
```

Beim Vergrössern ist es umgekehrt: Der Verlauf wird kürzer, die Zeilen der Shell rutschen nach oben, ConPTY zeichnet sie an der alten Stelle neu, und die nach oben gerutschte Kopie bleibt stehen (zurück bei 100×24 steht `Microsoft Windows …` in Zeile 8 und 9). Bricht die Shell selbst um (PowerShell mit langem Prompt in der letzten Zeile), schiebt ConPTY seinen Bereich und überschreibt beim Zurückbreiten die Zeile darüber, also die Trennlinie.

Das liegt im Zusammenspiel von ConPTY und einem Terminal mit eigenem Inhalt über dem Bereich von ConPTY, nicht an einer einzelnen Shell. Es lässt sich in THub nicht beheben, ohne ConPTY mitzuteilen, wie der Inhalt darüber umgebrochen wurde, und dafür gibt es keine Schnittstelle.

### Gegenprobe: Reflow in xterm.js ausgeschaltet

Mit `windowsPty: { backend: 'conpty', buildNumber: 19041 }` schaltet xterm.js das Umbrechen beim Ändern der Breite ab (wie für alte ConPTY-Versionen). Dann bleibt die Zeilenzahl des Verlaufs gleich:

- cmd und Git Bash: Verlauf und Trennlinie bleiben in allen Schritten, aber nach dem Befehl bzw. nach 60×12 und zurück fehlen Befehlszeile oder Ausgabe.
- PowerShell 7 und Windows PowerShell: nach dem Zurückbreiten überschreibt der Prompt die Trennlinie trotzdem (kurzer Verlauf ab 50×10 → 100×24, langer ab 60×24 → 100×24), später ist sie ganz weg. Hier bricht ConPTY den Prompt selbst um und schiebt seinen Bereich, unabhängig von xterm.js.
- Ohne Reflow werden lange Zeilen beim Verkleinern abgeschnitten statt umgebrochen. Das träfe jeden Tab, nicht nur wiederhergestellte.

Also auch so nicht sauber.

### Antwort auf die Cursor-Abfrage verspätet oder ausbleibend

| Shell | Antwort 1,5 s zu spät | Antwort bleibt aus |
|---|---|---|
| PowerShell 7 | Prompt 0,6–2,3 s nach der Antwort, Bild wie oben | nach 60 s kein Prompt |
| Windows PowerShell | Prompt 0,4 s nach der Antwort | nach 60 s kein Prompt |
| cmd | Prompt 30 ms nach der Antwort | nach 60 s kein Prompt |
| Git Bash | Prompt 2,1 s nach der Antwort | nach 60 s kein Prompt |

ConPTY wartet also ohne Zeitlimit. In THub kommt die Antwort von xterm.js im Renderer über den normalen Eingabeweg (`onData` → `writeToTab` → Terminal-Backend). Der Kern leitet Eingaben weiter, sobald der Tab als laufend gilt, und das ist er vor dem Startauftrag; die Antwort käme also an. Verloren ginge sie aber, wenn der Renderer zwischen Startauftrag und Antwort neu lädt. Eine Umsetzung hätte deshalb einen Schutz gebraucht, etwa: Das Terminal-Backend erkennt `ESC[6n` in der ersten Ausgabe und schickt nach einem Zeitlimit selbst eine Antwort mit der untersten Zeile (`ESC[<Zeilen>;1R`), damit die Shell wenigstens startet.

### Gegenprobe: Die Shell gibt den Verlauf selbst aus

Um zu sehen, ob es einen anderen Weg gibt, hat die Shell den ausgegrauten Verlauf samt Trennlinie beim Start selbst ausgegeben (ohne die Option, ohne Leerzeilen): PowerShell über `[Console]::Write` mit UTF-8, cmd über `chcp 65001` und `type`, Git Bash über `cat` in der Startdatei. Dann gehören die Zeilen ConPTY, und es zeichnet sie beim Ändern der Grösse selbst neu.

- Der Verlauf steht direkt über dem Prompt und bleibt ausgegraut (ConPTY gibt SGR 2 weiter). Bei cmd stehen die Kopfzeilen von cmd über dem Verlauf, weil cmd sie vor dem `/k`-Befehl ausgibt.
- Von 60×24 bis 140×40 bleibt alles heil, in allen vier Shells.
- Nach dem Verkleinern auf 50×10 (weniger Zeilen als Verlauf und Prompt) und dem Vergrössern fehlen die obersten Verlaufszeilen, in allen vier Shells. ConPTY hält nur so viele Zeilen, wie sichtbar sind, und überschreibt beim Neuzeichnen ab der ersten Zeile, was xterm.js wieder in den sichtbaren Bereich geholt hat.
- Dazu käme pro Shell eigener Code für die Ausgabe und die Kodierung (Codepage bzw. `OutputEncoding` umstellen und zurückstellen), und das im Start der Shell, den gerade Ticket 07 umbaut.

Diese Variante ist damit ebenfalls nicht sauber und wurde nicht weiterverfolgt.

## Entscheidung

**Beim heutigen Verhalten bleiben.** Der Verlauf wird wie bisher vor dem Start der Shell ausgegraut mit Trennlinie und so vielen Leerzeilen geschrieben, dass alles im Scrollback liegt; sichtbar wird er mit einmal Hochscrollen.

Gründe:

- Der Start sähe mit `conptyInheritCursor` zwar genau richtig aus. Aber schon ein einmaliges Verkleinern des Fensters, etwa beim Andocken oder beim Wechsel aus dem maximierten Zustand, beschädigt in jeder der vier Shells den Verlauf, die Trennlinie oder die Zeilen der Shell selbst. Die Abnahme „verkleinern, vergrössern, maximieren: der alte Inhalt bleibt lesbar und wird nicht überschrieben“ wäre nicht zu erfüllen.
- Die Ursache liegt in ConPTY und lässt sich in THub nicht beheben. Reflow abschalten hilft nur teilweise und verschlechtert alle Tabs.
- Eine ausbleibende Antwort lässt die Shell ohne Zeitlimit hängen. Das liesse sich abfangen, ändert aber nichts am ersten Punkt.

Die Spezifikation („Wiederherstellen“) nennt den verworfenen Versuch mit Verweis auf dieses Dokument. Startauftrag, Terminal-Backend, Kern und Renderer bleiben unverändert; einen Test mit echter Shell gibt es deshalb nicht.

## Falls es später nochmals versucht wird

- Mit `node versuch.mts` lässt sich der Versuch auf einer neueren Windows-Version wiederholen. Ändert ConPTY sein Neuzeichnen beim Ändern der Grösse (relativ statt mit festen Zeilen, oder nur noch die Zeilen der Shell), könnte sich das Bild ändern.
- Für die Gegenprobe „Shell gibt den Verlauf selbst aus“ wäre zu klären, ob dasselbe Verschwinden beim starken Verkleinern auch gewöhnliche Shell-Ausgabe trifft. Dann wäre der Verlauf nicht schlechter dran als jede andere Ausgabe, und die Variante könnte mit der Shell-Integration aus Ticket 07 neu bewertet werden.

## Nachstellen

```
cd spikes/verlauf-sichtbar
node versuch.mts                              # alle vier Shells, alle Szenarien (pro Shell etwa 4 Minuten)
node versuch.mts cmd pwsh                     # nur diese Shells
node versuch.mts gitbash --szenario=neu-kurz  # ein Szenario: heute-kurz, neu-kurz, neu-lang, neu-kurz-ohne-reflow,
                                              # neu-lang-ohne-reflow, shell-gibt-aus, neu-dsr-spaet, neu-dsr-nie
```

Voraussetzung ist `npm ci` im Wurzelordner. Das Skript arbeitet in einem eigenen Temp-Ordner, lädt keine Profile des Nutzers, schreibt keinen Verlauf und räumt am Ende auf.

## Nebenbefunde

Nicht weiter untersucht, weil sie mit diesem Ticket nichts zu tun haben:

- **Windows PowerShell 5.1** gab in einem Lauf **ohne** `conptyInheritCursor` nach dem Schritt 70×30 nichts mehr aus, und ein danach getippter Befehl kam nicht an. In den anderen Läufen trat das nicht auf.
- **Konsolen-Hosts:** Im Versuchsaufbau blieben die `conhost.exe`-Prozesse aller Shells als Kinder des Node-Prozesses bestehen, bis dieser endete, auch bei Shells, die sich mit `exit` beendet hatten. Im JavaScript-Teil von node-pty 1.1.0 wird die Pseudokonsole nur in `kill` geschlossen, nicht beim normalen Ende der Shell. Ob im Terminal-Backend von THub pro beendeter Shell ein Konsolen-Host übrig bleibt, wäre separat zu prüfen.
