# 36 – Tabs zu Gruppen zusammenfassen

Status: `erledigt` (2026-11-26, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-25. Mehrere Konsolen sollen in einer Art Verzeichnis zusammenliegen, aus dem man die gewünschte auswählt. Es geht nur um die Auswahl der richtigen Konsole, nicht um eine geteilte Ansicht.
Spezifikation: „Tab-Gruppen“ (User Stories 96 bis 104, neu) und „Oberfläche (Renderer)“ → „Tab-Gruppen (Ticket 36)“ (neu)

## Entscheidung

Der Nutzer hat am 2026-11-25 gewählt:
- **Ordner-Tab mit Liste:** Eine Gruppe ist ein einziger Tab in der Leiste. Er zeigt den Namen der Gruppe, den gewählten Tab darin und die Zahl der Tabs. Ein Klick auf den Pfeil öffnet die Liste der Tabs, dort wählt man einen aus.
- **Gruppen von Hand:** Der Nutzer legt Gruppen selbst an, benennt sie und schiebt Tabs hinein oder heraus, über das Rechtsklick-Menü und per Ziehen auf die Gruppe. Eine neue Gruppe heisst zuerst wie der Ordner ihres ersten Tabs; der Name lässt sich ändern.

```
[>_ termhub] [▤ Kunde X · api  3 ▾] [✱ notes]  +
               ┌──────────────────────┐
               │ ✓ api                │
               │   web             ●  │
               │   db                 │
               │ ──────────────────── │
               │ + Neues Terminal     │
               └──────────────────────┘
```

Verworfen:
- **Aufklappbare Gruppe wie im Browser** (Etikett, daneben die Tabs der Gruppe): Aufgeklappt wird die Leiste so lang wie ohne Gruppe.
- **Seitenleiste mit Ordnern:** ein grösserer Umbau des Fensters.
- **Automatisch nach Projektordner:** Der Nutzer will selbst bestimmen, was zusammengehört.
- **Geteilte Ansicht:** bleibt ausserhalb des Umfangs. Es ist immer genau ein Terminal zu sehen.

## Was gebaut wird

Begriffe: Ein Tab ist weiterhin ein Terminal. Eine **Gruppe** fasst einen oder mehrere Tabs zusammen. Ihr **gewählter Tab** ist der zuletzt angezeigte Tab der Gruppe. Die **Einträge der Leiste** sind die einzelnen Tabs und die Gruppen.

- **Gruppen-Tab in der Leiste:**
  - Er steht an der Stelle der Gruppe und hat die Masse eines Tabs.
  - Er zeigt ein Ordner-Symbol im Stil der bestehenden Symbole, dazu „Gruppenname · Name des gewählten Tabs“ (gekürzt mit „…“), gedämpft die Zahl der Tabs und einen Pfeil ▾.
  - Ist der gewählte Tab der aktive, sieht der Gruppen-Tab aus wie ein aktiver Tab.
  - **Klick:** zeigt den gewählten Tab an. Ist die Gruppe schon aktiv, öffnet der Klick die Liste. Ein Klick auf den Pfeil öffnet die Liste immer.
  - **Doppelklick:** benennt die Gruppe um, wie bei einem Tab (Inline-Umbenennen).
  - **Tooltip:** Name der Gruppe, Zahl der Tabs, dann Name, Ordner und Shell des gewählten Tabs.
  - **Status-Symbol:** der dringendste Status ihrer Tabs, in dieser Reihenfolge: wartet, fertig, arbeitet, Prozesse, pausiert. Sonst gedämpft das Ordner-Symbol.
- **Liste der Gruppe:**
  - Ein Menü im Stil der bestehenden Menüs, unter dem Gruppen-Tab, bedienbar mit der Tastatur wie die anderen Menüs.
  - Pro Tab ein Eintrag in der Reihenfolge der Gruppe: Status- oder Typ-Symbol wie am Tab, Name, ein Haken beim gewählten Tab.
  - Ein Klick zeigt den Tab an; er wird der gewählte Tab der Gruppe.
  - Rechtsklick auf einen Eintrag öffnet das Rechtsklick-Menü dieses Tabs.
  - Unter einem Trenner steht „Neues Terminal“: Es legt einen Tab am Ende der Gruppe an und zeigt ihn an. Er startet mit der Standard-Shell im aktuellen Ordner des gewählten Tabs und bekommt den Namen nach den üblichen Regeln.
- **Rechtsklick-Menü am Tab:**
  - **Neue Gruppe:** Es entsteht eine Gruppe mit diesem Tab an seiner Stelle. Ihr Name ist der Ordnername des Tabs, nach den Regeln der Tab-Namen. Der Gruppen-Tab geht sofort ins Umbenennen.
  - **In Gruppe „…“:** ein Eintrag pro bestehende Gruppe, ohne die eigene. Der Tab kommt ans Ende dieser Gruppe. Das Menü kennt keine Untermenüs, die Einträge stehen also flach im Menü.
  - **Aus Gruppe nehmen:** nur in einer Gruppe. Der Tab steht danach als einzelner Tab rechts neben der Gruppe.
  - **Andere Tabs schliessen:** Bei einem einzelnen Tab schliesst es alle anderen Einträge der Leiste samt Gruppen. In einer Gruppe schliesst es die anderen Tabs dieser Gruppe.
  - **Duplizieren:** Ein Duplikat eines Tabs in einer Gruppe bleibt in der Gruppe, direkt nach dem Original.
  - Die übrigen Einträge bleiben, wie sie sind.
- **Rechtsklick-Menü am Gruppen-Tab:**
  - **Gruppe umbenennen**
  - **Neues Terminal in der Gruppe**, wie in der Liste
  - **Gruppe auflösen:** Die Tabs bleiben offen und stehen in ihrer Reihenfolge als einzelne Tabs an der Stelle der Gruppe.
  - **Gruppe schliessen:** schliesst alle Tabs der Gruppe. Läuft in einem davon etwas, kommt eine gemeinsame Rückfrage wie bei „Andere Tabs schliessen“.
- **Ziehen:**
  - Gruppen-Tabs lassen sich wie Tabs umsortieren; die Gruppe wandert als Ganzes.
  - Ein Tab, der auf die Mitte eines Gruppen-Tabs gezogen wird, kommt ans Ende dieser Gruppe. Den Gruppen-Tab dabei als Ziel hervorheben. Zwischen zwei Einträgen abgelegt, wird wie bisher umsortiert.
  - Ein Tab, der auf einen einzelnen Tab gezogen wird, bildet keine Gruppe. Neue Gruppen entstehen nur über das Menü.
- **Angezeigter Tab:**
  - Wird ein Tab in einer Gruppe angezeigt, auf welchem Weg auch immer (Liste, Hinweis, Befehlspalette, Wiederöffnen), wird er der gewählte Tab seiner Gruppe.
  - Wann ein Tab als angeschaut gilt („fertig“ verschwindet), bleibt gleich: wenn er angezeigt wird. Dass seine Gruppe aktiv ist, genügt nicht.
  - Ein pausierter Claude-Tab setzt seine Session fort, wenn er angezeigt wird, wie bisher.
- **Schliessen:**
  - Schliesst sich der gewählte Tab einer Gruppe, wird der nächste Tab der Gruppe gewählt (sonst der vorherige). War die Gruppe aktiv, wird dieser Tab angezeigt.
  - Schliesst sich der letzte Tab einer Gruppe, verschwindet die Gruppe. Danach gilt die bisherige Regel für den Nachbarn in der Leiste.
  - **Wieder öffnen:** Jeder geschlossene Tab merkt sich seine Gruppe (Kennung, Name, Stelle). Ein wieder geöffneter Tab kommt in seine Gruppe zurück. Gibt es sie nicht mehr, entsteht sie neu mit Namen und Stelle, und weitere wieder geöffnete Tabs derselben Gruppe kommen dazu. So holt `Ctrl+Shift+Z` nach „Gruppe schliessen“ die Gruppe Tab für Tab zurück.
- **Tastatur:**
  - `Ctrl+Tab` / `Ctrl+Shift+Tab`, `Ctrl+PageDown` / `Ctrl+PageUp` und `Ctrl+1` … `Ctrl+9` zählen die Einträge der Leiste. Eine Gruppe zählt dabei als ihr gewählter Tab.
  - Die anderen Tabs einer Gruppe erreicht man über die Liste und die Befehlspalette.
  - `F2` benennt den aktiven Tab um, auch in einer Gruppe; die Gruppe benennt man per Doppelklick oder Menü um.
  - Neue Tastenkürzel gibt es nicht.
- **Befehlspalette:**
  - Tabs in einer Gruppe erscheinen als „Gruppenname › Tabname“. Die Suche trifft auch den Gruppennamen.
  - Neue Befehle für den aktiven Tab: „Neue Gruppe“, „Aus Gruppe nehmen“, „Gruppe umbenennen“, „Gruppe auflösen“. Sie erscheinen nur, wo sie passen.
- **Hinweise:** Ein Klick auf einen Hinweis zeigt den Tab an, auch in einer Gruppe. Der Hinweis nennt den Tab als „Gruppenname › Tabname“.
- **Neue Tabs ausserhalb der Liste:** `+`, `Ctrl+Shift+T` und das Pfeil-Menü legen wie bisher einen einzelnen Tab am Ende der Leiste an, nicht in einer Gruppe.
- **Neustart:** Gruppen, ihre Namen, Reihenfolge, Zugehörigkeit und gewählter Tab werden gespeichert. Nach einem Neustart ist alles wie vorher.
- **Gespeicherter Zustand ohne neue Schema-Version** (wie Ticket 28):
  - Vorschlag: Die Tabs bleiben eine geordnete Liste; ein Tab in einer Gruppe hat eine Gruppen-Kennung.
  - Dazu kommt eine Liste der Gruppen mit Kennung, Name und gewähltem Tab.
  - Die Tabs einer Gruppe stehen in der Liste zusammen; die Stelle der Gruppe ist die ihres ersten Tabs.
  - Gelesen wird tolerant:
    - Ein Tab mit unbekannter Gruppe wird ein einzelner Tab.
    - Verstreute Tabs einer Gruppe rücken an die Stelle des ersten.
    - Eine Gruppe ohne Tabs entfällt.
    - Ein ungültiger gewählter Tab wird der erste der Gruppe.
  - Eine ältere THub liest den Zustand weiter und zeigt alle Tabs einzeln.
- **Die Regeln stehen im Workspace-Kern**, mit Tests wie die übrigen Regeln (Teststelle 1). Die Oberfläche zeigt nur an und schickt Befehle. Den Status einer Gruppe berechnet eine reine Funktion.
- **Doku:**
  - Handbuch: ein Abschnitt „Gruppen“.
  - Spezifikation: User Stories und Präzisierungen aus der Umsetzung.
  - Die Übersicht der Tastenkürzel ändert sich nicht.

## Akzeptanzkriterien

- [x] Tests im Workspace-Kern:
  - neue Gruppe aus einem Tab (Stelle, Name nach Ordner);
  - Tab in eine Gruppe schieben und herausnehmen;
  - die Tabs einer Gruppe bleiben zusammen, auch beim Umsortieren der Gruppe und beim Ziehen eines Tabs auf die Gruppe;
  - gewählter Tab nach Anzeigen, Schliessen des gewählten und des letzten Tabs;
  - Gruppe umbenennen, auflösen und schliessen, mit gemeinsamer Rückfrage;
  - „Andere Tabs schliessen“ einzeln und in einer Gruppe;
  - Duplizieren in einer Gruppe;
  - „Neues Terminal“ in der Gruppe (Ordner, Shell, Stelle);
  - Wiederöffnen in die bestehende Gruppe und in eine neu entstehende;
  - `Ctrl+Tab` und `Ctrl+1` … `Ctrl+9` über die Einträge der Leiste;
  - Speichern und Laden samt den toleranten Fällen;
  - ein Klick auf einen Hinweis zeigt einen Tab in einer Gruppe an.
- [x] Tests für den Status einer Gruppe (reine Funktion), alle Stufen der Reihenfolge.
- [x] Tests für die Einträge der Befehlspalette mit Gruppennamen.
- [x] In der App im Testmodus über CDP auf der eigenen Seite, mit cmd-Tabs:
  - Gruppe über das Rechtsklick-Menü anlegen und umbenennen;
  - zweiten Tab hineinschieben;
  - Liste öffnen und einen Tab wählen; das richtige Terminal ist zu sehen;
  - „Neues Terminal“ in der Liste;
  - Gruppe auflösen;
  - nach einem Neustart der Test-App ist die Gruppe wieder da.
  - Bildschirmfotos hell und dunkel per `PrintWindow`: Leiste mit Gruppe, offene Liste.
- [x] Die bisherigen Tests laufen weiter.
- [x] Handbuch und Spezifikation beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Eine Gruppe aus zwei, drei Tabs anlegen, umbenennen, per Liste zwischen ihnen wechseln. Die Leiste bleibt kurz, der Gruppen-Tab zeigt den gewählten Tab.
- [ ] Einen Tab auf den Gruppen-Tab ziehen; die Gruppe als Ganzes umsortieren.
- [ ] Claude in einem Tab der Gruppe, der gerade nicht gewählt ist: Der Gruppen-Tab zeigt „arbeitet“, dann „wartet“ oder „fertig“. Ein Klick auf den Hinweis zeigt genau diesen Tab.
- [ ] „Gruppe schliessen“ mit einem laufenden Programm darin: eine Rückfrage. Danach holt `Ctrl+Shift+Z` die Gruppe Tab für Tab zurück.
- [ ] THub neu starten: Gruppen, Namen und gewählte Tabs sind wieder da.
- [ ] Aussehen hell und dunkel, auch die offene Liste.

## Hinweise

- **Ausserhalb dieses Tickets:**
  - Gruppen in Gruppen.
  - Farben für Gruppen; THub hat bewusst keine Akzentfarbe.
  - Automatische Gruppen nach Ordner.
  - Tabs in der Liste per Ziehen umsortieren oder aus der Liste herausziehen.
  - Ein eigenes Tastenkürzel für die Liste.
- Das Menü (`src/renderer/popup/Menu.tsx`) kennt keine Untermenüs. Wird für „In Gruppe „…““ eines gebraucht, ist es Teil dieses Tickets; flach genügt.
- Ziehen: `src/renderer/tabs/tabDrag.ts` und `useTabDrag.ts`. Rechtsklick-Menü: `tabMenu.tsx`. Befehlspalette: `src/renderer/palette/paletteEntries.ts`. Zustand: `src/main/workspace/schema.ts`.

## Hinweise aus der Umsetzung

- **Kern** (`src/main/workspace/workspace.ts`): neue Befehle `createGroup`, `moveTabToGroup`, `removeTabFromGroup`, `renameGroup`, `moveGroup`, `dissolveGroup`, `closeGroup` und `newTabInGroup`. `moveTab`, `activateRelativeTab` und `activateTabAt` zählen die Einträge der Leiste; `closeTabs`, `closeOtherTabs`, `duplicateTab` und `reopenClosedTab` kennen die Gruppen.
  - Reine Regeln in `src/main/workspace/groups.ts`: Status der Gruppe (`groupStatus`, Reihenfolge `GROUP_STATUS_ORDER`), Zusammenrücken verstreuter Tabs (`gatherGroups`) und eine Einfügestelle, die keine Gruppe teilt (`entryBoundary`).
  - Die Einträge der Leiste leiten Kern und Oberfläche gleich ab (`src/shared/barEntries.ts`).
  - Der angezeigte Tab ist immer der gewählte Tab seiner Gruppe. Das regelt der Kern an einer Stelle, vor jedem Speichern (`selectShownTab`), also für jeden Weg: Klick, Liste, Hinweis, Palette, Tastenkürzel, Wiederöffnen, Schliessen des Nachbarn.
  - Schliessen: Der Kern nimmt den Tab zuerst aus der Gruppe (`leaveGroup`, die Gruppe wählt dabei den nächsten, sonst den vorherigen Tab) und merkt sich Kennung, Name und Stelle in der Gruppe. Bleibt in der Gruppe keiner, gilt der Nachbar in der Leiste; ist er eine Gruppe, ihr gewählter Tab.
- **Vertrag** (`src/shared/types.ts`): `WorkspaceSnapshot.groups` und das Ereignis `tabs` mit `groups` (`GroupSnapshot`: Kennung, Name, Tabs, gewählter Tab, Status), `TabSnapshot.groupId`, `ClosedTabInfo.groupName`, das Ereignis `groupCreated` (danach geht der Gruppen-Tab ins Umbenennen) und die neuen Befehle.
- **Oberfläche:**
  - Gruppen-Tab `tabs/GroupTab.tsx`, Liste und Menü am Gruppen-Tab `tabs/groupMenu.tsx`, Einträge zu Gruppen im Menü am Tab `tabs/tabMenu.tsx`, Namen „Gruppenname › Tabname“ `tabs/tabLabel.ts`.
  - Ziehen auf die Mitte eines Gruppen-Tabs: `dropPoint` in `tabs/tabDrag.ts`; `useTabDrag.ts` zieht Einträge (Tab oder Gruppe).
  - Das Menü kann jetzt einen Rechtsklick auf einen Eintrag (`context`).
  - Palette `palette/paletteEntries.ts`, Hinweise `toasts/Toasts.tsx`.
- **Gespeicherter Zustand ohne neue Schema-Version**, wie vorgeschlagen:
  - Die Tabs bleiben eine geordnete Liste; ein Tab in einer Gruppe hat `groupId`, die Tabs einer Gruppe stehen zusammen.
  - Dazu `groups: [{ id, name, selectedTabId }]`, immer geschrieben, auch leer.
  - Ein geschlossener Tab hat `group: { id, name, position }` (Stelle in der Gruppe); der Tab selbst hat dort keine `groupId`.
  - Gelesen wird tolerant (`normalizeGroups` in `schema.ts`): Ein Tab mit unbekannter Gruppe wird einzeln, verstreute Tabs rücken an die Stelle des ersten, eine Gruppe ohne Tabs entfällt, ein ungültiger gewählter Tab wird der erste. Steht der aktive Tab in einer Gruppe, ist er ihr gewählter Tab. Eine Gruppe ohne Namen heisst „Gruppe“. Ein geschlossener Tab ohne brauchbare Gruppe kommt einzeln zurück.
- **Ältere THub:** Am Code geprüft: `normalizeV2` und `normalizeTab` bauen den Zustand nur aus Feldern, die sie kennen; `groups`, `groupId` und `group` übergehen sie ohne Fehler. Dazu ein Test gegen eine eingefrorene Kopie des Lesers aus 0.3.1 (`test/workspace/fixtures/schema-0.3.1.ts`, unverändert seit Ticket 28):
  - Er liest alle Tabs einzeln in ihrer Reihenfolge, mit dem aktiven Tab und den geschlossenen Tabs.
  - Was er zurückschreibt, hat keine Gruppen mehr. Die neue THub liest das wieder und zeigt alle Tabs einzeln; die Gruppen sind dann weg.
- **Präzisierungen und Abweichungen:**
  - „Neue Gruppe“ gibt es nur für einen einzelnen Tab, im Menü wie in der Palette. Gruppen in Gruppen sind ausserhalb des Umfangs; ein Tab in einer Gruppe kommt über „Aus Gruppe nehmen“ und danach „Neue Gruppe“ in eine eigene.
  - Name einer neuen Gruppe: der aktuelle Ordner des Tabs wie im Tooltip (also auch nach `cd`), nach den Regeln der Tab-Namen. „ 2“, „ 3“ usw. kommen bei Gleichstand mit einer anderen Gruppe dazu; Tab-Namen zählen dabei nicht.
  - Tooltip am Gruppen-Tab: wie verlangt, dazu als letzte Zeile der Status der Gruppe, wie am Tab.
  - Umbenennen eines Tabs in einer Gruppe (`F2` oder „Umbenennen“ im Menü eines Tabs aus der Liste): Der Gruppen-Tab zeigt dafür gedämpft den Gruppennamen und den Namen des Tabs als Eingabefeld. Das geht auch für einen Tab, der nicht gewählt ist; die Wahl ändert sich dadurch nicht.
  - Die Mitte eines Gruppen-Tabs beim Ziehen ist die mittlere Hälfte (je 25 % Abstand zum Rand, `INTO_GROUP_EDGE`). Näher am Rand wird wie bisher umsortiert. Eine gezogene Gruppe wird nur umsortiert.
  - `moveTab` für einen Tab in einer Gruppe ändert nichts: Er steht nicht selbst in der Leiste.
  - Der Gruppen-Tab hat kein × und schliesst nicht mit der mittleren Maustaste. Geschlossen wird die Gruppe über ihr Menü („Gruppe schliessen“).
  - Wiederöffnen: An die alte Stelle in der Gruppe. Eine neu entstehende Gruppe und ein einzelner Tab kommen an ihre alte Stelle in der Leiste, aber nie mitten in eine andere Gruppe, sondern dahinter. Auch eine aufgelöste Gruppe entsteht so wieder, wie im Ticket verlangt („gibt es sie nicht mehr“).
  - Befehlspalette: „Andere Tabs schliessen“ erscheint in einer Gruppe nur, wenn sie weitere Tabs hat. „Zuletzt geschlossen“ nennt die Gruppe, in die ein Tab zurückkehrt („Gruppenname › Tabname“).
- **Gefundener Fehler beim schnellen Wiederöffnen, behoben** (`useWorkspace.ts`): In der App blieb nach „Gruppe schliessen“ und viermal `Ctrl+Shift+Z` kurz hintereinander der erste wieder geöffnete Tab auf `pending`; seine Shell startete nie (in zwei von zwei Läufen).
  - Ursache: Die Oberfläche bekam das Ereignis „Tab weg“ und gleich danach „Tab wieder da“, bevor React gezeichnet hatte. React zeichnete beide zusammen, die Ansicht des Tabs blieb stehen, und eine neue meldete nie „Ansicht bereit“.
  - Jetzt zeichnet die Oberfläche sofort (`flushSync`), wenn ein Ereignis Tabs wegnimmt. Danach startete jeder Tab, in zwei von zwei Läufen.
  - Derselbe Ablauf ist bei einem einzelnen Tab möglich, der geschlossen und sofort wieder geöffnet wird. Gegen den alten Stand habe ich das nicht eigens geprüft.
- **In der App geprüft** (Testmodus, eigener Datenordner, CDP nur auf der eigenen Seite, `--disable-features=CalculateNativeWinOcclusion`, cmd-Tabs, Skalierung 150 %):
  - „Neue Gruppe“ im Rechtsklick-Menü von „api“: Der Gruppen-Tab ging sofort ins Umbenennen, mit dem Vorschlag „api“; umbenannt in „Kunde X“.
  - „web“ über „In Gruppe „Kunde X““ hinein; „db“ per Ziehen auf die Mitte des Gruppen-Tabs. Beim Ziehen war der Gruppen-Tab hervorgehoben (`drop-into`), danach stand „db“ am Ende der Gruppe.
  - Klick auf den Gruppen-Tab zeigte „api“; ein zweiter Klick öffnete die Liste (Haken bei „api“). „web“ gewählt: Das sichtbare Terminal zeigte den Prompt in `…\kunde\web>`, der Gruppen-Tab „Kunde X · web“.
  - Über den Pfeil „Neues Terminal“: „web 2“ am Ende der Gruppe, mit cmd (Standard-Shell im Testdatenordner) im Ordner von „web“.
  - Tooltip, Menü am Gruppen-Tab und Rechtsklick auf einen Eintrag der Liste (öffnet das Menü dieses Tabs mit „Aus Gruppe nehmen“) geprüft.
  - Neustart mit demselben Datenordner: dieselbe Leiste, Gruppe, Name, gewählter Tab und aktiver Tab.
  - `ping` in „db“, gewählt ist „web 2“: Der Gruppen-Tab zeigte „Prozesse laufen“ (blauer Punkt).
  - „Gruppe schliessen“: eine Rückfrage „4 Tabs schliessen?“, die nur „db“ nannte. Bestätigt, danach holte viermal `Ctrl+Shift+Z` die Gruppe Tab für Tab mit Namen, Stelle und Reihenfolge zurück, und alle Shells liefen.
  - „Gruppe auflösen“: Alle Tabs liefen weiter, einzeln an der Stelle der Gruppe.
  - Bildschirmfotos per `PrintWindow` in hell und dunkel: Leiste mit Gruppe, offene Liste, Menü am Gruppen-Tab, Ziehen auf die Gruppe, Status, Rückfrage. Die Skripte und Bilder liegen nicht im Repo.
- **Tests:**
  - `test/workspace/groups.test.ts` (48, Kern): darin der Hinweis-Klick mit Claude über die echte lokale Schnittstelle, ein pausierter Claude-Tab in einer Gruppe und der Leser von 0.3.1.
  - `test/workspace/groupStatus.test.ts` (7): Status und reine Regeln.
  - `test/renderer/groupEntries.test.ts` (17): Palette (auch zusammen mit dem Kern), Menüs, Liste, Namen der Hinweise.
  - `test/renderer/tabDrag.test.ts`: dazu `dropPoint`.
  - In `test/renderer/paletteCommands.test.ts` kam „Neue Gruppe“ in die erwartete Liste der Befehle.
- Typecheck, `npm test` (59 Dateien, 1256 Tests) und der Build sind grün.
