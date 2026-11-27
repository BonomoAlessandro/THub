# 40 – Gruppen-Tab zeigt den Status des gewählten Tabs

Status: `ready-for-agent` · Typ: AFK
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

- [ ] Tests der reinen Funktion:
  - Der Status ist für jeden möglichen Status des gewählten Tabs genau dieser;
  - der gewählte Tab ruht, ein anderer wartet → Status ruht, Punkt orange;
  - ein anderer fertig → Punkt grün; einer wartet und einer ist fertig → orange;
  - der gewählte Tab wartet und ein anderer ist fertig → Status wartet, Punkt grün;
  - andere Tabs arbeiten, haben Prozesse oder sind pausiert → kein Punkt;
  - eine Gruppe mit einem einzigen Tab hat nie einen Punkt.
- [ ] Kern-Tests mit echten HTTP-Hook-Ereignissen, zwei Claude-Tabs in einer Gruppe:
  - Der nicht gewählte Tab bekommt `UserPromptSubmit`: Der Gruppen-Tab zeigt den Status des gewählten Tabs, ohne Punkt.
  - Danach kommt `PermissionRequest`: Punkt orange.
  - Danach `Stop` im nicht sichtbaren Tab: Punkt grün.
  - Wird der Tab angezeigt (und damit gewählt), verschwindet der Punkt, und das Symbol folgt dem neu gewählten Tab.
- [ ] Ein Test der Oberfläche (wie `test/renderer/groupEntries.test.ts`) deckt den Tooltip und die Beschriftung des Pfeils mit und ohne Punkt ab.
- [ ] In der App im Testmodus über CDP auf der eigenen Seite:
  - Zwei Claude-Tabs in einer Gruppe, gesteuert über Meldungen an die Schnittstelle der Test-App wie in `docs/entwicklung.md` („Testmodus“).
  - Das Symbol folgt dem gewählten Tab, und der Punkt erscheint und verschwindet wie oben.
  - Bildschirmfotos hell und dunkel per `PrintWindow`: Gruppen-Tab mit orangem und mit grünem Punkt, aktiv und nicht aktiv.
- [ ] Die bisherigen Tests laufen weiter. Tests, die den alten dringendsten Status erwarten, werden auf die neue Regel umgestellt.
- [ ] Handbuch, Spezifikation und `docs/abnahme.md` beschreiben das Verhalten.
- [ ] Typecheck, `npm test` und der Build sind grün.

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
