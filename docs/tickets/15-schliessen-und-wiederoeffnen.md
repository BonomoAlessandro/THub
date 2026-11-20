# 15 – Tabs schliessen mit Rückfrage und wieder öffnen

Status: `erledigt` (2026-11-20, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 12, 13
User Stories: 24–29
Spezifikation: „Wiederherstellen“ (geschlossene Tabs, Beenden), „Gespeicherter Zustand“ (zuletzt geschlossene Tabs), „Claude-Status“ (Einfrieren)

## Was gebaut wird

- **Rückfrage beim Schliessen:**
  - Sie kommt nur, wenn im Tab eines der eigentlichen Merkmale zutrifft: arbeitet, wartet auf dich oder Prozesse laufen. Massgeblich ist das Merkmal, nicht das angezeigte Symbol: Ein grüner Tab mit laufendem Dev-Server fragt nach.
  - Ein ruhender Tab, auch ein ruhender Claude-Tab, schliesst sofort.
  - Der Kern entscheidet, der Renderer zeigt den Dialog wie im Prototyp.
- **Mehrere Tabs schliessen** („Andere Tabs schliessen“): im Kern umgesetzt, im Menü ab Ticket 16. Höchstens eine gemeinsame Rückfrage, die die betroffenen Tabs nennt.
- **Beim Schliessen eines Tabs** werden die Shell und alle ihre Nachfahren beendet. Prozesse mit eigener Konsole (etwa per `Start-Process` gestartet) überleben `pty.kill()` laut Spike; sie werden über den Prozessbaum der Sonde gezielt beendet. Dasselbe gilt beim Beenden der App.
- **Konsolen-Hosts aufräumen:** Laut Versuch zu Ticket 21 bleibt bei node-pty 1.1.0 nach dem Ende einer Shell deren `conhost.exe` bestehen, bis `kill` die Pseudokonsole schliesst. Prüfen, ob THub pro beendeter Shell (`exit`) einen Konsolen-Host zurücklässt, und ihn in dem Fall beim Ende der Shell schliessen.
- **Fenster schliessen bzw. App beenden** fragt nie nach.
- **Zuletzt geschlossene Tabs:**
  - Beim Schliessen wird der Tab eingefroren und wandert mit allen Angaben (Name, Shell, Ordner, Verlauf bzw. Claude-Zuordnung) in eine Liste der letzten zehn, die einen Neustart übersteht.
  - Fällt ein Tab aus der Liste, wird seine Verlaufsdatei gelöscht. Das löst die Übergangsregel aus Ticket 08 ab.
- **Wieder öffnen** mit `Ctrl+Shift+Z`:
  - Der zuletzt geschlossene Tab kommt an seiner alten Position zurück.
  - Ein normaler Tab kommt mit Verlauf im zuletzt aktiven Ordner zurück, ein fortzusetzender Claude-Tab setzt seine Session **sofort** fort.
  - Die Befehlspalette (Ticket 17) bietet später „Zuletzt geschlossen“ mit der ganzen Liste an.

## Akzeptanzkriterien

- [ ] Kern-Tests:
  - Rückfrage-Bedarf hängt richtig von den Merkmalen ab, auch grün plus Prozesse → Rückfrage; für einen und für mehrere Tabs;
  - die Liste enthält höchstens zehn Tabs, die neuesten zuerst, und übersteht einen Neustart;
  - Wiederöffnen stellt Position, Name, Shell und Ordner her und gibt den Verlauf zurück;
  - ein Claude-Tab erzeugt beim Wiederöffnen sofort einen Startauftrag mit `--resume <Kennung>`;
  - Einfrieren: Claude-Tab schliessen, danach `SessionEnd` und Ende der Shell → Wiederöffnen setzt trotzdem fort;
  - fällt ein Tab aus der Liste, wird sein Verlauf gelöscht.
- [ ] `Ctrl+Shift+Z` funktioniert aus jedem Tab heraus und erreicht die Shell nicht.

## Abnahme von Hand

- [ ] Tab mit laufendem `npm run dev` schliessen → Rückfrage.
- [ ] Ruhenden Claude-Tab schliessen → keine Rückfrage; `Ctrl+Shift+Z` → das Gespräch geht weiter.
- [ ] Fenster schliessen, während Claude arbeitet → keine Rückfrage, nach dem Neustart geht es weiter.
