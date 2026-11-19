# 16 – Rechtsklick-Menü und Umsortieren per Ziehen

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 15
User Stories: 16, 20–23
Spezifikation: „Oberfläche (Renderer)“

## Was gebaut wird

- **Rechtsklick-Menü am Tab** wie im Prototyp:
  - **Umbenennen** (wie Doppelklick bzw. `F2`).
  - **Duplizieren:** neuer Tab rechts daneben, im aktuellen Ordner des Tabs, mit derselben Shell und automatischem Namen. Bei einem Claude-Tab wird nur das Terminal dupliziert, keine Claude-Session.
  - **Ordner im Explorer öffnen:** der aktuelle Ordner des Tabs.
  - **Pfad kopieren:** der aktuelle Ordner in die Zwischenablage.
  - **Schliessen** und **Andere Tabs schliessen**, mit den Rückfrage-Regeln aus Ticket 15.
- **Umsortieren per Ziehen** in der Tab-Leiste, mit sichtbarer Einfügemarke. Die neue Reihenfolge übersteht einen Neustart, und `Ctrl+1` … `Ctrl+9` folgen ihr.

## Akzeptanzkriterien

- [ ] Kern-Tests:
  - Duplizieren: Position, aktueller Ordner, Shell, Name, keine Claude-Zuordnung;
  - Verschieben eines Tabs an eine neue Position übersteht einen Neustart;
  - „Andere Tabs schliessen“ lässt genau den gewählten Tab übrig.
- [ ] Das Rechtsklick-Menü lässt sich mit der Tastatur bedienen (Pfeiltasten, Enter, Escape).

## Abnahme von Hand

- [ ] Alle Menüeinträge funktionieren; der Explorer öffnet den richtigen Ordner, auch nach `cd`.
- [ ] Ziehen funktioniert auch bei überlaufender, scrollbarer Tab-Leiste. Ziehen auf die Fensterknöpfe oder aus dem Fenster hinaus bricht sauber ab, und das Fenster lässt sich weiterhin an der freien Fläche verschieben.
