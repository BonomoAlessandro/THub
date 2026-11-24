# 33 – Countdown von „fertig“ läuft, solange THub sichtbar ist

Status: `erledigt` (2026-11-24, Abnahme von Hand siehe `docs/abnahme.md`) · Typ: AFK
Blockiert durch: –
Herkunft: Wunsch des Nutzers am 2026-11-23. Liegt der Fokus in einem anderen Programm und wird Claude in einem Tab fertig, erscheint der grüne Hinweis, aber die Linie am unteren Rand zählt nicht herunter. So war es bisher festgelegt (User Story 51): Der Countdown lief nur, solange THub den Fokus hatte. Steht THub sichtbar daneben oder auf dem zweiten Bildschirm, wirkt das wie ein Fehler, und der Hinweis bleibt stehen, obwohl man ihn gesehen hat.
Spezifikation: User Story 51 (geändert), „Claude-Status“ → „Hinweise im Fenster“ → „Countdown, solange das Fenster sichtbar ist“ (neu)

## Entscheidung

Der Nutzer hat am 2026-11-23 entschieden: Die Linie zählt herunter, solange der Hinweis sichtbar auf dem Bildschirm ist, auch wenn THub nicht den Fokus hat. Dass ein Hinweis abläuft, während man gerade woanders hinschaut, nimmt er in Kauf.

## Was gebaut wird

- **Sichtbar statt Vordergrund:** Der Countdown von „fertig“ läuft, solange das THub-Fenster sichtbar ist und die Maus nicht auf der Karte steht. Ob THub den Fokus hat, spielt für den Countdown keine Rolle mehr.
- **Nicht sichtbar** ist das Fenster, wenn es minimiert oder versteckt ist, wenn andere Fenster es ganz verdecken und wenn der Bildschirm gesperrt ist. Dann hält der Countdown an und läuft mit der übrigen Zeit weiter, sobald das Fenster wieder sichtbar ist, wie bisher beim Fokus.
- **Woher THub das weiss:**
  - Vorschlag: Der Renderer meldet dem Kern beim Laden und bei jedem Wechsel, ob die Seite sichtbar ist (`document.visibilityState`, Ereignis `visibilitychange`), so wie heute den Vordergrund.
  - Chromium setzt die Seite unter Windows auf „hidden“, wenn das Fenster minimiert oder ganz verdeckt ist (Erkennung verdeckter Fenster, `CalculateNativeWinOcclusion`). Das ist mit Electron 45 in THub zu belegen.
  - Meldet Chromium den gesperrten Bildschirm nicht selbst, kommt er über `powerMonitor` (`lock-screen` / `unlock-screen`) im Hauptprozess dazu.
  - Bis zur ersten Meldung gilt das Fenster als nicht sichtbar, wie heute beim Vordergrund.
- **Was bleibt, wie es ist:**
  - Ob ein Tab als angeschaut gilt („fertig, noch nicht angeschaut“ am Tab, ob ein Hinweis überhaupt erscheint), hängt weiter am Fokus. Ein Tab ist also weiterhin nicht sichtbar, wenn er nicht aktiv ist oder das Fenster nicht im Vordergrund ist. Nur der Countdown ändert sich.
  - Die Maus auf der Karte hält den Countdown an, auch ohne Fokus.
  - „Wartet“ und offene Punkte haben keinen Countdown.
- **Die Linie** zeigt wie bisher die übrige Zeit und steht still, solange der Countdown angehalten ist.
- **Testmodus:** Das Testfenster liegt ausserhalb des Bildschirms und hat nie den Fokus. Prüfen, ob Chromium es als verdeckt meldet. Falls ja, eine Regel für den Testmodus festlegen und in `docs/entwicklung.md` beschreiben, mit der sich „sichtbar“ und „nicht sichtbar“ über CDP prüfen lassen. Das kann eine Umgebungsvariable oder ein Befehl sein, der nur im Testmodus wirkt.
- **Doku:**
  - Handbuch „Hinweise im Fenster“: Die Zeit läuft, solange THub sichtbar ist.
  - In der Spezifikation die Präzisierungen aus der Umsetzung, etwa welche Fälle Chromium als verdeckt meldet.

## Akzeptanzkriterien

- [x] Kern-Tests mit nachgemachter Uhr:
  - Fenster sichtbar, ohne Fokus → der Countdown läuft, der Hinweis verschwindet nach 6 Sekunden;
  - Fenster wird unsichtbar → der Countdown hält an; wieder sichtbar → er läuft mit der übrigen Zeit weiter;
  - Maus auf der Karte → er hält an, auch ohne Fokus;
  - vor der ersten Meldung zur Sichtbarkeit läuft nichts;
  - ein Wechsel des Fokus allein ändert am Countdown nichts;
  - „fertig, noch nicht angeschaut“ und das Entstehen von Hinweisen hängen weiter am Fokus (die bisherigen Tests laufen weiter).
- [x] Der Schnappschuss für die Oberfläche meldet `running` nach der Sichtbarkeit.
- [x] In der App im Testmodus über CDP auf der eigenen Seite: Ein „fertig“-Hinweis im Fenster ohne Fokus zählt herunter und verschwindet nach etwa 6 Sekunden. Als nicht sichtbar gemeldet steht die Linie still, und der Hinweis bleibt.
- [x] Belegt und in den Hinweisen aus der Umsetzung festgehalten: Mit Electron 45 wird die Seite beim Minimieren und beim ganzen Verdecken „hidden“; dazu, wie der gesperrte Bildschirm erkannt wird.
- [x] Spezifikation, Handbuch und gegebenenfalls `docs/entwicklung.md` beschreiben das Verhalten.
- [x] Typecheck, `npm test` und der Build sind grün (bekannte Ausnahme: `test/main/shellLaunch.test.ts` unter Node 24.11.1).

## Abnahme von Hand

- [ ] THub steht sichtbar neben einem anderen Programm oder auf dem zweiten Bildschirm, der Fokus liegt im anderen Programm. Claude wird in einem Tab fertig: Die grüne Linie läuft herunter, und der Hinweis verschwindet nach etwa 6 Sekunden.
- [ ] THub ist minimiert oder ganz verdeckt, während Claude fertig wird. Holst du THub wieder hervor, steht der Hinweis mit voller Linie da und läuft erst dann herunter.
- [ ] Bildschirm sperren, während ein Hinweis herunterzählt: Nach dem Entsperren läuft er mit der übrigen Zeit weiter.

## Hinweise

- **Bekannte Grenze:** Ist THub nur teilweise verdeckt, gilt das Fenster als sichtbar, auch wenn gerade die Ecke mit den Hinweisen verdeckt ist. Der Countdown läuft dann. Eine genauere Prüfung (Lage der Hinweise gegen die anderen Fenster) gehört nicht zu diesem Ticket.
- Ein ausgeschalteter Bildschirm (Energiesparen) zählt nur dann als nicht sichtbar, wenn Chromium das selbst meldet. Das wird geprüft und festgehalten, aber nicht eigens nachgebaut.

## Hinweise aus der Umsetzung

- **Kern:** Neuer Eingang `windowVisible(visible)` (Befehl `windowVisible` im IPC-Vertrag, `src/shared/types.ts`), getrennt von `windowForeground`. `ToastBoard` (`src/main/workspace/toasts.ts`) lässt den Countdown nur noch nach der Sichtbarkeit und der Maus laufen (`setWindowVisible` statt `setForeground`); was als angeschaut gilt, entscheidet in `workspace.ts` weiter der Vordergrund. Bis zur ersten Meldung gilt das Fenster als nicht sichtbar. `main.ts` reicht den Befehl durch.
- **Renderer:** `useWorkspace.ts` meldet `document.visibilityState === 'visible'` beim Laden und bei jedem `visibilitychange`. An der Linie ändert sich nichts: Sie steht still, sobald der Kern `running: false` meldet.
- **Tests** (`test/workspace/toasts.test.ts`, nachgemachte Uhr): sichtbar ohne Fokus läuft der Countdown und der Hinweis ist nach 6 Sekunden weg; nicht sichtbar hält er an, wieder sichtbar läuft er mit der übrigen Zeit weiter (auch über das Ereignis `toasts`); vor der ersten Meldung zur Sichtbarkeit läuft nichts, auch mit Fokus; ein Wechsel des Fokus allein ändert nichts (kein Ereignis, und nicht sichtbar startet ihn auch der Fokus nicht); der Schnappschuss meldet `running` für alle vier Kombinationen aus Fokus und Sichtbarkeit nach der Sichtbarkeit; die Maus hält ihn an, mit und ohne Fokus; Maus und unsichtbares Fenster zusammen. Der aktive Tab bekommt bei Fenster im Hintergrund weiter einen Hinweis, dessen Countdown jetzt läuft. Die bisherigen Tests zu „angeschaut“ und zum Entstehen der Hinweise laufen unverändert; `startScene` meldet wie der Renderer Fokus und Sichtbarkeit (mit `reportVisibility: false` nur den Fokus).
- **Geprüft in der App im Testmodus über CDP** auf der eigenen Seite, mit eigenem Datenordner und einem vorbereiteten `state.json` mit nur einem cmd-Tab. Den „fertig“-Hinweis lösten Meldungen an die eigene Schnittstelle der Test-App aus (Adresse und Token aus der Umgebung des cmd-Tabs; `/claude/launch`, `SessionStart`, `UserPromptSubmit`, `Stop`). Das Testfenster hatte nie den Fokus (`document.hasFocus()` immer `false`).
  - Mit `--disable-features=CalculateNativeWinOcclusion`: Seite `visible`, der Hinweis läuft (`running: true`, `animationPlayState: running`, die Zeit der Animation steigt mit) und ist nach 6,2 Sekunden weg (6 Sekunden plus Abfragetakt).
  - Im selben Lauf das eigene Testfenster ohne Aktivierung minimiert (`ShowWindowAsync` mit `SW_SHOWMINNOACTIVE`): Seite `hidden`, `running: false`, die übrige Zeit (2905 ms) und die Linie (`paused`) blieben 5 Sekunden lang stehen. Wiederhergestellt (`SW_SHOWNOACTIVATE`): Seite `visible`, der Countdown lief mit der übrigen Zeit weiter, der Hinweis war 12,7 Sekunden nach `Stop` weg. Das Vordergrundfenster des Desktops war vor und nach beiden Schritten dasselbe.
  - Ohne die Option: Chromium hält das Testfenster ausserhalb des Bildschirms für verdeckt, Seite `hidden` von Anfang an; der Hinweis stand nach 10 Sekunden noch mit voller Zeit (6000 ms, `running: false`, Linie `paused`).
- **Belege zu Electron und Chromium** (Electron 45.4.1 mit Chromium 156.0.8078.100):
  - **Minimieren → `hidden`:** in der App geprüft (siehe oben). Im Quelltext: `DesktopWindowTreeHostWin::HandleWindowMinimizedOrRestored` versteckt das Fenster beim Minimieren (`window()->Hide()`), und der Tracker der Verdeckung setzt minimierte Fenster sofort auf `HIDDEN` (`ui/aura/native_window_occlusion_tracker_win.cc`).
  - **Ganz verdeckt → `hidden`:** Der Tracker (`kCalculateNativeWinOcclusion`, in `ui/base/ui_base_features.cc` standardmässig an) zieht die Rechtecke aller sichtbaren, ganz undurchsichtigen Fenster über THub von der Fläche des virtuellen Bildschirms ab; ändert das Fenster an der übrigen Fläche nichts, ist es `OCCLUDED`. Dass Electron 45 daraus unter Windows `hidden` macht, zeigt das Testfenster ausserhalb des Bildschirms (dieselbe Rechnung, Seite `hidden`), obwohl die Doku von Electron 45 („Page visibility“ in `browser-window.md`) die Verdeckung nur für macOS nennt. Das Verdecken durch echte Fenster liess sich ohne Eingriff in den Desktop nicht prüfen und steht in der Abnahme von Hand.
  - **Gesperrter Bildschirm:** Chromium meldet ihn selbst. `NativeWindowOcclusionTrackerWin::OnSessionChange` setzt bei `WTS_SESSION_LOCK` `screen_locked_` und ruft `MarkNonIconicWindowsOccluded()`; solange gesperrt, wird jedes Ergebnis zu `OCCLUDED` („If the screen is locked or off, ignore occlusion state results and mark the window as occluded.“); bei `WTS_SESSION_UNLOCK` rechnet es neu. Der Weg von `OCCLUDED` zu `hidden` ist derselbe wie beim Testfenster. Deshalb kein `powerMonitor`. Nicht in der App geprüft (Sperren ist tabu, und das Testfenster ist ohnehin schon verdeckt); steht in der Abnahme von Hand.
  - **Ausgeschalteter Bildschirm:** `OnDisplayStateChanged` markiert bei ausgeschaltetem Bildschirm ebenfalls alle nicht minimierten Fenster als verdeckt, in Chromium 156 ohne eigenen Feature-Schalter. Wie im Ticket vorgesehen nicht eigens nachgebaut und nicht geprüft.
  - Quelltexte gelesen am Tag `156.0.8078.100` des Chromium-Spiegels auf GitHub (`ui/aura/native_window_occlusion_tracker_win.cc` und `.h`, `ui/base/ui_base_features.cc`, `ui/views/widget/desktop_aura/desktop_window_tree_host_win.cc`, `content/browser/web_contents/web_contents_impl.cc`: nicht `VISIBLE` ergibt `kHidden`, ausser bei Bildschirmaufnahme, WebXR oder Bild-in-Bild) und die Doku von Electron am Tag `v45.4.1`.
- **Testmodus:** Die Regel steht in `docs/entwicklung.md` unter „Testmodus“: ohne die Option nicht sichtbar, mit ihr sichtbar ohne Fokus, Wechsel im Lauf durch Minimieren des eigenen Testfensters ohne Aktivierung. Ein eigener Befehl oder eine Umgebungsvariable war dafür nicht nötig.
- Weitere Grenzen aus dem Quelltext (in der Spezifikation): Ein halb durchsichtiges Fenster verdeckt nicht; solange die Fensterauswahl von `Alt+Tab` oder die Vorschaubilder der Taskleiste offen sind, gilt THub als sichtbar; ein Fenster auf einem anderen virtuellen Desktop gilt als verdeckt.
- Typecheck, `npm test` (55 Dateien, 1109 Tests) und der Build sind grün, auch `test/main/shellLaunch.test.ts` (Node 24.22.1).
