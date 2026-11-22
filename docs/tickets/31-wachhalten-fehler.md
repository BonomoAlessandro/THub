# 31 – Wachhalten: Fehler zeigen und ausschalten

Status: `erledigt` (2026-11-22, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-22. Scheitert heute eine Energie-Anforderung (Windows lehnt ab, koffi lädt nicht), steht der Fehler nur in der Ausgabe des Hauptprozesses, die in der installierten App niemand sieht. Der Schalter bleibt dabei auf „an“, obwohl Windows den Rechner nicht wach hält.
Spezifikation: „Rechner wach halten“ → „Fehler“ (geändert), dazu User Story 94, „Hinweise im Fenster“

## Was gebaut wird

- **Der Port meldet, ob es geklappt hat.** Statt still zu scheitern, meldet der Port Wachhalten dem Kern, wenn eine Stufe nicht gesetzt werden konnte, mit dem Fehler (etwa „PowerSetRequest(system): Windows-Fehler 5“ oder „koffi lässt sich nicht laden“). Vorschlag: `set(level)` liefert ein Versprechen, das bei einem Fehler zurückweist.
- **Scheitert das Einschalten oder ein Wechsel der Stufe** (beim Klick, im Pfeil-Menü, in der Palette oder beim Start mit gespeichertem „an“):
  - Der Port hebt auf, was er dabei schon gesetzt hatte (etwa „Rechner“, wenn danach „Bildschirm“ scheitert), damit nichts halb eingeschaltet bleibt.
  - Der Kern schaltet das Wachhalten aus (`keepAwake: false`) und speichert das. Der Schalter zeigt „aus“, auch nach einem Neustart. Die gewählte Stufe bleibt.
  - Unten rechts erscheint ein Hinweis (siehe unten).
- **Scheitert das Aufheben** (Ausschalten, Wechsel auf „nur Rechner“): Die Einstellung zeigt, was der Nutzer gewählt hat, und es erscheint ein Hinweis, dass Windows den Rechner bzw. Bildschirm womöglich weiter wach hält, bis THub beendet wird. Mit dem Ende von THub gibt Windows die Anforderung sicher frei.
- **Nur der aktuelle Stand zählt:** Kommt ein Fehler für eine Stufe zurück, die inzwischen nicht mehr gewünscht ist (der Nutzer hat schon wieder umgeschaltet), schaltet der Kern nichts aus und zeigt keinen Hinweis.
- **Hinweis unten rechts**, im Stil der bestehenden Hinweise, aber ohne Tab und **deutlich als Fehler markiert**:
  - **Kennzeichnung als Fehler:** statt eines Status-Punkts ein Fehlersymbol (Kreis mit Ausrufezeichen) in der Fehlerfarbe `--danger` des Designs (dunkel `#f2555a`, hell `#dc2626`, wie beim Gefahr-Knopf „Schliessen“), dazu ein Rand der Karte in derselben Farbe. So unterscheidet er sich auf einen Blick von „wartet“, „fertig“ und „offene Punkte“. Für Screenreader `role="alert"`, damit er sofort vorgelesen wird.
  - Beide Fälle (Einschalten gescheitert, Aufheben gescheitert) sind Fehler und sehen gleich aus; nur Titel und Grund unterscheiden sich.
  - Titel „Rechner wach halten ausgeschaltet“ bzw. beim Aufheben „Wachhalten liess sich nicht beenden“; darunter in einer Zeile der Grund in einfachen Worten („Windows hat die Anforderung abgelehnt (Fehler 5).“, „Die Verbindung zu Windows liess sich nicht herstellen.“).
  - Er bleibt stehen, bis der Nutzer ihn mit `×` oder einem Klick schliesst; ein Klick springt in keinen Tab. Er erscheint unabhängig von der Einstellung „Hinweise im Fenster“ (die gilt für Claude) und kommt nach einem Neustart nicht wieder.
  - Scheitert es mehrmals hintereinander, steht nur ein Hinweis da, mit dem letzten Grund.
- **Andere Systeme als Windows mit 64 Bit:** Der Port meldet beim Einschalten „wird auf diesem System nicht unterstützt“, mit demselben Ablauf (aus, Hinweis), statt still nichts zu tun.
- **Testmodus:** Mit `THUB_TEST_HIDDEN=1` und zusätzlich `THUB_TEST_KEEPAWAKE_FAIL=1` scheitert jede Anforderung im Testmodus mit einem festen Grund, damit sich Hinweis und Ausschalten über CDP prüfen lassen.
- Der Fehler steht weiterhin auch in der Ausgabe des Hauptprozesses.
- **Prototyp** (`prototype/`): den Fehler-Hinweis ergänzen (auslösbar über die Steuerleiste), als Vorlage für Aussehen und Masse.
- **Doku:** Spezifikation („Fehler“, Hinweise ohne Tab, Kennzeichnung als Fehler), Handbuch (was der Hinweis bedeutet, wie man es erneut versucht: Schalter wieder einschalten), `docs/entwicklung.md` (Vertrag des Ports, Testmodus-Variable).

## Akzeptanzkriterien

- [x] Kern-Tests mit nachgemachtem Port, der auf Wunsch scheitert:
  - scheitert das Einschalten, ist das Wachhalten danach aus (auch im gespeicherten Zustand), die Stufe unverändert, und es steht genau ein Hinweis ohne Tab da;
  - dasselbe beim Start mit gespeichertem „an“; nach einem weiteren Neustart bleibt es aus, ohne neuen Hinweis;
  - scheitert ein Wechsel der Stufe bei eingeschaltetem Wachhalten, ist es danach aus;
  - scheitert das Aufheben, bleibt die Einstellung wie gewählt, und es erscheint der Hinweis zum Aufheben;
  - ein Fehler für eine nicht mehr gewünschte Stufe ändert nichts und zeigt keinen Hinweis;
  - mehrere Fehler hintereinander ergeben einen Hinweis; `×` schliesst ihn; „Hinweise im Fenster: aus“ unterdrückt ihn nicht;
  - der Hinweis ist im Schnappschuss für die Oberfläche als Fehler gekennzeichnet (eigene Art, nicht „wartet“, „fertig“ oder „offene Punkte“).
- [x] Port-Tests mit nachgemachtem kernel32: Scheitert „Bildschirm“ nach „Rechner“, ist danach nichts mehr gesetzt, und der Fehler kommt beim Kern an; lädt koffi nicht, ebenso.
- [x] In der App im Testmodus mit `THUB_TEST_KEEPAWAKE_FAIL=1` (CDP auf der eigenen Seite): Klick auf den Schalter → Schalter wieder „aus“, Hinweis unten rechts mit Grund, als Fehler markiert (Fehlersymbol, Rand in `--danger`, `role="alert"`); nach einem Neustart mit demselben Datenordner ist der Schalter aus und kein Hinweis da.
- [x] Ohne `THUB_TEST_KEEPAWAKE_FAIL` verhält sich alles wie in Ticket 28 (dessen Prüfungen laufen weiter).
- [x] Spezifikation, Handbuch und `docs/entwicklung.md` beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] Der Hinweis ist in hell und dunkel sofort als Fehler zu erkennen (rotes Fehlersymbol, roter Rand) und passt sonst zu den übrigen Hinweisen; `×` und Klick schliessen ihn. (In der App lässt er sich nicht gezielt auslösen, die Testmodus-Variable wirkt nur im versteckten Testfenster; ansehen lässt er sich im Prototyp, Steuerleiste „Wachhalten scheitert“.)
- [ ] Im normalen Betrieb ändert sich nichts: Schalter an, `powercfg /requests` zeigt THub wie bisher.

## Hinweise

- Ausserhalb dieses Tickets: Warnen bei den bekannten Grenzen, die kein Fehler sind (Deckel zuklappen, Akkubetrieb mit Modern Standby, `powercfg /requestsoverride`); dort meldet Windows THub nichts. Ebenso eine Protokolldatei.

## Hinweise aus der Umsetzung

- Vertrag: `KeepAwake.set(level)` liefert ein Versprechen und weist mit `KeepAwakeError` (`phase`, `reason`, `code`) zurück (`src/main/workspace/ports.ts`). Der echte Port (`src/main/keepAwake.ts`) hebt nach einem gescheiterten Setzen alles auf; Windows-Fehler kommen als `Win32Error` mit dem Code von `GetLastError`.
- Kern: `keepAwakeFailed` in `workspace.ts`; der Hinweis ist eine eigene Art `keepAwakeError` im `ToastBoard`, ohne Tab. Ein Klick (`openToast`) schliesst ihn nur.
- Oberfläche: `ErrorToastCard` in `src/renderer/toasts/Toasts.tsx` (Klasse `toast error`, `role="alert"`, `data-toast-kind="keepAwakeError"`), Wortlaut aus `keepAwakeErrorText.ts`, Fehlersymbol `AlertIcon`; Farbe `--danger`.
- Tests: `test/workspace/keepAwake.test.ts` (Fehler), `test/main/keepAwake.test.ts` (Port, Testmodus), `test/renderer/keepAwakeErrorText.test.ts`. Der Test von Ticket 28 „wirft der Port, … die Einstellung bleibt“ hielt das alte Verhalten fest und prüft jetzt das neue.
- Geprüft in der App im Testmodus mit `THUB_TEST_KEEPAWAKE_FAIL=1` über CDP (18 Prüfungen): Klick → Schalter wieder aus, Hinweis mit `role="alert"`, Symbol und Rand in `--danger` (berechnete Farbe gleich der des Tokens), Titel, Grund „Fehler 5“ und Folge; zweiter Fehler über das Pfeil-Menü → weiterhin genau ein Hinweis, Stufe „Bildschirm“ bleibt; Klick schliesst ihn; nach dem Neustart aus, ohne Hinweis und ohne neuen Versuch. Bildschirmfotos hell und dunkel. Die Prüfungen von Ticket 28 (ohne Fehler) laufen weiter (24 von 24).
- Im versteckten Testfenster endet die Animation beim Hinausgleiten nicht; ein geschlossener Hinweis bleibt dort mit der Klasse `out` im DOM. Das betrifft alle Hinweise und ist kein Fehler der App.
