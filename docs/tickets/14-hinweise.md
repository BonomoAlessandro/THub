# 14 – Hinweise im Fenster

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 13
User Stories: 49–55, 75 (Hinweise an/aus)
Spezifikation: „Claude-Status: Zustandsautomat pro Tab“ (Hinweise im Fenster)

## Was gebaut wird

- **Auslöser:** Der Kern löst einen Hinweis aus, wenn ein **nicht sichtbarer** Tab in „wartet auf dich“ wechselt oder fertig wird. Pro Tab gibt es höchstens einen Hinweis; ein neuer ersetzt den alten.
- **Darstellung** unten rechts im Fenster wie im Prototyp, gestapelt:
  - Tab-Name und Text, etwa „Claude wartet auf deine Bestätigung“ bzw. „Claude ist fertig“;
  - Schaltfläche „Öffnen“; ein Klick springt in den Tab;
  - Hinweise nehmen dem Terminal nie den Fokus, Eingaben im aktiven Terminal gehen weiter.
- **„Fertig“** verschwindet nach etwa 6 Sekunden Vordergrundzeit oder beim Anzeigen des Tabs. Der Countdown pausiert, solange das Fenster im Hintergrund ist.
- **„Wartet auf dich“** verschwindet beim Anzeigen des Tabs oder wenn der Tab wieder arbeitet.
- **Einstellung:** neues Feld „Hinweise im Fenster“ (an/aus) im Einstellungsdialog. Ausgeschaltet löst der Kern keine Hinweise aus; die Status-Symbole bleiben.
- Keine Windows-Benachrichtigungen, kein Blinken in der Taskleiste.

## Akzeptanzkriterien

- [ ] Kern-Tests mit steuerbarer Uhr:
  - kein Hinweis für den sichtbaren Tab; ein Hinweis für einen nicht sichtbaren Tab bei „wartet“ und bei „fertig“;
  - höchstens ein Hinweis pro Tab;
  - „fertig“ verschwindet nach 6 Sekunden Vordergrundzeit, im Hintergrund pausiert der Countdown; „fertig“ verschwindet auch beim Anzeigen des Tabs;
  - „wartet“ bleibt, bis der Tab angezeigt wird oder wieder arbeitet;
  - ausgeschaltete Hinweise erzeugen nichts; die Einstellung übersteht einen Neustart.

## Abnahme von Hand (mit echtem Claude Code)

- [ ] Berechtigungsfrage in einem Hintergrund-Tab → der Hinweis bleibt stehen; ein Klick öffnet den Tab, der Hinweis ist weg.
- [ ] Während ein Hinweis sichtbar ist, im aktiven Terminal weitertippen → nichts geht verloren.
- [ ] Aussehen und Stapeln wie im Prototyp.
