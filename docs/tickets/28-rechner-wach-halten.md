# 28 – Rechner wach halten

Status: `offen` · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-21: Bisher lässt er in einzelnen Claude-Sessions ein Wachhalte-Skript starten; das soll THub selbst können.
Spezifikation: „Rechner wach halten“ (neu), dazu User Stories 84–89, „Architektur im Überblick“ (Port Wachhalten), „Gespeicherter Zustand“, „Oberfläche (Renderer)“

## Was gebaut wird

- **Port Wachhalten im Kern.** Neuer, schmaler Port mit der wirksamen Stufe `off` | `system` | `display`. Der Kern meldet sie beim Start nach dem Laden des Zustands und bei jeder Änderung, die sie ändert; der Port ist idempotent.
- **Einstellungen** `keepAwake` (Standard aus) und `keepAwakeMode` (`system` oder `display`, Standard `system`) im gespeicherten Zustand, ohne neue Schema-Version. Beenden, Einfrieren und Windows-Abmeldung ändern sie nicht; nach einem Neustart läuft ein eingeschaltetes Wachhalten mit derselben Stufe von selbst wieder.
- **Echter Port im Hauptprozess** über koffi: `PowerCreateRequest` mit dem Grund „THub hält den Rechner wach“, `PowerSetRequest` mit `PowerRequestSystemRequired` und in der Stufe „Rechner und Bildschirm“ zusätzlich `PowerRequestDisplayRequired`, `PowerClearRequest` beim Ausschalten. Beim Wechsel der Stufe zuerst setzen, dann aufheben. **Nicht** `powerSaveBlocker` von Electron (Begründung in der Spezifikation: auf Rechnern mit Modern Standby nicht gesichert).
- **Testmodus:** Mit `THUB_TEST_HIDDEN=1` keine echte Anforderung, nur die Zeile „Testmodus: THub würde jetzt …“ in der Ausgabe.
- **Titelleiste:** links neben dem Zahnrad ein Schalter mit Symbol (Kaffeetasse für „nur Rechner“, Bildschirm für „Rechner und Bildschirm“, gedämpft wenn aus) und rechts davon ein Pfeil mit dem Menü der beiden Stufen. Klick auf den Schalter: ein/aus mit der gewählten Stufe. Wahl im Menü: Stufe setzen und einschalten. Tooltips, Tastaturbedienung und Ausnahme von der Zieh-Fläche wie in der Spezifikation.
- **Befehlspalette:** „Rechner wach halten“, „Rechner und Bildschirm wach halten“ und bei eingeschaltetem Wachhalten „Wachhalten beenden“.
- **Prototyp** (`prototype/`) um Schalter und Pfeil-Menü ergänzen, als Vorlage für Aussehen und Masse.
- **Doku:** Handbuch (Bedienung, Stufen, Grenzen wie Deckel zuklappen und Akkubetrieb) und eine Zeile unter „Was THub kann“ im README.

## Akzeptanzkriterien

- [ ] Kern-Tests mit nachgemachtem Port:
  - ohne gespeicherte Angaben meldet der Kern beim Start „aus“;
  - Einschalten meldet „nur Rechner“ bzw. „Rechner und Bildschirm“ je nach Stufe, Ausschalten „aus“;
  - ein Wechsel der Stufe bei eingeschaltetem Wachhalten meldet die neue Stufe, bei ausgeschaltetem nichts;
  - dieselbe Einstellung zweimal ergibt keine zweite Meldung;
  - nach einem simulierten Neustart (neuer Kern auf demselben Zustand) meldet der Kern beim Start die gespeicherte Stufe;
  - Beenden und Einfrieren lassen die gespeicherte Einstellung eingeschaltet.
- [ ] Ein Test schaltet den echten Port auf „nur Rechner“, dann auf „Rechner und Bildschirm“ und wieder aus; Windows meldet bei keinem Aufruf einen Fehler.
- [ ] In der App im Testmodus (CDP auf der eigenen Seite): Schalter und Pfeil-Menü sind da, Klick und Menüwahl ändern den Zustand, die Testmodus-Zeilen stehen in der Ausgabe, und nach einem Neustart der App mit demselben Datenordner ist der Schalter wieder an, mit derselben Stufe und einer neuen Testmodus-Zeile.
- [ ] Spezifikation, Handbuch und README beschreiben das Verhalten.
- [ ] Typecheck, `npm test` und der Build sind grün.

## Abnahme von Hand

- [ ] Schalter an, Stufe „nur Rechner“: In einer Administrator-PowerShell zeigt `powercfg /requests` THub unter `SYSTEM` mit dem Grund „THub hält den Rechner wach“, unter `DISPLAY` nichts. Nach der eingestellten Zeit ohne Eingabe geht der Bildschirm aus, der Rechner mit Netzteil aber nicht in den Energiesparmodus.
- [ ] Stufe „Rechner und Bildschirm“: `powercfg /requests` zeigt THub unter `SYSTEM` und `DISPLAY`; der Bildschirm bleibt an. Dabei notieren, ob die Sperre nach Inaktivität ausbleibt.
- [ ] Schalter aus: `powercfg /requests` zeigt THub nicht mehr.
- [ ] Schalter an, THub beenden: THub verschwindet aus `powercfg /requests`. THub wieder starten: Der Schalter ist an, mit derselben Stufe, und THub steht wieder in `powercfg /requests`.
- [ ] Pfeil-Menü und Befehlspalette schalten wie beschrieben; Tooltips stimmen; das Fenster lässt sich neben dem Schalter weiterhin ziehen.
