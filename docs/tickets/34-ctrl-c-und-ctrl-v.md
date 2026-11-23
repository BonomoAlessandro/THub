# 34 – Kopieren mit Ctrl+C, Einfügen mit Ctrl+V

Status: `offen` · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-23: Text mit `Ctrl+V` in die Terminals von THub einfügen, vor allem in Claude, und mit `Ctrl+C` kopieren, wenn etwas markiert ist, wie im Windows Terminal. Heute kopieren und fügen nur `Ctrl+Shift+C` / `Ctrl+Shift+V` und der Rechtsklick ein. `Ctrl+C` und `Ctrl+V` gehen als Steuerzeichen `^C` / `^V` ans Programm. In Claude passiert bei `Ctrl+V` nichts, und `Ctrl+C` bricht ab, auch wenn in THub etwas markiert ist.
Spezifikation: User Story 73 (geändert), „Oberfläche (Renderer)“ → Tastenkürzel und „Kopieren mit Ctrl+C, Einfügen mit Ctrl+V“ (neu)

## Ausgangslage

- **Claude Code** (2.1.330, nur lesend durchsucht):
  - Unter Windows hat Claude `Ctrl+V` nicht belegt. Bilder fügt es dort mit `Alt+V` ein (`chat:imagePaste`, `ctrl+v` nur unter WSL). Claude verlässt sich darauf, dass das Terminal `Ctrl+V` selbst abfängt und den Text einfügt, wie Windows Terminal und VS Code.
  - Claude schaltet Bracketed Paste ein (Modus 2004) und erkennt eingefügten Text an den Marken `ESC[200~` … `ESC[201~`.
  - Im Vollbild markiert Claude selbst, wenn man mit der Maus zieht, und kopiert dabei schon („Copy on select“, standardmässig an). Bei einer eigenen Markierung kopiert Claude auch mit `Ctrl+C` und bricht nicht ab. Ohne eigene Markierung bricht `Ctrl+C` ab bzw. leert die Eingabe.
- **PowerShell und Windows PowerShell:** PSReadLine belegt `Ctrl+V` im Windows-Modus mit „Paste“ und liest die Zwischenablage selbst. Mehrzeiliger Text landet dabei als Ganzes in der Eingabe und läuft erst mit Enter. PowerShell schaltet Bracketed Paste nicht ein (Aufnahmen in `spikes/verlauf-sichtbar/ergebnisse/`). Fügt THub dort ein, kommt jeder Zeilenumbruch als Enter an, und PowerShell führt die Zeilen einzeln aus. So ist es heute schon mit Rechtsklick und `Ctrl+Shift+V`.
- **Git Bash** schaltet Bracketed Paste ein, `^V` heisst dort „nächstes Zeichen wörtlich“. **cmd** fügt mit `^V` nichts ein.

## Was gebaut wird

### Ctrl+C

- **Regel wie im Windows Terminal:** Hat THub im aktiven Terminal etwas markiert (`term.hasSelection()`), kopiert `Ctrl+C` die Markierung und hebt sie auf. Die Taste geht dann nicht ans Programm. Ohne Markierung von THub geht `Ctrl+C` wie heute ans Programm (Abbrechen).
- Das gilt auch, wenn das Programm die Mausmeldung eingeschaltet hat (Claude im Vollbild). Eine Markierung von THub entsteht dort nur mit `Shift` + Ziehen und ist damit ausdrücklich gewollt. Markiert Claude selbst, hat THub keine Markierung, `Ctrl+C` geht an Claude, und Claude kopiert wie bisher. Anders als beim Rechtsklick (Ticket 25): Der ist ein Mausereignis und gehört bei eingeschalteter Mausmeldung dem Programm, `Ctrl+C` ist eine Taste.
- Nach dem Kopieren ist die Markierung weg. Das nächste `Ctrl+C` bricht also ab.

### Ctrl+V

- **Regel:** `Ctrl+V` fügt ein wie `Ctrl+Shift+V` (mit Bracketed Paste, wenn das Programm es verlangt), in jedem Tab, mit einer Ausnahme: In einem Tab mit PowerShell oder Windows PowerShell (Shell-Kennung `pwsh` oder `powershell`) geht `Ctrl+V` wie heute ans Programm, solange dieses keinen Bracketed Paste verlangt (`term.modes.bracketedPasteMode` aus). Dort fügt PSReadLine selbst ein. Läuft in diesem Tab Claude, verlangt es Bracketed Paste, und THub fügt ein.

### Übersicht

| Wo | `Ctrl+C` heute → nachher | `Ctrl+V` heute → nachher |
|---|---|---|
| Claude im Vollbild, Claude hat markiert | Claude kopiert → unverändert | nichts → THub fügt ein |
| Claude, THub hat markiert | Abbruch → THub kopiert | nichts → THub fügt ein |
| PowerShell an der Eingabe | Abbruch → mit Markierung kopiert THub | PSReadLine fügt ein → unverändert |
| cmd | Abbruch → mit Markierung kopiert THub | nichts → THub fügt ein |
| Git Bash | Abbruch → mit Markierung kopiert THub | nächstes Zeichen wörtlich → THub fügt ein |
| Ohne Markierung von THub, überall | Abbruch → unverändert | wie oben |

### Für beide

- **Tabelle der Kürzel:** „Kopieren“ bekommt `Ctrl+C`, „Einfügen“ `Ctrl+V` als weiteren Auslöser, nach der Tastenposition (`KeyC`, `KeyV`) wie `Ctrl+Shift+C` / `Ctrl+Shift+V`. AltGr (Ctrl+Alt) bleibt ausgenommen wie bei allen Kürzeln. Die Übersicht der Tastenkürzel zeigt beide Tasten, bei `Ctrl+C` mit dem Zusatz, dass es nur mit Markierung kopiert. Der Kommentar oben in `shortcuts.ts` und die Tests „lässt Ctrl+C / Ctrl+V ans Terminal durch“ werden angepasst.
- **Beim Tastendruck entscheiden:** Die Oberfläche entscheidet beim Tastendruck sofort, ob THub handelt oder die Taste durchlässt. Im zweiten Fall fängt sie die Taste gar nicht erst ab, damit `^C` bzw. `^V` ohne Verzögerung und in der richtigen Reihenfolge vor den nächsten Tasten ankommt. Die Entscheidung ist eine reine Funktion ohne DOM: aus der Taste, ob THub etwas markiert hat, der Shell-Kennung des Tabs und `bracketedPasteMode` folgt „THub kopiert“, „THub fügt ein“ oder „geht ans Programm“.
- **Was bleibt:** `Ctrl+Shift+C` / `Ctrl+Shift+V` und der Rechtsklick wie bisher, auch in PowerShell. In Eingabefeldern (Tab umbenennen, Befehlspalette, Dialoge) gehören `Ctrl+C` und `Ctrl+V` weiter dem Feld. `Alt+V` geht wie bisher an Claude (Bild einfügen). `Ctrl+K` bleibt unberührt.
- **Doku:**
  - Handbuch „Kopieren und Einfügen“ (heute „`Ctrl+C` geht an die Shell“) und die Tabelle der Tastenkürzel.
  - In der Spezifikation die Präzisierungen aus der Umsetzung.

## Akzeptanzkriterien

- [ ] Tests der Tabelle: `Ctrl+C` → Kopieren, `Ctrl+V` → Einfügen; `Ctrl+Alt+C` / `Ctrl+Alt+V` (AltGr) und mit zusätzlichem Shift und Alt gehen ans Terminal; `Ctrl+Shift+C` / `Ctrl+Shift+V` bleiben.
- [ ] Tests der reinen Funktion:
  - `Ctrl+C` mit Markierung von THub → THub kopiert, auch bei eingeschalteter Mausmeldung; ohne Markierung → ans Programm;
  - `Ctrl+V` in cmd und Git Bash → THub fügt ein; in `pwsh` und `powershell` ohne Bracketed Paste → ans Programm, mit Bracketed Paste → THub fügt ein; unbekannte Shell-Kennung → THub fügt ein.
- [ ] In der App im Testmodus über CDP auf der eigenen Seite, mit der eigenen Zwischenablage des Testmodus:
  - in einem cmd-Tab Text markieren (über xterm.js), `Ctrl+C` → der Text steht in der Zwischenablage, die Markierung ist weg, ans Terminal-Backend geht kein `^C`; ein zweites `Ctrl+C` → `^C` geht ans Backend;
  - in einem cmd-Tab: nach `Ctrl+V` steht der Text in der Eingabe;
  - in einem Tab, dessen Programm Bracketed Paste eingeschaltet hat: der Text kommt zwischen `ESC[200~` und `ESC[201~` an;
  - in einem PowerShell-Tab: THub schickt bei `Ctrl+V` `^V` ans Terminal-Backend und fügt nichts selbst ein. Geprüft an dem, was ans Backend geht. PSReadLine liest die echte Zwischenablage des Nutzers, also dort nicht wirklich einfügen lassen; Starts mit umgeleitetem `APPDATA` und `USERPROFILE` wie in den Spielregeln.
- [ ] Die bisherigen Prüfungen von Kopieren und Einfügen (Tickets 16 und 25) laufen weiter.
- [ ] Handbuch und Spezifikation beschreiben das Verhalten.
- [ ] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] In Claude: Text kopieren, `Ctrl+V` → der Text steht genau einmal im Eingabefeld. Mehrzeiliger Text wird nicht abgeschickt.
- [ ] Dasselbe mit Claude im Vollbild.
- [ ] Claude im Vollbild: Mit der Maus markieren und `Ctrl+C` kopiert wie bisher. Mit `Shift` + Ziehen markieren und `Ctrl+C` kopiert, Claude bricht nichts ab. Ohne Markierung bricht `Ctrl+C` ab wie bisher.
- [ ] In PowerShell: Text markieren, `Ctrl+C` → in einem anderen Programm einfügen ergibt den Text, die Markierung ist weg. Ein laufendes `ping -t localhost` bricht `Ctrl+C` ohne Markierung ab.
- [ ] In PowerShell an der Eingabe: `Ctrl+V` fügt ein, mehrzeiliger Text läuft nicht Zeile für Zeile los.
- [ ] In cmd und Git Bash: `Ctrl+C` mit Markierung kopiert, `Ctrl+V` fügt ein.
- [ ] Beim Umbenennen eines Tabs und in der Befehlspalette kopieren und fügen `Ctrl+C` / `Ctrl+V` wie gewohnt.
- [ ] Ein Bildschirmfoto in der Zwischenablage: `Alt+V` in Claude fügt das Bild ein wie bisher.

## Hinweise

- **PSReadLine belegen:** Kommt `^V` von xterm.js über ConPTY bei PSReadLine als `Ctrl+V` an und fügt dort ein? Das ist zu belegen, ohne die echte Zwischenablage des Nutzers zu lesen, etwa aus den Tastenbelegungen von PSReadLine (`Get-PSReadLineKeyHandler` in einer PowerShell mit umgeleitetem Profil) und dem, was ConPTY aus `^V` macht. Lässt es sich so nicht belegen, kommt es in die Abnahme von Hand. Kommt `^V` dort nicht als Einfügen an, entfällt die Ausnahme, und THub fügt auch in PowerShell ein.
- **Grenzen:**
  - Eine vergessene Markierung schluckt das erste `Ctrl+C`: Es kopiert nur, erst das zweite bricht ab. Wie im Windows Terminal.
  - In einem PowerShell-Tab bekommt ein anderes Programm ohne Bracketed Paste (etwa ein älteres REPL) `^V` statt des Texts. Dort helfen `Ctrl+Shift+V` und der Rechtsklick.
  - Ausserhalb von PowerShell bekommen Programme, die `^V` selbst brauchen (Blockauswahl in vim, „wörtlich“ in bash), die Taste nicht mehr, wie im Windows Terminal.
