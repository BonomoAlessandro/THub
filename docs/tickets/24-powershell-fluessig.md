# 24 – PowerShell in THub: flüssige Pfeiltasten, keine Befehlsvorschau

Status: `in Arbeit` (2026-11-20, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: –
Herkunft: Abnahme von Hand (Ticket 19), „Verwendung von Tastaturpfeilen im Terminal“ und „Die Befehlspreview“ in [docs/abnahme.md](../abnahme.md)
Spezifikation: „Shell-Integration“, „Terminal-Backend“

> **Ergebnis (2026-11-20):** Ursache war die ConPTY von Windows: Sie schickt die neu gezeichnete Zeile erst mit ihrem nächsten Bild, rund 16 ms nach der Taste. THub startet die Shells jetzt über die mit node-pty gelieferte ConPTY (`OpenConsole.exe`, wie das Windows Terminal), die nach 1 bis 5 ms liefert. In der App kommt die Zeile im Renderer nach 3,2 statt 14,3 ms an und ist nach 11,5 statt 17,2 ms gezeichnet (Median). Kern, IPC und xterm.js waren nicht die Ursache. Die Befehlsvorschau schaltet die Integration nach dem Profil ab. Zahlen und Entscheidungen: Spezifikation, „Shell-Integration“ → „Präzisierungen aus der Umsetzung (Ticket 24)“.

## Was gebaut wird

- **Flüssiges Blättern im Befehlsverlauf.** In einem PowerShell-7-Tab fühlt sich das Blättern mit den Pfeiltasten durch frühere Befehle träge an, im Windows Terminal mit demselben Profil dagegen flüssig. Die Verzögerung entsteht also in THub. Ursache messen und beheben. Mögliche Stellen:
  - Eingabeweg: Renderer, IPC, Kern, node-pty;
  - Ausgabeweg: node-pty, Kern (Verlauf, Auswertung von OSC-Sequenzen, Status), IPC, `term.write`;
  - Rendering von xterm.js (DOM-Renderer, Scrollback);
  - die Shell-Integration (`integration.ps1`) und PSReadLine.
- **Keine Befehlsvorschau.** Die graue Vorschau beim Tippen (PSReadLine-Vorhersage, etwa nach `cd`) fällt in THub-Tabs mit PowerShell komplett weg, auch die Listenansicht. Die Integration setzt nach dem Laden des Nutzerprofils `PredictionSource` auf `None`, wenn PSReadLine geladen ist. Das Profil des Nutzers selbst bleibt unverändert; ausserhalb von THub ändert sich nichts.

## Akzeptanzkriterien

- [x] Die Ursache der Verzögerung ist gemessen und benannt (Zahlen vorher/nachher, etwa Zeit von der Taste bis zur gezeichneten Zeile), und die Behebung ist im Code begründet.
- [x] Ein automatischer Test sichert die Behebung ab, soweit sie sich messen lässt (etwa ein Shell-Test mit Zeitgrenze oder ein Kern-Test gegen quadratischen Aufwand pro Ausgabe).
- [x] Shell-Test: In einem PowerShell-Tab ist nach dem Start `(Get-PSReadLineOption).PredictionSource` gleich `None`, auch mit einem Profil, das die Vorhersage einschaltet.
- [x] Typecheck, `npm test`, `npm run test:shells` und der Build sind grün.

## Abnahme von Hand

- [ ] In einem PowerShell-7-Tab mit dem echten Profil durch den Verlauf blättern → so flüssig wie im Windows Terminal.
- [ ] `cd` tippen → keine graue Vorschau, keine Vorschlagsliste.

## Nachtrag aus der Nachprüfung (2026-11-20)

Nach der Installation mit der mitgelieferten ConPTY ist das Blättern beim Nutzer weiterhin träge. Geprüft: Die installierte THub läuft mit `OpenConsole.exe`, die Korrektur ist also aktiv. Die Umgebung des Nutzers unterscheidet sich von der Messung oben:
- PowerShell 7.7 (Store-Version) mit PSReadLine 2.4.5, **ohne Profil**;
- ein Befehlsverlauf mit gut **9000 Einträgen** (gemessen wurde mit leerem Verlauf);
- **mehrere Tabs**, oft mit einem arbeitenden Claude in einem anderen Tab, das laufend neu zeichnet;
- maximiertes Fenster.

Die Ursache ist unter diesen Bedingungen zu messen (Einzeldruck und gehaltene Taste mit Wiederholrate, Verzögerung bis zur gezeichneten Zeile, Nachlaufen nach dem Loslassen, lange Aufgaben in Haupt- und Renderer-Prozess) und zu beheben.

> **Ergebnis der zweiten Runde (2026-11-20):** Die Ursache lag ausserhalb von THub. Jede Pfeiltaste brauchte rund 1 Sekunde, in jedem PowerShell-Fenster, auch ausserhalb von THub und in Windows PowerShell 5.1; cmd war flüssig.
>
> - **Mechanismus:** Mit dem Standard `HistorySaveStyle SaveIncrementally` geht jede Taste, die im Verlauf blättert, über `SaveCurrentLine` → `MaybeReadHistoryFile` → `WaitOne(1000)` auf den benannten Mutex `PSReadLineHistoryFile_<Hash des Verlaufspfads>`. Diesen Mutex teilen alle PowerShell-Sitzungen mit derselben Verlaufsdatei. Das gilt in PSReadLine 2.0.0 wie in 2.4.5.
> - **Ursache:** Eine hängengebliebene Windows PowerShell 5.1 im Terminal von IntelliJ hielt den Mutex dauerhaft. PSReadLine 2.0.0 gibt einen verlassenen Mutex nicht wieder frei (behoben ab 2.2.0-beta4). Darum wartete jede Taste bis zum Zeitlimit von 1 s, und solange der Mutex gehalten war, kam kein neuer Befehl in die Verlaufsdatei. Nach dem Schliessen dieser Sitzung war alles wieder flüssig.
> - **Gegenprobe:** Mit freiem Mutex und 9000 synthetischen Einträgen braucht eine Pfeiltaste 3 bis 5 ms (cmd: 0,3 ms), weit unter einem Bild. Verlaufsgrösse, Duplikate und Dateizugriffe sind also nicht die Ursache. Nachgestellt: Hält eine Windows PowerShell 5.1 den Mutex, braucht eine PowerShell 7 auf derselben Datei 1007 bis 1016 ms pro Taste.
> - **THub:** ändert nichts, auch nicht an der Speicherung des Verlaufs.
>
> Prüfbefehl, Zahlen und verworfene Auswege: Spezifikation, „Shell-Integration“ → „Präzisierungen aus der Umsetzung (Ticket 24, zweite Runde)“; Hinweis für Nutzer im README unter „Bekannte Grenzen“.
