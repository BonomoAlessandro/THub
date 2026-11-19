# 09 – Fenster merken und nur eine Instanz

Status: `erledigt` (2026-11-19, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 01
User Stories: 67, 68
Spezifikation: „App-Verhalten“, „Gespeicherter Zustand“ (Fenster)

## Was gebaut wird

- **Fenster merken:** Grösse und Position im normalen Zustand sowie der Maximiert-Zustand werden gespeichert (entprellt bei Änderungen und beim Beenden) und beim Start wiederhergestellt. Nach einem Start im maximierten Zustand führt „Wiederherstellen“ zur gespeicherten normalen Grösse.
- **Erster Start:** Ohne gespeicherte Fensterangaben öffnet das Fenster maximiert auf dem Hauptbildschirm, mit einer sinnvollen normalen Grösse darunter (etwa 1200×760, zentriert).
- **Ausserhalb aller Bildschirme**, etwa nach dem Abziehen eines Monitors: Das Fenster öffnet zentriert auf dem Hauptbildschirm. Die Bildschirme liefert der Port „System“.
- **Nur eine Instanz:** Ein zweiter Start beendet sich sofort und holt das bestehende Fenster nach vorne, auch aus minimiertem Zustand. Er startet keine Shells und keinen Server, schreibt keine Hook-Datei und keinen Zustand.
- Die Entwicklungsversion (eigener Datenordner aus Ticket 01) hat ihre eigene Sperre und stört eine installierte TermHub-Instanz nicht.

## Akzeptanzkriterien

- [ ] Kern-Tests: Fensterangaben werden gespeichert und nach einem Neustart zurückgegeben; eine Position ausserhalb der Bildschirme ergibt die zentrierte Position auf dem Hauptbildschirm.
- [ ] Der zweite Start beendet sich, bevor Zustand geladen, Shells gestartet oder Dateien geschrieben werden (am Code nachvollziehbar, Prüfung mit zwei Starts).

## Abnahme von Hand

- [ ] Maximiert beenden → maximiert starten, „Wiederherstellen“ ergibt die alte Grösse.
- [ ] TermHub ein zweites Mal starten, auch minimiert → das bestehende Fenster kommt nach vorne, nichts wird doppelt fortgesetzt.
- [ ] `npm start` neben einer installierten TermHub-Instanz → beide laufen unabhängig.
