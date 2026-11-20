# 22 – Offene Punkte aus Claudes Antworten als Hinweis

Status: `erledigt` (2026-11-20, Abnahme von Hand am Schluss in Ticket 19) · Typ: AFK
Blockiert durch: 14
User Stories: 80, 81, 82
Spezifikation: „Offene Punkte aus Claudes Antworten“, „Hook-Empfänger und lokale Schnittstelle“, „Claude-Status: Zustandsautomat pro Tab“ (Hinweise im Fenster)

## Was gebaut wird

Endet eine Antwort von Claude mit offenen Fragen oder Punkten, die der Nutzer entscheiden oder erledigen muss, zeigt THub sie als Hinweis unten rechts an, damit sie nicht in einer langen Antwort untergehen.

- **Anweisung an Claude:** THub antwortet auf `/hooks/SessionStart` (der Befehls-Hook mit `curl.exe`) mit zusätzlichem Kontext für Claude (`hookSpecificOutput.additionalContext`): Offene Fragen oder Punkte am Ende der Antwort unter der Überschrift „Offene Punkte“ als kurze Aufzählung schreiben, sonst den Abschnitt weglassen. Weil `SessionStart` auch bei Fortsetzen, `/clear` und Kompaktieren kommt, gilt die Anweisung in jeder Session. Der genaue Wortlaut steht in der Spezifikation.
- **Erkennung beim Ende einer Antwort (`Stop`)** im Feld `last_assistant_message`:
  - eine Überschrift (Markdown-Überschrift, fette Zeile oder Zeile mit Doppelpunkt) mit „Offene Punkte“, „Offene Fragen“, „Noch offen“, „Fragen an dich“, „Zu klären“, „Open points“ oder „Open questions“; die Aufzählungspunkte darunter sind die offenen Punkte;
  - ohne solche Überschrift: endet der letzte Absatz mit einer Frage, gilt diese Frage als ein offener Punkt.
- **Hinweis:** unten rechts, mit Tab-Name, „Offene Punkte (n)“ und den Punkten als Liste (höchstens vier, jeder höchstens zwei Zeilen, darunter „+ k weitere“). Ein Klick springt in den Tab. Der Hinweis **bleibt, bis er mit × geschlossen wird**, auch wenn der Tab angezeigt wird, und er erscheint **auch für den gerade sichtbaren Tab**. Pro Tab höchstens ein solcher Hinweis; eine neue Antwort **mit** offenen Punkten ersetzt ihn, eine Antwort ohne offene Punkte lässt ihn stehen. Er ersetzt einen „Fertig“-Hinweis desselben Tabs.
- **Übersteht einen Neustart:** Offene, nicht geschlossene Hinweise werden pro Tab gespeichert und nach einem Neustart wieder angezeigt; ein geschlossener Tab nimmt seinen Hinweis mit.
- **Einstellung:** neues Feld „Offene Punkte aus Claudes Antworten anzeigen“ im Abschnitt „Hinweise“ (Standard: an). Ausgeschaltet gibt THub auch die Anweisung an Claude nicht mehr mit.

## Akzeptanzkriterien

- [x] Kern-Tests mit echten HTTP-Hook-Ereignissen:
  - `/hooks/SessionStart` liefert den Kontext mit der Anweisung, wenn die Einstellung an ist, und eine leere Antwort, wenn sie aus ist;
  - `Stop` mit Abschnitt „Offene Punkte“ (auch als fette Zeile oder mit Doppelpunkt, auch englisch) ergibt einen Hinweis mit genau diesen Punkten; mit Frage im letzten Absatz ein Hinweis mit dieser Frage; ohne beides keinen;
  - der Hinweis bleibt beim Anzeigen des Tabs, verschwindet nur durch Schliessen; erscheint auch für den sichtbaren Tab; eine neue Antwort mit Punkten ersetzt ihn, eine ohne lässt ihn stehen; er ersetzt den „Fertig“-Hinweis;
  - er übersteht einen Neustart; ausgeschaltete Einstellung erzeugt keinen.
- [x] Die Erkennung ist eine reine, gut getestete Funktion mit Beispielen echter Antworten (deutsch und englisch, Markdown-Varianten, Code-Blöcke werden nicht als Punkte gelesen).
- [x] Typecheck, alle Tests und der Build sind grün.

Nachtrag:
- Seit Ticket 27 zählt nur noch der ausdrückliche Abschnitt „Offene Punkte“; die Regel mit der Schlussfrage ist weggefallen. Das Kriterium galt bis dahin.

## Abnahme von Hand (mit echtem Claude Code)

- [ ] In einem Claude-Tab eine Aufgabe geben, bei der Claude Rückfragen hat → der Hinweis „Offene Punkte“ erscheint unten rechts mit den Fragen, auch im aktiven Tab.
- [ ] Tab wechseln und zurück → der Hinweis bleibt; erst × schliesst ihn.
- [ ] THub neu starten → der nicht geschlossene Hinweis ist wieder da.
- [ ] Einstellung ausschalten → keine solchen Hinweise mehr.
