# 05 – Ordner, Tab-Namen und Einstellungsdialog

Status: `ready-for-agent` · Typ: AFK
Blockiert durch: 04
User Stories: 1–5, 12, 13, 75 (Standardordner), 79
Spezifikation: „Tab-Namen“, „Gespeicherter Zustand“ (Einstellungen, zuletzt benutzte Ordner), „Oberfläche (Renderer)“

## Was gebaut wird

- **Optionaler Standardordner:** Ohne Einstellung gilt der Benutzerordner. Eine Änderung gilt nur für neue Tabs.
- **Pfeil-Menü neben `+`** mit „Neues Terminal in …“: die zuletzt benutzten Ordner und „Ordner wählen …“ (Ordner-Dialog).
- **Zuletzt benutzte Ordner** pflegt der Kern: Startordner jedes neu angelegten Tabs und der zuletzt aktive Ordner eines Tabs beim Schliessen; höchstens acht, neueste zuerst, ohne Doppelte, nur existierende Ordner werden angezeigt.
- **Automatische Tab-Namen** nach der Regel der Spezifikation (Ordnername, Benutzername, Laufwerksbuchstabe, „ 2“ bei Gleichstand). Ein von Hand vergebener Name wird nie automatisch überschrieben.
- **Einstellungsdialog** über das Zahnrad in der Titelleiste, zunächst mit dem Feld „Standardordner“: „Ändern …“ öffnet den Ordner-Dialog von Windows (Explorer), „Zurücksetzen“ leert das Feld. Spätere Tickets ergänzen weitere Felder.

## Akzeptanzkriterien

- [ ] Kern-Tests:
  - Namen aus dem Ordner (normaler Ordner, Benutzerordner, Laufwerk) und bei Gleichstand; der Name bleibt nach dem Umbenennen fest.
  - Ein leerer Standardordner heisst Benutzerordner; eine Änderung des Standardordners betrifft bestehende Tabs nicht.
  - Zuletzt benutzte Ordner: Reihenfolge, keine Doppelten, höchstens acht, Ordner beim Schliessen kommt hinzu, die Liste übersteht einen Neustart, nicht mehr existierende Ordner werden nicht angeboten.
- [ ] Übernommene Tabs aus Version 1 behalten ihre Namen.

## Abnahme von Hand

- [ ] Pfeil-Menü und Einstellungsdialog sehen aus wie im Prototyp.
- [ ] „Neues Terminal in …“ → Ordner wählen → der Tab startet dort und heisst wie der Ordner; der Ordner steht danach oben in der Liste.
