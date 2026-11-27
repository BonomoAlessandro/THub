# 40 – Gruppen-Tab zeigt den Status des gewählten Tabs

Status: `erledigt` (2026-11-27, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: 37 (beide ändern Status-Regeln; erst nach dem Zusammenführen von 37 beginnen)
Herkunft: Wunsch des Nutzers am 2026-11-27. In einer Gruppe mit zwei oder mehr Claude-Sessions soll der angezeigte Status immer dem der gewählten Session der Gruppe entsprechen.
Spezifikation: User Story 102 (geändert), „Oberfläche (Renderer)“ → „Tab-Gruppen (Ticket 36)“, Punkt „Status“ (geändert)

## Entscheidung

Der Nutzer hat am 2026-11-27 gewählt:
- **Das Status-Symbol des Gruppen-Tabs ist das des gewählten Tabs**, nicht mehr der dringendste Status aller Tabs der Gruppe (bisher Ticket 36).
- **Kleiner Punkt am Pfeil** ▾ für die anderen Tabs:
  - Er erscheint, wenn ein anderer Tab der Gruppe auf dich wartet (orange) oder fertig ist (grün).
  - Wartet einer und ist ein anderer fertig, gilt orange.
  - Andere Zustände (arbeitet, Prozesse laufen, pausiert) ergeben keinen Punkt.

```
[▤ Kunde X · api  3 ▾•]     Symbol links: Status von „api“ (gewählt)
                             Punkt am Pfeil: ein anderer Tab wartet (orange) oder ist fertig (grün)
```

Verworfen: **nichts zusätzlich**, also nur Hinweise und die Liste der Gruppe.

## Was gebaut wird

- **Status-Symbol am Gruppen-Tab:** der angezeigte Status des gewählten Tabs, mit denselben Symbolen wie an einem Tab (Vorrang wie bisher: pausiert → wartet → arbeitet → fertig → Prozesse laufen → nichts). Ruht der gewählte Tab, steht wie bisher gedämpft das Ordner-Symbol da. Das gilt für jede Art von Tab, nicht nur für Claude-Tabs.
- **Punkt am Pfeil:**
  - Er gilt nur für die anderen Tabs der Gruppe, nie für den gewählten.
  - Er ist klein und ruhig, ohne Animation, in den Farben der Status-Symbole „wartet“ und „fertig“. Hell und dunkel nach den bestehenden Design-Tokens.
  - Der Pfeil bleibt gleich gross und an derselben Stelle, und der Gruppen-Tab wird nicht breiter.
  - Er verschwindet, sobald kein anderer Tab mehr wartet oder fertig ist, etwa wenn der Tab angezeigt wird.
- **Tooltip am Gruppen-Tab:** Die letzte Zeile nennt den Status des gewählten Tabs. Gibt es einen Punkt, steht darunter, welche anderen Tabs warten oder fertig sind, mit ihrem Namen (z. B. „web wartet auf dich“).
- **Barrierefreiheit:** Die Beschriftung des Pfeils nennt den Grund des Punkts (z. B. „Liste öffnen, ein anderer Tab wartet auf dich“).
- **Unverändert bleiben:**
  - die Liste der Gruppe mit dem Status-Symbol jedes Tabs;
  - die Hinweise unten rechts für Tabs, die nicht sichtbar sind;
  - wann ein Tab als angeschaut gilt.
- **Kern:**
  - Den Status einer Gruppe und den Punkt berechnet eine reine Funktion in `src/main/workspace/groups.ts`, die `groupStatus` und `GROUP_STATUS_ORDER` ersetzt. Eingabe ist der Status des gewählten Tabs und die Status der anderen Tabs, Ergebnis ist der Status und der Punkt (keiner, wartet, fertig).
  - Der Vertrag (`GroupSnapshot` in `src/shared/types.ts`) bekommt dafür ein Feld, und der Kommentar zu `status` wird angepasst.
- **Oberfläche:** `src/renderer/tabs/GroupTab.tsx` zeichnet den Punkt am Pfeil.
- **Doku:**
  - Handbuch, Abschnitt „Gruppen“ (Punkt „Status“).
  - Spezifikation, Präzisierungen aus der Umsetzung.
  - In `docs/abnahme.md` den Punkt aus Ticket 36 anpassen, der heute „arbeitet, dann wartet oder fertig“ am Gruppen-Tab für einen nicht gewählten Tab erwartet. Dazu einen Abschnitt für Ticket 40.

## Akzeptanzkriterien

- [x] Tests der reinen Funktion:
  - Der Status ist für jeden möglichen Status des gewählten Tabs genau dieser;
  - der gewählte Tab ruht, ein anderer wartet → Status ruht, Punkt orange;
  - ein anderer fertig → Punkt grün; einer wartet und einer ist fertig → orange;
  - der gewählte Tab wartet und ein anderer ist fertig → Status wartet, Punkt grün;
  - andere Tabs arbeiten, haben Prozesse oder sind pausiert → kein Punkt;
  - eine Gruppe mit einem einzigen Tab hat nie einen Punkt.
- [x] Kern-Tests mit echten HTTP-Hook-Ereignissen, zwei Claude-Tabs in einer Gruppe:
  - Der nicht gewählte Tab bekommt `UserPromptSubmit`: Der Gruppen-Tab zeigt den Status des gewählten Tabs, ohne Punkt.
  - Danach kommt `PermissionRequest`: Punkt orange.
  - Danach `Stop` im nicht sichtbaren Tab: Punkt grün.
  - Wird der Tab angezeigt (und damit gewählt), verschwindet der Punkt, und das Symbol folgt dem neu gewählten Tab.
- [x] Ein Test der Oberfläche (wie `test/renderer/groupEntries.test.ts`) deckt den Tooltip und die Beschriftung des Pfeils mit und ohne Punkt ab.
- [x] In der App im Testmodus über CDP auf der eigenen Seite:
  - Zwei Claude-Tabs in einer Gruppe, gesteuert über Meldungen an die Schnittstelle der Test-App wie in `docs/entwicklung.md` („Testmodus“).
  - Das Symbol folgt dem gewählten Tab, und der Punkt erscheint und verschwindet wie oben.
  - Bildschirmfotos hell und dunkel per `PrintWindow`: Gruppen-Tab mit orangem und mit grünem Punkt, aktiv und nicht aktiv.
- [x] Die bisherigen Tests laufen weiter. Tests, die den alten dringendsten Status erwarten, werden auf die neue Regel umgestellt.
- [x] Handbuch, Spezifikation und `docs/abnahme.md` beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Eine Gruppe mit zwei Claude-Sessions; in der nicht gewählten arbeitet Claude. Der Gruppen-Tab zeigt den Status der gewählten Session.
- [ ] Die nicht gewählte Session fragt nach oder wird fertig: ein oranger bzw. grüner Punkt am Pfeil, dazu wie bisher ein Hinweis. Nach dem Wechsel auf diese Session ist der Punkt weg.
- [ ] Aussehen hell und dunkel, aktiv und nicht aktiv.

## Hinweise

- **Ausserhalb dieses Tickets:** Punkte für andere Zustände, eine Zahl am Pfeil, Animation des Punkts.
- Es gelten die Spielregeln aus [`README.md`](README.md).
- Fundstellen:
  - Status der Gruppe: `src/main/workspace/groups.ts`, Aufruf in `src/main/workspace/workspace.ts` (Einträge der Leiste);
  - Vertrag: `src/shared/types.ts`;
  - Gruppen-Tab: `src/renderer/tabs/GroupTab.tsx`;
  - Tests: `test/workspace/groupStatus.test.ts` und `test/workspace/groups.test.ts`.

## Hinweise aus der Umsetzung

- **Kern:**
  - Reine Regel in `src/main/workspace/groups.ts`: `groupDisplay(selected, others)` ersetzt `groupStatus` und `GROUP_STATUS_ORDER`. Ergebnis ist genau der Status des gewählten Tabs und der Punkt: `waiting`, wenn ein anderer Tab wartet, sonst `finished`, wenn einer fertig ist, sonst `none`.
  - `src/main/workspace/workspace.ts` (`groupSnapshots`): der angezeigte Status des gewählten Tabs und der übrigen Tabs der Gruppe. Fehlte der gewählte Tab in der Gruppe, gälte wie beim Laden der erste; das kommt nach `normalizeGroups` und `leaveGroup` nicht vor.
- **Vertrag** (`src/shared/types.ts`): `GroupSnapshot.dot` mit dem Typ `GroupDot` (`waiting`, `finished`, `none`); der Kommentar zu `status` nennt den gewählten Tab.
- **Oberfläche:**
  - `tabs/GroupTab.tsx` zeichnet den Punkt als `<span class="grp-dot" data-s="…">` im Pfeil (`.grp-list`), stumm für Bildschirmleser. Der Gruppen-Tab bekommt dafür die Tabs der Gruppe (`members`).
  - Texte als reine Funktionen in `tabs/groupLabels.ts`: Zeilen des Tooltips (`groupTipRows`, `TabBar.tsx` zeichnet sie) und Beschriftung des Pfeils (`groupListLabel`).
  - Kommentar zu `GroupIcon` in `tabs/TabIcon.tsx`.
- **Aussehen des Punkts** (`styles/app.css`, `.grp-dot`):
  - 6 × 6 CSS-Pixel, rund, bei 150 % also 9 Gerätepixel. Ohne Animation.
  - Er liegt absolut oben rechts im 20-px-Feld des Pfeils, je 1 px vom oberen und vom rechten Rand, mit gut einem Pixel Abstand zur rechten Spitze des Pfeils. Die erste Fassung (2 px vom Rand) berührte die Spitze; nach den Bildschirmfotos um 1 px nach oben rechts verschoben.
  - Farben der Status-Symbole: orange `--st-waiting` (hell `#ea580c`, dunkel `#fb923c`), grün `--st-finished` (hell `#16a34a`, dunkel `#4ade80`).
- **Präzisierungen und Abweichungen:**
  - **Beschriftung des Pfeils:** Der Grundtext bleibt „Tabs der Gruppe“ wie seit Ticket 36 (passend zur Liste „Tabs der Gruppe „…““). Mit Punkt kommt der Grund dazu: „Tabs der Gruppe, ein anderer Tab wartet auf dich“ bzw. „…, ein anderer Tab ist fertig“, bei mehreren „2 andere Tabs warten auf dich“ bzw. „… sind fertig“. Das Ticket nannte als Beispiel „Liste öffnen, …“.
  - **Tooltip:** Die Zeilen unter „Andere“ kommen nur mit Punkt: zuerst die wartenden, dann die fertigen Tabs, je in der Reihenfolge der Gruppe, etwa „web wartet auf dich“ und „db ist fertig“.
  - **Gewählter Tab:** Er ergibt nie einen Punkt, auch wenn er wartet oder fertig ist; das zeigt das Symbol.
  - **Ticket 37:** Dessen Test „der Gruppen-Tab zeigt „arbeitet“, wenn ein Tab der Gruppe nur wegen eines Agenten arbeitet“ erwartete die alte Regel. Er prüft jetzt den gewählten Tab (angezeigt ist ein Tab ausserhalb der Gruppe). Dazu kam ein Test, dass bei einem nicht gewählten Tab der grüne Punkt erst nach der Frist kommt. Den Punkt aus Ticket 37 in `docs/abnahme.md` habe ich ebenfalls angepasst.
  - Weitere umgestellte Tests: „Gruppe schliessen“ mit laufendem Programm (Prozesse in api, gewählt ist db: Ordner-Symbol, kein Punkt) und der pausierte Claude-Tab in einer Gruppe (pausiert ergibt keinen Punkt).
- **In der App geprüft** (Testmodus, eigener Datenordner, Debug-Port zufällig, `--disable-features=CalculateNativeWinOcclusion`, CDP nur auf der eigenen Seite, Meldungen nur an die Schnittstelle der Test-App, Zeitgrenze 210 s mit Watchdog, Skalierung 150 %):
  - Zwei cmd-Tabs „api“ und „web“ in der Gruppe „Kunde X“ (umbenannt über das Eingabefeld des Gruppen-Tabs), daneben „notes“. Beide über `/claude/launch` und `SessionStart` zu Claude-Tabs gemacht, danach Hooks aus `spikes/claude-hooks/samples/`.
  - `UserPromptSubmit` in web: Symbol von api (ruht, Ordner), kein Punkt.
  - `PreToolUse` und `PermissionRequest`: oranger Punkt, Beschriftung „Tabs der Gruppe, ein anderer Tab wartet auf dich“, Hinweis „wartet“ wie bisher.
  - Pfeil und Gruppen-Tab mit und ohne Punkt gleich: Pfeil 20 × 20 px an derselben Stelle, Pfeil-Symbol 13 × 13 px, Gruppen-Tab 200 × 34 px. Keine Animation am Punkt.
  - Tooltip über ein CDP-Mausereignis an die eigene Seite: „Status Ruht“, darunter „Andere: web wartet auf dich“.
  - `PostToolUse` und `Stop`: grüner Punkt, ob die Gruppe aktiv ist oder nicht. `UserPromptSubmit` in api: Symbol „arbeitet“ mit grünem Punkt.
  - web angezeigt: Gruppen-Tab „Kunde X · web“, Symbol ruht, kein Punkt. Weil das Testfenster nie den Fokus hat, meldete die Seite dem eigenen Kern vorher „im Vordergrund“ (`windowForeground`), damit web als angeschaut gilt wie beim Nutzer.
  - Danach `Stop` in api, das jetzt nicht gewählt ist: grüner Punkt.
  - Bildschirmfotos per `PrintWindow` hell und dunkel: ohne Punkt; oranger Punkt aktiv und nicht aktiv; Tooltip mit Punkt; grüner Punkt nicht aktiv und aktiv; „arbeitet“ mit grünem Punkt; nach dem Wechsel ohne Punkt. Dazu vergrösserte Ausschnitte über CDP. Die Skripte und Bilder liegen nicht im Repo.
- **Tests:**
  - `test/workspace/groupStatus.test.ts` (10): die reine Regel nach den Akzeptanzkriterien, dazu die bisherigen reinen Regeln.
  - `test/workspace/groups.test.ts` (49): zwei Claude-Tabs über die echte Schnittstelle (Symbol, oranger und grüner Punkt, Wechsel), Hinweis-Klick mit Punkt; geprüft wird auch, dass das letzte Ereignis `tabs` an die Oberfläche dasselbe sagt.
  - `test/workspace/agentStatus.test.ts` (29): Agenten im gewählten und im nicht gewählten Tab.
  - `test/renderer/groupEntries.test.ts` (21): Tooltip und Beschriftung des Pfeils mit und ohne Punkt, mehrere andere Tabs, der Gruppen-Tab als HTML (`renderToStaticMarkup`) mit dem Punkt im Pfeil.
  - Gegenprobe: Mit dem alten Verhalten (Punkt nie, Status vom wartenden Tab) schlagen 7 der neuen Tests in `test/workspace/` fehl.
- Typecheck, `npm test` (60 Dateien, 1294 Tests) und der Build sind grün.
