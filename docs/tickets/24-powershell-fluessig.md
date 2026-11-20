# 24 – PowerShell in THub: flüssige Pfeiltasten, keine Befehlsvorschau

Status: `in Arbeit` · Typ: AFK
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

- [ ] Die Ursache der Verzögerung ist gemessen und benannt (Zahlen vorher/nachher, etwa Zeit von der Taste bis zur gezeichneten Zeile), und die Behebung ist im Code begründet.
- [ ] Ein automatischer Test sichert die Behebung ab, soweit sie sich messen lässt (etwa ein Shell-Test mit Zeitgrenze oder ein Kern-Test gegen quadratischen Aufwand pro Ausgabe).
- [ ] Shell-Test: In einem PowerShell-Tab ist nach dem Start `(Get-PSReadLineOption).PredictionSource` gleich `None`, auch mit einem Profil, das die Vorhersage einschaltet.
- [ ] Typecheck, `npm test`, `npm run test:shells` und der Build sind grün.

## Abnahme von Hand

- [ ] In einem PowerShell-7-Tab mit dem echten Profil durch den Verlauf blättern → so flüssig wie im Windows Terminal.
- [ ] `cd` tippen → keine graue Vorschau, keine Vorschlagsliste.
