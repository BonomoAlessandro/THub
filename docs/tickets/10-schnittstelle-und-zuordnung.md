# 10 – Lokale Schnittstelle, Hook-Datei und Claude-Zuordnung

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 01, 09
User Stories: 31, 32, 36, 38 (Grundlage)
Spezifikation: „Hook-Empfänger und lokale Schnittstelle“, „Claude-Status: Zustandsautomat pro Tab“ (Claude-Zuordnung, Einfrieren), „Testentscheidungen → Teststelle 1“

## Was gebaut wird

Die Seite von TermHub, die Claude-Sessions erkennt. Der Starter in den Shells folgt in Ticket 11; hier wird alles über echte HTTP-Anfragen getestet.

- **Lokale Schnittstelle:** HTTP-Server nur auf `127.0.0.1`, zufälliger freier Port, pro App-Start ein zufälliges Token. Anfragen ohne gültiges Token → 403, unbekannte Tabs werden ignoriert.
  - Endpunkte: `POST /claude/launch`, `POST /claude/started`, `POST /claude/exit`, `POST /hooks/<Ereignis>`, mit Inhalt und Antworten wie in der Tabelle der Spezifikation.
  - Hook-Antworten sind immer sofort leer und enthalten nie Entscheidungsfelder.
- **Umgebung der Terminals:** zusätzlich `TERMHUB_API` (Adresse) und `TERMHUB_TOKEN`.
- **Hook-Datei:** bei jedem Start neu im Datenordner erzeugt.
  - Nur Hooks vom Typ `http` auf `/hooks/<Ereignis>`, mit den Kopfzeilen `X-TermHub-Tab: $TERMHUB_TAB_ID` und `X-TermHub-Token: $TERMHUB_TOKEN`; beide Variablen stehen in `allowedEnvVars`.
  - Kurze Timeouts.
  - Ereignisse: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `StopFailure`, `Notification`.
  - Vor der Umsetzung die Felder gegen https://code.claude.com/docs/en/hooks prüfen.
- **Claude-Zuordnung im Kern**, nach der Tabelle der Spezifikation, ohne die Status-Zeilen (die kommen in Ticket 13):
  - `launch` mit den Fällen „neu“ (Kern vergibt Kennung), „mit Kennung“ und „ohne Kennung“, jeweils mit gemeldetem Ordner → Claude-Tab, unbestätigt;
  - `started` merkt die Prozess-ID;
  - `SessionStart` übernimmt Kennung und Ordner, bestätigt, setzt bei neuer Kennung „hatte Prompt“ zurück;
  - `UserPromptSubmit` setzt „hatte Prompt“;
  - `SessionEnd` (ausser `clear`/`resume`), `exit` und das Ende der Shell → normales Terminal.
- **Einfrieren:** Beendet TermHub selbst (App, Tab schliessen, Windows-Abmeldung), ändern spätere Ereignisse die Claude-Zuordnung im gespeicherten Zustand nicht mehr.
- Die Claude-Zuordnung wird im Schema gespeichert: Session-Kennung, Ordner, bestätigt, hatte Prompt.

## Akzeptanzkriterien

- [ ] Kern-Tests mit echtem HTTP-Empfänger und dokumentierten Nutzdaten:
  - `launch` „neu“ liefert den aktuellen Tab-Namen (auch nach Umbenennen), je Aufruf eine neue Kennung und den Pfad zur Hook-Datei; der Tab ist danach ein unbestätigter Claude-Tab mit Kennung und Ordner;
  - „mit Kennung“ übernimmt die angegebene Kennung, „ohne Kennung“ setzt keine;
  - `SessionStart` bestätigt und übernimmt Kennung und `cwd`;
  - `/clear` (`SessionEnd` `clear`, dann `SessionStart` mit neuer Kennung) ersetzt die Kennung und setzt „hatte Prompt“ zurück;
  - `SessionEnd` `prompt_input_exit` bzw. `exit` ohne Hooks machen den Tab normal;
  - Sicherheitsnetz: nach `launch` „neu“ ohne jedes Hook-Ereignis ist die Kennung gespeichert und übersteht einen Neustart;
  - Einfrieren: App beenden bzw. Tab schliessen, danach Ende der Shell und `SessionEnd` `other` → gespeicherte Zuordnung unverändert;
  - ohne bzw. mit falschem Token → 403; unbekannte Tab-Kennung wird ignoriert; Hook-Antworten sind leer und kommen sofort.
- [ ] Die erzeugte Hook-Datei ist gültiges JSON mit genau den genannten Ereignissen, Kopfzeilen und `allowedEnvVars`, und Claude Code akzeptiert sie (`claude --settings <Datei> --version` ohne Fehler).
- [ ] Die zweite Instanz (Ticket 09) startet keinen Server und schreibt keine Hook-Datei.

## Abnahme von Hand

- [ ] Keine; die Prüfung mit echtem Claude folgt in Ticket 11.
