# 12 – Claude-Sessions nach einem Neustart fortsetzen

Status: `erledigt` (2026-11-20, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 08, 11
User Stories: 38, 46, 59–64
Spezifikation: „Wiederherstellen“ (Claude-Tabs), „Claude-Status: Zustandsautomat pro Tab“ (Ende-Meldung, fehlgeschlagenes Fortsetzen, Einfrieren)

## Was gebaut wird

- **Welche Claude-Tabs fortgesetzt werden:** solche mit Session-Kennung, die entweder einen Prompt erlebt haben oder unbestätigt sind (Sicherheitsnetz ohne Hooks).
- Alle anderen Claude-Tabs (keine Kennung, oder bestätigt, aber nie ein Prompt) kommen als normales Terminal im Ordner der Session zurück, ohne Verlauf.
- **Zuletzt aktiver Tab ist ein fortzusetzender Claude-Tab:** Er startet sofort. Die Shell läuft im Ordner der Session (Rückfallkette, falls er fehlt), mit dem Startbefehl „Starter mit `--resume <Kennung>`“. Kein alter Verlauf.
- **Andere fortzusetzende Claude-Tabs** sind **pausiert** (graues Pause-Symbol am Tab, gemäss Prototyp): Es gibt noch keine Ansicht und keinen Prozess. Beim ersten Anzeigen starten sie wie oben. Ein pausierter Tab übersteht weitere Neustarts unverändert.
- Ist ein normaler Tab zuletzt aktiv, sind alle fortzusetzenden Claude-Tabs pausiert.
- **Claude-Tabs bekommen keinen Verlauf:** weder gesichert noch wiederhergestellt.
- **Fortsetzen schlägt fehl:** Ende-Meldung ohne vorheriges `SessionStart` und mit Exit-Code ≠ 0 nach einem von THub gestarteten Fortsetzen → Hinweis im Terminal „Claude-Session konnte nicht fortgesetzt werden“, der Tab wird ein normales Terminal und bleibt offen. Claude schickt dabei etwa 1,5 Sekunden vorher `SessionEnd` mit Grund `other`; dieses Ereignis allein macht den Tab noch nicht normal, erst die Ende-Meldung entscheidet.
- Claude läuft nach `--resume <Kennung>` im **aktuellen** Ordner, deshalb startet die Shell zwingend im Ordner der Session.

## Akzeptanzkriterien

- [ ] Kern-Tests mit simuliertem Neustart:
  - der zuletzt aktive, fortzusetzende Claude-Tab erzeugt nach „Ansicht bereit“ einen Startauftrag im Session-Ordner mit Startbefehl „Starter mit `--resume <Kennung>`“;
  - fehlt der Session-Ordner, greift die Rückfallkette;
  - andere Claude-Tabs sind pausiert ohne Startauftrag, erzeugen ihn beim Anzeigen und bleiben über einen weiteren Neustart pausiert;
  - ein normaler Tab als letzter aktiver führt zu keinem sofortigen Claude-Start;
  - eine bestätigte Session ohne Prompt wird nicht fortgesetzt, ein Tab ohne Kennung ebenfalls nicht;
  - eine unbestätigte Session (keine Hooks) wird fortgesetzt;
  - fehlgeschlagenes Fortsetzen (erst `SessionEnd(other)`, dann Ende-Meldung mit Exit-Code 1) ergibt einen normalen Tab mit Hinweis; Ende mit Exit-Code 0 ohne Hooks gibt keinen Hinweis;
  - für Claude-Tabs wird kein Verlauf gespeichert;
  - Einfrieren: App beenden, danach `SessionEnd` `other` und Ende der Shell → nach dem Neustart wird fortgesetzt.

## Abnahme von Hand (mit echtem Claude Code)

- [ ] Zwei Claude-Tabs und ein normaler Tab, Fenster mit `×` schliessen, neu starten → der aktive Claude-Tab läuft sofort mit dem bisherigen Gespräch weiter; der andere ist pausiert und startet beim Anklicken.
- [ ] Nach `/exit` und einem Neustart kommt der Tab als normales Terminal mit Verlauf zurück.
- [ ] Windows mit offenem Claude-Tab neu starten → die Session wird fortgesetzt.
- [ ] **Story 38:** In einem Testordner `.claude/settings.local.json` mit `"disableAllHooks": true` anlegen, dort `claude` starten, etwas schreiben, THub neu starten → die Session wird fortgesetzt, nur ohne Status. (Der Spike hat das Verhalten von Claude bestätigt; hier wird es mit der echten App abgenommen.)
