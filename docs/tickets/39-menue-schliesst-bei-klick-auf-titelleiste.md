# 39 – Menüs schliessen auch bei einem Klick auf die Titelleiste

Status: `erledigt` (2026-11-27, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
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

- [x] Ein Test der Menü-Logik prüft, dass ein offenes Menü das Merkmal setzt, das die Titelleiste von der Zieh-Fläche ausnimmt (oder den gewählten anderen Weg), und dass es mit dem Schliessen wieder verschwindet, auch wenn ein Menü direkt ein anderes ersetzt.
- [x] In der App im Testmodus, nur auf das eigene Fenster:
  - Mit `WM_NCHITTEST` auf einen Punkt der freien Titelleiste geprüft: Ohne offenes Menü kommt `HTCAPTION`. Mit offenem Menü (geöffnet über CDP auf der eigenen Seite) kommt `HTCLIENT`. Nach dem Schliessen kommt wieder `HTCAPTION`.
  - Der obere Fensterrand bleibt in beiden Fällen ziehbar (`HTTOP`).
  - Ein Klick über CDP auf diesen Punkt schliesst das Menü.
  - Geprüft für das Menü am Pfeil neben `+` und das Rechtsklick-Menü am Tab.
  - Ein Klick über CDP auf einen anderen Tab schliesst das Menü und wählt den Tab.
- [x] Die bisherigen Tests laufen weiter.
- [x] Spezifikation und, falls nötig, Handbuch beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Das Menü am Pfeil neben `+` öffnen und auf die freie Fläche der Titelleiste klicken: Das Menü geht zu.
- [ ] Dasselbe mit dem Rechtsklick-Menü eines Tabs und der Liste einer Gruppe.
- [ ] Ohne offenes Menü lässt sich das Fenster an der Titelleiste verschieben und per Doppelklick maximieren.
- [ ] Bei offenem Menü einen anderen Tab anklicken: Das Menü geht zu, und der Tab wird angezeigt.
- [ ] Bei offenem Menü ein Doppelklick auf die freie Fläche: Das Menü geht zu, das Fenster wird nicht maximiert. Ein Rechtsklick dort schliesst das Menü ohne das Fenstermenü von Windows.

## Hinweise

- **Grenze:** Ein Klick auf den Rand zum Grössenziehen ohne Ziehen schliesst das Menü nicht, weil Windows auch diesen Klick selbst behandelt. Mit dem Vorschlag bleibt das so. Mit der Alternative über `hookWindowMessage` liesse es sich abdecken.
- Es gelten die Spielregeln aus [`README.md`](README.md): Fenster-Nachrichten nur an das eigene Testfenster, keine echten Mausklicks.
- Fundstellen:
  - Menü: `src/renderer/popup/Menu.tsx`;
  - Menüs der Leiste: `src/renderer/tabs/TabBar.tsx`;
  - Zieh-Fläche: `.titlebar` und die Ausnahmen darunter in `src/renderer/styles/app.css`;
  - Titelleiste und Knöpfe von Windows: `titleBarOverlay` in `src/main/theme.ts`.

## Hinweise aus der Umsetzung

- **Gewählter Weg: der Vorschlag.** Die Alternative über `hookWindowMessage` war nicht nötig. Chromium führt die Zieh-Fläche nach dem Umschalten des CSS zuverlässig nach (Messung unten).
- **Umsetzung:**
  - `src/renderer/popup/menuOpenMark.ts`: zählt die offenen Menüs (`createMenuOpenMark`) und setzt das Merkmal `data-menu-open` an `<html>`, solange es mindestens eines gibt. Jedes Menü meldet sich mit `useMenuOpenMark()` in einem Layout-Effekt an und beim Verschwinden wieder ab; ein zweites Abmelden ändert nichts.
  - `Menu.tsx` ruft `useMenuOpenMark()` auf; damit gilt es für alle fünf Menüs der Leiste. Am Schliessen selbst ändert sich nichts: Der Klick kommt jetzt als `mousedown` an und schliesst das Menü wie jeder Klick daneben.
  - `styles/app.css`: `:root[data-menu-open] .titlebar { -webkit-app-region: no-drag; }`. Ohne Merkmal bleibt `.titlebar` die Zieh-Fläche wie bisher.
  - Ein Zähler statt eines Schalters: Ersetzt ein Menü direkt ein anderes, ist die Reihenfolge von Ab- und Anmelden egal. Bei der Liste einer Gruppe → Menü eines Tabs daraus meldet React das alte Menü im selben Durchgang ab und das neue an, ohne Zeichnen dazwischen. Beim Rechtsklick von Tab zu Tab bleibt es dasselbe Menü.
- **Test:** `test/renderer/menuOpenMark.test.ts` (6 Tests, ohne DOM, mit nachgemachtem Wurzel-Element): ohne Menü kein Merkmal; ein Menü setzt es, das Schliessen nimmt es weg; ein Menü ersetzt ein anderes in beiden Reihenfolgen; doppeltes Schliessen nimmt es einem anderen offenen Menü nicht weg. Dazu prüft ein Test, dass `app.css` mit diesem Merkmal `.titlebar` auf `no-drag` setzt und `.titlebar` sonst `drag` bleibt.
- **In der App geprüft** (Testmodus, eigener Datenordner mit vorbereitetem Zustand aus cmd-Tabs und einer Gruppe, Debug-Port zufällig, `--disable-features=CalculateNativeWinOcclusion`, CDP nur auf der eigenen Seite, Zeitgrenze 170 s mit Watchdog, Skalierung 150 %, Fenster nicht maximiert):
  - `WM_NCHITTEST` per `SendMessageTimeout` nur an das eigene Fenster, auf die Mitte der freien Fläche und auf dieselbe Spalte in der obersten Pixelreihe. Das Testfenster lag bei −32 768 und damit ausserhalb der 16 Bit, die die Nachricht für einen Punkt hat. Es wurde mit `SetWindowPos` (`SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE`) nach −20 000 verschoben, weiter ausserhalb des Bildschirms und ohne Aktivierung.
  - Für alle fünf Menüs (Pfeil neben `+`, Rechtsklick-Menü am Tab, Stufe von „Rechner wach halten“, Liste der Gruppe, Menü am Gruppen-Tab):
    - ohne Menü frei `HTCAPTION`, oben `HTTOP`;
    - mit Menü (über CDP geöffnet) frei `HTCLIENT`, oben `HTTOP`, `.titlebar` berechnet `no-drag`;
    - ein Klick über CDP auf die freie Fläche schliesst das Menü;
    - danach frei wieder `HTCAPTION`, oben `HTTOP`, `.titlebar` `drag`.
    - Ein Punkt auf einem Tab blieb immer `HTCLIENT`.
  - **Nachführen:** achtmal das Menü am Pfeil auf und per Klick auf die freie Fläche zu, gemessen ab dem Klick über CDP. `HTCLIENT` nach 18 bis 50 ms; das schliesst die Abfrage der Ordner beim Öffnen ein. Wieder `HTCAPTION` spätestens 1 ms, nachdem der schliessende Klick über CDP (Drücken und Loslassen) zurückgekehrt ist. Kein Ausreisser. Ohne `--disable-features=CalculateNativeWinOcclusion` (Seite `hidden`) führt Chromium ebenfalls nach, `HTCLIENT` nach 64 bis 121 ms.
  - **Ersetzen:** Liste der Gruppe → Rechtsklick auf einen Eintrag → Menü des Tabs: Merkmal und `HTCLIENT` bleiben. Ebenso beim Rechtsklick-Menü von Tab „eins“ zu Tab „drei“.
  - **Klick auf einen anderen Tab** (über CDP): beim Menü am Pfeil und beim Rechtsklick-Menü geht das Menü zu, der Tab wird aktiv (`activeTabId` im Kern), danach `HTCAPTION`.
  - **Escape** und **Rechtsklick auf die freie Fläche** schliessen das Menü, das Merkmal geht mit.
  - Das Testfenster war nie im Vordergrund (`GetForegroundWindow`).
  - Skript und Ausgabe liegen nicht im Repo.
- **Grenzen, wie im Ticket:**
  - Ein Klick ohne Ziehen auf den Rand zum Grössenziehen oder auf die Fensterknöpfe schliesst das Menü nicht. Minimieren und Maximieren schliessen es über Fokusverlust bzw. Grössenänderung.
  - Im maximierten Fenster gilt dasselbe ohne `HTTOP`. Geprüft ist das nicht: Ein maximiertes Testfenster läge auf dem Bildschirm des Nutzers.
- **Nicht automatisch prüfbar:** Ob ein Doppelklick auf die freie Fläche bei offenem Menü nur das Menü schliesst, entscheidet Windows mit echten Klicks. Der erste Klick trifft die Seite (`HTCLIENT`). Wenn der zweite kommt, ist die Fläche schon wieder Zieh-Fläche (`HTCAPTION`). Ob Windows diesen zweiten Klick mit dem ersten zu einem Doppelklick auf die Titelleiste verbindet und das Fenster maximiert, ist nicht belegt; deshalb steht es in der Abnahme von Hand. Maximiert es doch, könnte das Merkmal nach einem Klick daneben noch für die Doppelklick-Zeit von Windows stehen bleiben.
