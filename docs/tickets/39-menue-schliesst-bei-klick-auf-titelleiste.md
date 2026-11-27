# 39 – Menüs schliessen auch bei einem Klick auf die Titelleiste

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: –
Herkunft: Rückmeldung des Nutzers am 2026-11-27. Das Menü am Pfeil neben `+` (Shell oder Ordner wählen) soll bei jedem Klick ausserhalb zugehen. Heute bleibt es offen, wenn man auf die freie Fläche der Titelleiste ganz oben klickt.
Spezifikation: „Oberfläche (Renderer)“, Präzisierung zu den Menüs (neu)

## Ursache

- **Schliessen:** Das Menü (`src/renderer/popup/Menu.tsx`) schliesst bei einem `mousedown` ausserhalb, bei Fokusverlust des Fensters (`blur`) und bei einer Grössenänderung (`resize`).
- **Zieh-Fläche:** Die freie Fläche der Titelleiste ist eine Zieh-Fläche (`-webkit-app-region: drag` an `.titlebar`, `src/renderer/styles/app.css`).
  - Windows behandelt einen Klick dort selbst, als Klick auf den Rahmen des Fensters zum Verschieben. Die Seite bekommt kein `mousedown`.
  - Das Fenster hat den Fokus schon, also kommt auch kein `blur`. Das Menü bleibt offen.
- **Gleiches Problem bei allen Menüs** (`src/renderer/tabs/TabBar.tsx`):
  - Shell oder Ordner wählen (Pfeil neben `+`);
  - Stufe von „Rechner wach halten“;
  - Rechtsklick-Menü am Tab;
  - Liste einer Gruppe;
  - Menü am Gruppen-Tab.
- **Nicht betroffen:** Dialoge und die Befehlspalette. Sie liegen über einer Fläche, die das ganze Fenster deckt und von der Zieh-Fläche ausgenommen ist (`.overlay`).

## Was gebaut wird

- **Ein Klick ausserhalb schliesst jedes offene Menü**, auch auf die freie Fläche der Titelleiste. Das Verhalten steckt in `Menu.tsx` und gilt damit für alle Menüs.
- **Vorschlag:** Solange ein Menü offen ist, ist die Titelleiste keine Zieh-Fläche, zum Beispiel über ein Merkmal am Wurzel-Element, das `.titlebar` auf `-webkit-app-region: no-drag` setzt.
  - Der Klick landet dann bei der Seite, und das `mousedown` ausserhalb schliesst das Menü wie überall sonst.
  - Erst danach lässt sich das Fenster wieder an der Titelleiste ziehen. So machen es auch die Menüs von Windows: Der erste Klick schliesst das Menü.
  - Ein Doppelklick auf die Titelleiste schliesst bei offenem Menü nur das Menü und maximiert nicht.
- **Verworfen:** eine durchsichtige Fläche über dem ganzen Fenster, wie bei den Dialogen. Sie würde jeden Klick schlucken. Heute schliesst ein Klick auf einen anderen Tab das Menü und wählt den Tab zugleich, und das soll so bleiben.
- **Alternative**, falls der Vorschlag nicht trägt: Der Hauptprozess fängt Klicks auf den Rahmen des Fensters ab (`hookWindowMessage` mit `WM_NCLBUTTONDOWN` und `WM_NCRBUTTONDOWN`) und lässt die Oberfläche alle Menüs schliessen. Die Wahl im Ticket festhalten.
- **Unverändert bleibt:**
  - Ein Klick auf den Pfeil, der das Menü geöffnet hat, schliesst es. Ein zweiter Klick öffnet es wieder.
  - Ein Klick auf einen Tab oder ins Terminal schliesst das Menü und wirkt zugleich wie bisher.
  - Esc, Fokusverlust und eine Grössenänderung schliessen es.
  - Die Knöpfe von Windows oben rechts (minimieren, maximieren, schliessen) wirken wie bisher. Minimieren und Maximieren schliessen das Menü über Fokusverlust bzw. Grössenänderung.
  - Ist kein Menü offen, lässt sich das Fenster an der freien Fläche ziehen und per Doppelklick maximieren. Oben am Fensterrand lässt sich die Grösse ziehen, wie seit Ticket 26.
- **Rechtsklick auf die freie Titelleiste bei offenem Menü:** schliesst das Menü. Das Fenstermenü von Windows erscheint dabei nicht.
- **Doku:** Präzisierung in der Spezifikation („Oberfläche (Renderer)“), im Handbuch eine Zeile bei den Menüs, falls dort beschrieben ist, wann sie schliessen.

## Akzeptanzkriterien

- [ ] Ein Test der Menü-Logik prüft, dass ein offenes Menü das Merkmal setzt, das die Titelleiste von der Zieh-Fläche ausnimmt (oder den gewählten anderen Weg), und dass es mit dem Schliessen wieder verschwindet, auch wenn ein Menü direkt ein anderes ersetzt.
- [ ] In der App im Testmodus, nur auf das eigene Fenster:
  - Mit `WM_NCHITTEST` auf einen Punkt der freien Titelleiste geprüft: Ohne offenes Menü kommt `HTCAPTION`. Mit offenem Menü (geöffnet über CDP auf der eigenen Seite) kommt `HTCLIENT`. Nach dem Schliessen kommt wieder `HTCAPTION`.
  - Der obere Fensterrand bleibt in beiden Fällen ziehbar (`HTTOP`).
  - Ein Klick über CDP auf diesen Punkt schliesst das Menü.
  - Geprüft für das Menü am Pfeil neben `+` und das Rechtsklick-Menü am Tab.
  - Ein Klick über CDP auf einen anderen Tab schliesst das Menü und wählt den Tab.
- [ ] Die bisherigen Tests laufen weiter.
- [ ] Spezifikation und, falls nötig, Handbuch beschreiben das Verhalten.
- [ ] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Das Menü am Pfeil neben `+` öffnen und auf die freie Fläche der Titelleiste klicken: Das Menü geht zu.
- [ ] Dasselbe mit dem Rechtsklick-Menü eines Tabs und der Liste einer Gruppe.
- [ ] Ohne offenes Menü lässt sich das Fenster an der Titelleiste verschieben und per Doppelklick maximieren.
- [ ] Bei offenem Menü einen anderen Tab anklicken: Das Menü geht zu, und der Tab wird angezeigt.

## Hinweise

- **Grenze:** Ein Klick auf den Rand zum Grössenziehen ohne Ziehen schliesst das Menü nicht, weil Windows auch diesen Klick selbst behandelt. Mit dem Vorschlag bleibt das so. Mit der Alternative über `hookWindowMessage` liesse es sich abdecken.
- Es gelten die Spielregeln aus [`README.md`](README.md): Fenster-Nachrichten nur an das eigene Testfenster, keine echten Mausklicks.
- Fundstellen:
  - Menü: `src/renderer/popup/Menu.tsx`;
  - Menüs der Leiste: `src/renderer/tabs/TabBar.tsx`;
  - Zieh-Fläche: `.titlebar` und die Ausnahmen darunter in `src/renderer/styles/app.css`;
  - Titelleiste und Knöpfe von Windows: `titleBarOverlay` in `src/main/theme.ts`.
