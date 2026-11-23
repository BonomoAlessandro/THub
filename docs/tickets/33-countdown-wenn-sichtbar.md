# 33 – Countdown von „fertig“ läuft, solange THub sichtbar ist

Status: `offen` · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-23. Liegt der Fokus in einem anderen Programm und wird Claude in einem Tab fertig, erscheint der grüne Hinweis, aber die Linie am unteren Rand zählt nicht herunter. So war es bisher festgelegt (User Story 51): Der Countdown lief nur, solange THub den Fokus hatte. Steht THub sichtbar daneben oder auf dem zweiten Bildschirm, wirkt das wie ein Fehler, und der Hinweis bleibt stehen, obwohl man ihn gesehen hat.
Spezifikation: User Story 51 (geändert), „Claude-Status“ → „Hinweise im Fenster“ → „Countdown, solange das Fenster sichtbar ist“ (neu)

## Entscheidung

Der Nutzer hat am 2026-11-23 entschieden: Die Linie zählt herunter, solange der Hinweis sichtbar auf dem Bildschirm ist, auch wenn THub nicht den Fokus hat. Dass ein Hinweis abläuft, während man gerade woanders hinschaut, nimmt er in Kauf.

## Was gebaut wird

- **Sichtbar statt Vordergrund:** Der Countdown von „fertig“ läuft, solange das THub-Fenster sichtbar ist und die Maus nicht auf der Karte steht. Ob THub den Fokus hat, spielt für den Countdown keine Rolle mehr.
- **Nicht sichtbar** ist das Fenster, wenn es minimiert oder versteckt ist, wenn andere Fenster es ganz verdecken und wenn der Bildschirm gesperrt ist. Dann hält der Countdown an und läuft mit der übrigen Zeit weiter, sobald das Fenster wieder sichtbar ist, wie bisher beim Fokus.
- **Woher THub das weiss:**
  - Vorschlag: Der Renderer meldet dem Kern beim Laden und bei jedem Wechsel, ob die Seite sichtbar ist (`document.visibilityState`, Ereignis `visibilitychange`), so wie heute den Vordergrund.
  - Chromium setzt die Seite unter Windows auf „hidden“, wenn das Fenster minimiert oder ganz verdeckt ist (Erkennung verdeckter Fenster, `CalculateNativeWinOcclusion`). Das ist mit Electron 45 in THub zu belegen.
  - Meldet Chromium den gesperrten Bildschirm nicht selbst, kommt er über `powerMonitor` (`lock-screen` / `unlock-screen`) im Hauptprozess dazu.
  - Bis zur ersten Meldung gilt das Fenster als nicht sichtbar, wie heute beim Vordergrund.
- **Was bleibt, wie es ist:**
  - Ob ein Tab als angeschaut gilt („fertig, noch nicht angeschaut“ am Tab, ob ein Hinweis überhaupt erscheint), hängt weiter am Fokus. Ein Tab ist also weiterhin nicht sichtbar, wenn er nicht aktiv ist oder das Fenster nicht im Vordergrund ist. Nur der Countdown ändert sich.
  - Die Maus auf der Karte hält den Countdown an, auch ohne Fokus.
  - „Wartet“ und offene Punkte haben keinen Countdown.
- **Die Linie** zeigt wie bisher die übrige Zeit und steht still, solange der Countdown angehalten ist.
- **Testmodus:** Das Testfenster liegt ausserhalb des Bildschirms und hat nie den Fokus. Prüfen, ob Chromium es als verdeckt meldet. Falls ja, eine Regel für den Testmodus festlegen und in `docs/entwicklung.md` beschreiben, mit der sich „sichtbar“ und „nicht sichtbar“ über CDP prüfen lassen. Das kann eine Umgebungsvariable oder ein Befehl sein, der nur im Testmodus wirkt.
- **Doku:**
  - Handbuch „Hinweise im Fenster“: Die Zeit läuft, solange THub sichtbar ist.
  - In der Spezifikation die Präzisierungen aus der Umsetzung, etwa welche Fälle Chromium als verdeckt meldet.

## Akzeptanzkriterien

- [ ] Kern-Tests mit nachgemachter Uhr:
  - Fenster sichtbar, ohne Fokus → der Countdown läuft, der Hinweis verschwindet nach 6 Sekunden;
  - Fenster wird unsichtbar → der Countdown hält an; wieder sichtbar → er läuft mit der übrigen Zeit weiter;
  - Maus auf der Karte → er hält an, auch ohne Fokus;
  - vor der ersten Meldung zur Sichtbarkeit läuft nichts;
  - ein Wechsel des Fokus allein ändert am Countdown nichts;
  - „fertig, noch nicht angeschaut“ und das Entstehen von Hinweisen hängen weiter am Fokus (die bisherigen Tests laufen weiter).
- [ ] Der Schnappschuss für die Oberfläche meldet `running` nach der Sichtbarkeit.
- [ ] In der App im Testmodus über CDP auf der eigenen Seite: Ein „fertig“-Hinweis im Fenster ohne Fokus zählt herunter und verschwindet nach etwa 6 Sekunden. Als nicht sichtbar gemeldet steht die Linie still, und der Hinweis bleibt.
- [ ] Belegt und in den Hinweisen aus der Umsetzung festgehalten: Mit Electron 45 wird die Seite beim Minimieren und beim ganzen Verdecken „hidden“; dazu, wie der gesperrte Bildschirm erkannt wird.
- [ ] Spezifikation, Handbuch und gegebenenfalls `docs/entwicklung.md` beschreiben das Verhalten.
- [ ] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] THub steht sichtbar neben einem anderen Programm oder auf dem zweiten Bildschirm, der Fokus liegt im anderen Programm. Claude wird in einem Tab fertig: Die grüne Linie läuft herunter, und der Hinweis verschwindet nach etwa 6 Sekunden.
- [ ] THub ist minimiert oder ganz verdeckt, während Claude fertig wird. Holst du THub wieder hervor, steht der Hinweis mit voller Linie da und läuft erst dann herunter.
- [ ] Bildschirm sperren, während ein Hinweis herunterzählt: Nach dem Entsperren läuft er mit der übrigen Zeit weiter.

## Hinweise

- **Bekannte Grenze:** Ist THub nur teilweise verdeckt, gilt das Fenster als sichtbar, auch wenn gerade die Ecke mit den Hinweisen verdeckt ist. Der Countdown läuft dann. Eine genauere Prüfung (Lage der Hinweise gegen die anderen Fenster) gehört nicht zu diesem Ticket.
- Ein ausgeschalteter Bildschirm (Energiesparen) zählt nur dann als nicht sichtbar, wenn Chromium das selbst meldet. Das wird geprüft und festgehalten, aber nicht eigens nachgebaut.
