# 02 – Klickbarer Design-Prototyp

Status: `ready-for-human` · Typ: HITL
Blockiert durch: –
User Stories: 17, 18, 41–55, 69–71, 75–78
Spezifikation: „Oberfläche (Renderer)“, „Weitere Hinweise → Ablauf“

## Was gebaut wird

Ein **klickbarer Prototyp im Browser**, an dem der Look von TermHub abgestimmt wird, bevor die echte Oberfläche entsteht. Die Terminals sind nachgemacht, es laufen keine echten Shells. Der Prototyp liegt ausserhalb des App-Quellcodes, damit Typecheck und Build der App nicht betroffen sind.

Er zeigt:
- die eigene Titelleiste mit Tabs, Fensterknöpfen, Zieh-Fläche und nachgeahmtem Mica
- alle sechs Status-Symbole: arbeitet, wartet auf dich, Prozesse laufen, fertig und noch nicht angeschaut, pausiert, kein Symbol
- den `+`-Knopf mit Pfeil-Menü: Shells, „Neues Terminal in …“ mit zuletzt benutzten Ordnern, „Ordner wählen …“
- das Rechtsklick-Menü am Tab, Inline-Umbenennen, den Tooltip und Tabs bei Überlauf
- die Befehlspalette (`Ctrl+Shift+P`)
- die Hinweise unten rechts (fertig und wartet, gestapelt)
- den Einstellungsdialog und die Rückfrage beim Schliessen
- den ausgegrauten, wiederhergestellten Verlauf mit Trennlinie
- das helle und das dunkle Design, **inklusive heller Terminalfläche** mit einem Beispiel für eine Claude-Ausgabe

Ablauf: Der Prototyp wird dir gezeigt, du gibst Rückmeldung, er wird angepasst, bis du ihn freigibst.

## Akzeptanzkriterien

- [ ] Der Prototyp lässt sich lokal im Browser öffnen. Alle oben genannten Zustände sind erreichbar, etwa über eine kleine Steuerleiste zum Durchschalten der Status.
- [ ] Hell und dunkel lassen sich umschalten und folgen standardmässig dem System.
- [ ] Die Entscheidungen sind in der Spezifikation nachgetragen:
  - Design-Variablen: Farben (ohne Akzentfarbe, neutral), Status-Farben, Radien, Abstände, Schriftgrössen
  - beide Terminal-Farbschemata
  - Gestaltung der Menüs, Hinweise und Animationen
  - ob die Terminalfläche im hellen Modus hell bleibt

## Abnahme von Hand

- [ ] Du hast den Look freigegeben.

## Hinweise

- Der Prototyp ist ein Wegwerf-Werkzeug zum Abstimmen. Design-Variablen und Farbschemata werden aber so festgehalten, dass die Tickets 03 und 04 sie direkt übernehmen können.
