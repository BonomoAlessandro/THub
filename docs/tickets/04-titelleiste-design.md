# 04 – Titelleiste und Design hell/dunkel

Status: `erledigt` (2026-11-19, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 03
User Stories: 69, 76, 77, 78
Spezifikation: „Oberfläche (Renderer)“ (Fenster und Titelleiste, Design)

## Was gebaut wird

- **Fenster ohne Windows-Rahmen:** verdeckte Titelleiste, native Fensterknöpfe als Overlay, damit die Andock-Layouts von Windows 11 erhalten bleiben. Die Tab-Leiste sitzt direkt in der Titelleiste.
- **Zieh-Fläche:** Die Tabs sind davon ausgenommen, damit Klick, Rechtsklick und später das Ziehen von Tabs funktionieren. Neben den Tabs bleibt immer eine feste Mindestfläche zum Verschieben des Fensters, auch bei überlaufender Leiste. Doppelklick auf die freie Fläche maximiert.
- **Deckender Hintergrund:** Fenster und Titelleiste sind einfarbig und deckend. Kein Mica, keine Transparenz.
- **Design-System** aus dem Prototyp:
  - Design-Variablen für hell und dunkel; das Design folgt Windows und zieht bei einem Wechsel sofort mit.
  - Die Symbolfarbe der nativen Fensterknöpfe wird bei jedem Wechsel nachgezogen.
  - Die Terminalfläche hat je ein abgestimmtes helles und dunkles Farbschema, das alle offenen Terminals sofort übernehmen.

## Akzeptanzkriterien

- [x] Ein Design-Wechsel (simuliert über die Electron-Schnittstelle für das System-Design) ändert Variablen, Terminal-Farbschema und Farbe der Fensterknöpfe ohne Neustart.
- [x] Die Mindestfläche zum Verschieben ist auch bei 30 Tabs vorhanden.
- [x] Der Fensterhintergrund ist in hell und dunkel deckend; nichts vom Desktop scheint durch.

## Abnahme von Hand

- [ ] Look entspricht dem freigegebenen Prototyp, in hell und dunkel, auch beim Live-Wechsel in den Windows-Einstellungen.
- [ ] Fensterknöpfe sind in beiden Designs gut lesbar.
- [ ] Überfahren von „Maximieren“ zeigt die Andock-Layouts. Fenster lässt sich an der freien Fläche verschieben und per Doppelklick maximieren.
- [ ] Rechtsklick auf einen Tab löst kein Fenstermenü von Windows aus.
