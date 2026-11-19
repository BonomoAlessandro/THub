# 08 – Verlauf normaler Tabs sichern und wiederherstellen

Status: `erledigt` (2026-11-19, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 03
User Stories: 58, 66
Spezifikation: „Wiederherstellen“ (normaler Tab, Verlauf sichern), „App-Verhalten“ (Beenden)

## Was gebaut wird

- **Serialisieren:** Der Renderer serialisiert den Inhalt jedes normalen Tabs mit `@xterm/addon-serialize` (neue Abhängigkeit), ohne den Alternativ-Puffer von Vollbildprogrammen und begrenzt auf die letzten ca. 1000 Zeilen. Der Hauptprozess legt ihn pro Tab in einer eigenen Datei ab.
- **Wann gesichert wird:**
  - beim Schliessen eines Tabs;
  - periodisch etwa alle 30 Sekunden für Tabs, deren Inhalt sich geändert hat;
  - **beim Beenden:** Das Schliessen des Fensters wird abgefangen. THub fordert den aktuellen Verlauf mit etwa 2 Sekunden Zeitlimit an, sichert und beendet erst dann wie bisher die Shells und die App.
  - **Windows-Abmeldung oder Neustart** (`query-session-end` / `session-end`): synchron mit dem zuletzt periodisch gesicherten Verlauf schreiben, weil der Renderer womöglich nicht mehr antwortet.
- **Wiederherstellen:**
  - Vor dem Start der Shell schreibt der Renderer den Verlauf ausgegraut ins Terminal, gefolgt von der Trennlinie „Wiederhergestellt · <Datum, Uhrzeit>“ und so vielen Leerzeilen, dass alles im Scrollback liegt; ConPTY leert beim Start den sichtbaren Bereich.
  - Das Ausgrauen wirkt auch über Farb-Resets im gespeicherten Inhalt hinweg.
  - Der Vertrag aus Ticket 01 (Startauftrag erst nach „Ansicht bereit“) stellt sicher, dass der Verlauf vor der ersten Shell-Ausgabe steht.
- **Aufräumen:** Bis Ticket 15 wird die Verlaufsdatei beim Schliessen eines Tabs gelöscht; danach erst, wenn der Tab aus der Liste der geschlossenen Tabs fällt.

## Akzeptanzkriterien

- [ ] Kern-Tests:
  - Verlauf wird pro Tab gespeichert und nach einem Neustart dem richtigen Tab zurückgegeben, bevor dessen Startauftrag erteilt wird;
  - beim Schliessen wird der Verlauf gelöscht;
  - die periodische Sicherung (steuerbare Uhr) betrifft nur geänderte Tabs;
  - eine Windows-Abmeldung schreibt sofort, ohne auf den Renderer zu warten.
- [ ] Das Beenden über das Fenster sichert den Verlauf und bricht nach dem Zeitlimit trotzdem ab, wenn der Renderer nicht antwortet. Das bestehende geordnete Beenden der Shells bleibt.

## Abnahme von Hand

- [ ] Befehle ausführen, Fenster mit `×` schliessen, neu starten → der frühere Inhalt steht ausgegraut mit Trennlinie über dem neuen Prompt, lesbar in hell und dunkel.
- [ ] Mit offenem `vim` bzw. `less` beenden → im Verlauf steht die normale Shell-Ausgabe, nicht der Vollbildinhalt.
- [ ] THub per Task-Manager beenden → nach dem Neustart ist der Inhalt bis höchstens etwa 30 Sekunden vor dem Absturz da.
- [ ] Windows mit offenem THub neu starten → Verlauf ist da.

## Hinweise

- Claude-Tabs bekommen keinen Verlauf. Diese Unterscheidung kommt mit Ticket 12, bis dahin sind alle Tabs normale Tabs.
