# 10 – Lokale Schnittstelle, Hook-Datei und Claude-Zuordnung

Status: `erledigt` (2026-11-19, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 01, 09
User Stories: 31, 32, 36, 38 (Grundlage)
Spezifikation: „Hook-Empfänger und lokale Schnittstelle“, „Claude-Status: Zustandsautomat pro Tab“ (Claude-Zuordnung, Einfrieren), „Testentscheidungen → Teststelle 1“

## Was gebaut wird

Die Seite von TermHub, die Claude-Sessions erkennt. Der Starter in den Shells folgt in Ticket 11; hier wird alles über echte HTTP-Anfragen getestet.

- **Lokale Schnittstelle:** HTTP-Server nur auf `127.0.0.1`, zufälliger freier Port, pro App-Start ein zufälliges Token. Anfragen ohne gültiges Token → 403, unbekannte Tabs werden ignoriert.
  - Endpunkte: `POST /claude/launch`, `POST /claude/started`, `POST /claude/exit`, `POST /hooks/<Ereignis>`, mit Inhalt und Antworten wie in der Tabelle der Spezifikation.
  - Hook-Antworten sind immer sofort leer und enthalten nie Entscheidungsfelder.
- **Umgebung der Terminals:** zusätzlich `TERMHUB_API` (Adresse) und `TERMHUB_TOKEN`.
- **Hook-Datei:** bei jedem Start neu im Datenordner erzeugt, nach der geprüften Vorlage `spikes/claude-hooks/empfohlene-hook-datei.json` (Befunde in `docs/spikes/claude-hooks.md`).
  - Hooks vom Typ `http` auf `/hooks/<Ereignis>`, mit den Kopfzeilen `X-TermHub-Tab: $TERMHUB_TAB_ID` und `X-TermHub-Token: $TERMHUB_TOKEN`; beide Variablen stehen in `allowedEnvVars`; Timeout 2 Sekunden.
  - Ereignisse per HTTP: `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure`, `Notification`.
  - `SessionStart` als Befehls-Hook in Exec-Form mit `curl.exe` (`--connect-timeout 1 -m 2`, Hook-Timeout 3 s), der die Nutzdaten an `/hooks/SessionStart` weiterleitet; die Antwort ist leer. Fehlt `curl.exe`, entfällt der Eintrag.
- **Claude-Zuordnung im Kern**, nach der Tabelle der Spezifikation, ohne die Status-Zeilen (die kommen in Ticket 13):
  - `launch` mit den Fällen „neu“ (Kern vergibt Kennung), „mit Kennung“ und „ohne Kennung“, jeweils mit gemeldetem Ordner → Claude-Tab, unbestätigt;
  - `started` merkt die Prozess-ID;
  - `SessionStart` übernimmt Kennung und Ordner (normalisiert, auch 8.3-Kurzpfade), bestätigt, setzt bei neuer Kennung „hatte Prompt“ zurück;
  - ein anderes Ereignis (ausser `SessionEnd`) mit einer neuen `session_id` wird wie `SessionStart` behandelt;
  - Ereignisse werden in der Reihenfolge ihres Eintreffens verarbeitet;
  - `UserPromptSubmit` setzt „hatte Prompt“;
  - `SessionEnd` (ausser `clear`/`resume`), `exit` und das Ende der Shell → normales Terminal; nach einem von TermHub gestarteten Fortsetzen ohne `SessionStart` entscheidet erst `exit` (Ticket 12).
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
- [ ] Die erzeugte Hook-Datei ist gültiges JSON und entspricht der geprüften Vorlage (Ereignisse, Kopfzeilen, `allowedEnvVars`, curl-Eintrag für `SessionStart`); geprüft per Test gegen die Vorlage. Hinweis: `claude --settings <Datei> --version` prüft nur, ob die Datei existiert, und taugt nicht als Nachweis.
- [ ] Kern-Test: `/hooks/SessionStart` antwortet mit leerem Inhalt; ein Ereignis mit neuer `session_id` ohne vorheriges `SessionStart` übernimmt die Kennung.
- [ ] Die zweite Instanz (Ticket 09) startet keinen Server und schreibt keine Hook-Datei.

## Abnahme von Hand

- [ ] Keine; die Prüfung mit echtem Claude folgt in Ticket 11.
