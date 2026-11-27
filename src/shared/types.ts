// Vertrag zwischen Renderer und Workspace-Kern (über IPC).
// Der Kern im Hauptprozess ist die einzige Quelle der Wahrheit: Der Renderer bekommt einen
// Schnappschuss und danach Änderungsereignisse und schickt nur Befehle.

export type Theme = 'system' | 'light' | 'dark';

/** Das Design, das gerade gilt: hell oder dunkel; „System“ ist dabei schon aufgelöst. */
export type ResolvedTheme = 'light' | 'dark';

/** Terminal-Schriftgrösse in px: kleinste, grösste und Standardgrösse (`Ctrl+0` setzt darauf zurück). */
export const FONT_SIZE = { min: 8, max: 32, default: 14 } as const;

/**
 * Stufe beim Wachhalten (Ticket 28): `system` hält nur den Rechner wach (der Bildschirm schaltet sich aus und sperrt wie
 * gewohnt), `display` zusätzlich den Bildschirm.
 */
export type KeepAwakeMode = 'system' | 'display';

/**
 * Warum das Wachhalten scheiterte (Ticket 31): Windows lehnte die Anforderung ab, die Verbindung zu Windows (koffi)
 * liess sich nicht herstellen, das System wird nicht unterstützt, oder etwas Unerwartetes.
 */
export type KeepAwakeFailureReason = 'windows' | 'load' | 'unsupported' | 'other';

/** Ein gescheitertes Wachhalten, wie es der Fehler-Hinweis zeigt (Ticket 31). */
export interface KeepAwakeFailure {
  /**
   * `on`: Einschalten oder Wechsel der Stufe scheiterte; THub hat das Wachhalten danach ausgeschaltet.
   * `off`: Aufheben scheiterte; Windows hält womöglich weiter wach, bis THub endet.
   */
  action: 'on' | 'off';
  reason: KeepAwakeFailureReason;
  /** Fehlercode von Windows, nur bei `windows`. */
  code?: number;
}

export interface Settings {
  /** Standardordner für neue Tabs; leer heisst Benutzerordner. */
  defaultCwd: string;
  /** Kennung der Standard-Shell (z.B. "pwsh"); fehlt sie, wählt der Kern selbst. */
  defaultShellId?: string;
  theme: Theme;
  /** Terminal-Schriftgrösse, 8 bis 32 (`FONT_SIZE`). */
  fontSize: number;
  /**
   * Hinweise im Fenster an/aus (Ticket 14): „wartet“ und „fertig“. Ausgeschaltet gibt es keine; die Status-Symbole am
   * Tab bleiben.
   */
  notifications: boolean;
  /**
   * Offene Punkte aus Claudes Antworten anzeigen (Ticket 22). Ausgeschaltet gibt THub Claude auch die Anweisung nicht
   * mehr mit, offene Punkte am Ende der Antwort aufzuzählen.
   */
  openPoints: boolean;
  /**
   * Rechner wach halten an/aus (Ticket 28). Bleibt über Beenden, Abmelden und Absturz stehen: Nach einem Neustart hält
   * THub den Rechner von selbst wieder wach.
   */
  keepAwake: boolean;
  /** Die gewählte Stufe; gilt erst, wenn `keepAwake` an ist. */
  keepAwakeMode: KeepAwakeMode;
}

/**
 * Prozess-Zustand eines Tabs:
 * - `pending`: wartet auf „Ansicht bereit“, es läuft noch keine Shell;
 * - `running`: die Shell läuft;
 * - `exited`: die Shell ist beendet (oder liess sich nicht starten).
 */
export type TabProcessState = 'pending' | 'running' | 'exited';

/** Art des Tabs: normales Terminal oder Claude-Tab (mit Claude-Zuordnung, auch unbestätigt). */
export type TabKind = 'terminal' | 'claude';

/**
 * Angezeigter Status am Tab, nach Vorrang von oben nach unten (der erste zutreffende gilt):
 * - `paused`: Claude-Session nach einem Neustart noch nicht fortgesetzt (Ticket 12);
 * - `waiting`: Claude wartet auf dich;
 * - `working`: Claude arbeitet;
 * - `finished`: Claude ist fertig, der Tab wurde seither nicht angeschaut;
 * - `processes`: im Terminal laufen Prozesse;
 * - `idle`: nichts davon; der Symbol-Platz zeigt dann gedämpft die Art des Tabs.
 */
export type TabStatus = 'paused' | 'waiting' | 'working' | 'finished' | 'processes' | 'idle';

/** Ein Tab, wie ihn der Renderer anzeigt. */
export interface TabSnapshot {
  id: string;
  name: string;
  /** Kennung der Shell des Tabs. Fehlt sie auf diesem Rechner, läuft er mit der Standard-Shell (`shellName`). */
  shellId: string;
  /** Anzeigename der Shell, mit der der Tab läuft, z.B. "PowerShell 7". */
  shellName: string;
  /** Ordner zur Anzeige: zuletzt aktiver Ordner, sonst Startordner. */
  cwd: string;
  process: TabProcessState;
  kind: TabKind;
  status: TabStatus;
  /**
   * Pausierter Claude-Tab nach einem Neustart: Seine Session wird erst fortgesetzt, wenn er angezeigt wird. Bis dahin
   * gibt es keinen Prozess, und der Renderer legt noch keine Ansicht an.
   */
  paused: boolean;
  /** Die Gruppe, in der der Tab steht (Ticket 36); fehlt bei einem einzelnen Tab. */
  groupId?: string;
}

/**
 * Eine Gruppe (Ticket 36): ein einziger Eintrag in der Tab-Leiste, an der Stelle ihres ersten Tabs. Ihre Tabs stehen in
 * `TabSnapshot` zusammen, in ihrer Reihenfolge.
 */
export interface GroupSnapshot {
  id: string;
  name: string;
  /** Die Tabs der Gruppe in ihrer Reihenfolge; mindestens einer. */
  tabIds: string[];
  /**
   * Der gewählte Tab: der zuletzt angezeigte Tab der Gruppe. Ihn zeigt der Gruppen-Tab, und ihn zeigt ein Klick auf den
   * Gruppen-Tab an. Ist er der aktive Tab, ist die Gruppe aktiv.
   */
  selectedTabId: string;
  /**
   * Der Status des gewählten Tabs (Ticket 40; bis dahin der dringendste aller Tabs der Gruppe). Ruht er (`idle`), zeigt
   * der Gruppen-Tab gedämpft das Ordner-Symbol.
   */
  status: TabStatus;
  /** Der Punkt am Pfeil des Gruppen-Tabs (Ticket 40): ob ein anderer Tab der Gruppe auf dich wartet oder fertig ist. */
  dot: GroupDot;
}

/**
 * Punkt am Pfeil des Gruppen-Tabs (Ticket 40), nur für die anderen Tabs der Gruppe, nie für den gewählten:
 * - `waiting`: mindestens einer wartet auf dich (orange); geht vor `finished`;
 * - `finished`: mindestens einer ist fertig und noch nicht angeschaut (grün);
 * - `none`: keiner davon; andere Zustände (arbeitet, Prozesse laufen, pausiert) ergeben keinen Punkt.
 */
export type GroupDot = 'waiting' | 'finished' | 'none';

/**
 * Warum ein Tab vor dem Schliessen nachfragt, nach den eigentlichen Merkmalen, nicht nach dem angezeigten Symbol:
 * Claude wartet auf dich, Claude arbeitet, oder im Terminal laufen Prozesse (auch neben einem grünen „fertig“).
 */
export type BusyReason = 'waiting' | 'working' | 'processes';

/** Ein Tab, in dem beim Schliessen noch etwas läuft, wie ihn die Rückfrage nennt. */
export interface BusyTab {
  id: string;
  name: string;
  reason: BusyReason;
  /** Claude-Tab, der beim Wiederöffnen seine Session fortsetzt. */
  resumes: boolean;
}

/** Ein zuletzt geschlossener Tab, wie ihn „Zuletzt geschlossen“ in der Befehlspalette anbietet (Ticket 17). */
export interface ClosedTabInfo {
  /** Kennung des Tabs; mit ihr öffnet `reopenClosedTab` genau diesen Tab wieder. */
  id: string;
  name: string;
  kind: TabKind;
  /** Anzeigename der Shell, mit der er wieder startet. */
  shellName: string;
  /** Ordner, in dem er wieder startet: bei einem Claude-Tab der Ordner der Session, sonst der zuletzt aktive. */
  cwd: string;
  /** Wann er geschlossen wurde, in Millisekunden seit 1970. */
  closedAt: number;
  /** Name der Gruppe, in die er beim Wiederöffnen zurückkehrt (Ticket 36); fehlt, wenn er einzeln stand. */
  groupName?: string;
}

/**
 * Art eines Hinweises unten rechts im Fenster:
 * - `waiting`: Claude wartet in einem nicht sichtbaren Tab auf dich; bleibt, bis der Tab angezeigt wird oder wieder
 *   arbeitet (Ticket 14);
 * - `finished`: Claude ist in einem nicht sichtbaren Tab fertig geworden; verschwindet nach etwa 6 Sekunden, in denen
 *   das Fenster sichtbar ist (Ticket 33), oder beim Anzeigen des Tabs (Ticket 14);
 * - `openPoints`: Claudes letzte Antwort endet mit offenen Fragen oder Punkten; erscheint auch für den sichtbaren Tab
 *   und bleibt, bis er mit × geschlossen wird, auch über einen Neustart (Ticket 22).
 *
 * „Wartet“ und „fertig“ teilen sich einen Platz pro Tab, offene Punkte haben einen eigenen und ersetzen dazu „fertig“.
 */
export type ToastKind = 'waiting' | 'finished' | 'openPoints' | 'keepAwakeError';

/**
 * Countdown eines Hinweises, der von selbst verschwindet. Er läuft nur, solange das Fenster sichtbar ist, auch ohne
 * Fokus (Ticket 33).
 */
export interface ToastCountdown {
  /** Ganze Dauer in ms. */
  totalMs: number;
  /** Was beim Melden noch übrig war, in ms. */
  remainingMs: number;
  /** Er läuft gerade: Fenster sichtbar, und die Maus steht nicht auf dem Hinweis. */
  running: boolean;
}

interface ToastBase {
  /** Eindeutig; ein neuer Hinweis, der einen alten ersetzt, bekommt eine neue Kennung. */
  id: string;
  /** Der Tab, zu dem der Hinweis gehört; ein Klick auf den Hinweis zeigt ihn an. */
  tabId: string;
}

/**
 * Ein Hinweis unten rechts im Fenster. Den Text und den Namen des Tabs setzt die Oberfläche ein; offene Punkte bringen
 * ihre Punkte mit, alle, in der Reihenfolge der Antwort (die Oberfläche zeigt davon höchstens vier).
 */
export type ToastSnapshot =
  | (ToastBase & { kind: 'waiting' })
  | (ToastBase & { kind: 'finished'; countdown: ToastCountdown })
  | (ToastBase & { kind: 'openPoints'; points: string[] })
  /**
   * Fehler beim Wachhalten (Ticket 31), als Fehler markiert. Er gehört zu keinem Tab, steht, bis `×` oder ein Klick ihn
   * schliesst, und höchstens einmal da.
   */
  | { id: string; kind: 'keepAwakeError'; tabId?: undefined; failure: KeepAwakeFailure };

/** Eine erkannte Shell, wie sie das Pfeil-Menü und die Einstellungen anbieten. */
export interface ShellOption {
  /** Stabile Kennung: "pwsh", "powershell", "cmd", "gitbash" oder "wsl:<Distribution>". */
  id: string;
  /** Anzeigename, z.B. "PowerShell 7" oder "Ubuntu (WSL)". */
  name: string;
}

/** Ein zuletzt benutzter Ordner, wie ihn das Pfeil-Menü unter „Neues Terminal in …“ anbietet. */
export interface RecentDir {
  path: string;
  /** Name, den ein neuer Tab in diesem Ordner bekäme (ohne „ 2“ usw.). */
  name: string;
}

/** Vollständiger Zustand für den Renderer, beim Laden abgeholt. */
export interface WorkspaceSnapshot {
  /** Alle Tabs in der Reihenfolge der Leiste; die Tabs einer Gruppe stehen zusammen. */
  tabs: TabSnapshot[];
  /** Die Gruppen (Ticket 36), in der Reihenfolge der Leiste. */
  groups: GroupSnapshot[];
  activeTabId: string | null;
  settings: Settings;
  /** Die erkannten Shells, in der Reihenfolge des Pfeil-Menüs. */
  shells: ShellOption[];
  /**
   * Kennung der Standard-Shell, mit der `+` und Ctrl+Shift+T neue Tabs öffnen: die eingestellte, sonst
   * PowerShell 7, sonst Windows PowerShell. Immer eine der erkannten Shells.
   */
  defaultShellId: string;
  /** Benutzerordner, zur Anzeige eines leeren Standardordners. */
  homeDir: string;
  /** Die Hinweise unten rechts, in der Reihenfolge ihres Erscheinens (ältester zuerst). */
  toasts: ToastSnapshot[];
}

/** Änderungsereignisse vom Kern an den Renderer. */
export type WorkspaceEvent =
  /**
   * Tabs, Reihenfolge, aktiver Tab, Prozess-Zustand, Art oder Status eines Tabs oder die Gruppen haben sich geändert
   * (siehe `WorkspaceSnapshot`).
   */
  | { type: 'tabs'; tabs: TabSnapshot[]; groups: GroupSnapshot[]; activeTabId: string | null }
  /**
   * Über „Neue Gruppe“ ist diese Gruppe entstanden (Ticket 36); kommt nach dem Ereignis `tabs` mit ihr. Der Gruppen-Tab
   * geht sofort ins Umbenennen.
   */
  | { type: 'groupCreated'; groupId: string }
  /** Die Hinweise unten rechts haben sich geändert: alle, die jetzt stehen (siehe `WorkspaceSnapshot`). */
  | { type: 'toasts'; toasts: ToastSnapshot[] }
  /** Die Einstellungen haben sich geändert; dazu die daraus folgende Standard-Shell (siehe `WorkspaceSnapshot`). */
  | { type: 'settings'; settings: Settings; defaultShellId: string }
  /** Rohe Ausgabe der Shell eines Tabs. */
  | { type: 'output'; tabId: string; data: string }
  /** Die Shell eines Tabs hat sich beendet. */
  | { type: 'exit'; tabId: string; exitCode: number }
  /**
   * Hinweis im Terminal eines Tabs (z.B. Shell liess sich nicht starten). Mit `beforeStart` kommt er direkt vor
   * dem ersten Start der Shell, solange die Ansicht noch leer ist (höchstens mit dem wiederhergestellten
   * Verlauf im Scrollback); ConPTY leert beim Start den sichtbaren Bereich.
   */
  | { type: 'notice'; tabId: string; level: 'info' | 'error'; text: string; beforeStart?: boolean }
  /**
   * Gesicherter Verlauf eines Tabs zum Wiederherstellen. Kommt nach „Ansicht bereit“, aber vor dem
   * Startauftrag, und damit vor der ersten Ausgabe der Shell. `savedAt`: Zeitpunkt der Sicherung.
   */
  | { type: 'restoreHistory'; tabId: string; content: string; savedAt: number }
  /**
   * Der Kern möchte den aktuellen Verlauf dieser Tabs; der Renderer antwortet je Tab mit `saveHistory`. Kommt auch
   * für einen Tab, der gleich geschlossen wird, noch vor dem Ereignis `tabs` ohne ihn.
   */
  | { type: 'requestHistory'; tabIds: string[] }
  /**
   * Rückfrage vor dem Schliessen von `tabIds`: In den Tabs `busy` läuft noch etwas. Bestätigt der Nutzer, schickt der
   * Renderer `closeTabs` mit `tabIds`; bricht er ab, bleiben alle offen.
   */
  | { type: 'askClose'; tabIds: string[]; busy: BusyTab[] };

/** Befehle vom Renderer an den Kern. */
export type WorkspaceCommand =
  /**
   * Neuer Tab im Ordner `cwd` mit der Shell `shellId`; ohne Ordner (oder wenn es ihn nicht gibt) im
   * Standardordner, ohne Shell (oder wenn sie nicht erkannt ist) mit der Standard-Shell.
   */
  | { type: 'createTab'; cwd?: string; shellId?: string }
  /**
   * „Duplizieren“ im Rechtsklick-Menü: neuer Tab rechts neben diesem, im aktuellen Ordner, mit derselben Shell und
   * automatischem Namen; ohne Claude-Session.
   */
  | { type: 'duplicateTab'; tabId: string }
  | { type: 'renameTab'; tabId: string; name: string }
  /**
   * Den einzelnen Tab an Position `index` der Leiste verschieben, ab 0 (Ziehen in der Tab-Leiste). Gezählt werden die
   * Einträge der Leiste: einzelne Tabs und Gruppen (Ticket 36).
   */
  | { type: 'moveTab'; tabId: string; index: number }
  | { type: 'activateTab'; tabId: string }
  /** Zum Eintrag der Leiste `offset` Plätze weiter, im Kreis (Ctrl+Tab: 1, Ctrl+Shift+Tab: -1); eine Gruppe zählt als ihr gewählter Tab. */
  | { type: 'activateRelativeTab'; offset: number }
  /** Zum Eintrag an Position `index` der Leiste, ab 0 (Ctrl+1 … Ctrl+9); eine Gruppe zählt als ihr gewählter Tab. */
  | { type: 'activateTabAt'; index: number }
  /** „Neue Gruppe“ (Ticket 36): eine Gruppe mit diesem einzelnen Tab an seiner Stelle. */
  | { type: 'createGroup'; tabId: string }
  /** „In Gruppe „…““ oder Ziehen auf den Gruppen-Tab: der Tab kommt ans Ende dieser Gruppe. */
  | { type: 'moveTabToGroup'; tabId: string; groupId: string }
  /** „Aus Gruppe nehmen“: der Tab steht danach einzeln rechts neben der Gruppe. */
  | { type: 'removeTabFromGroup'; tabId: string }
  | { type: 'renameGroup'; groupId: string; name: string }
  /** Die Gruppe als Ganzes an Position `index` der Leiste verschieben, ab 0, gezählt wie bei `moveTab`. */
  | { type: 'moveGroup'; groupId: string; index: number }
  /** „Gruppe auflösen“: die Tabs bleiben offen und stehen in ihrer Reihenfolge einzeln an der Stelle der Gruppe. */
  | { type: 'dissolveGroup'; groupId: string }
  /** „Gruppe schliessen“: alle Tabs der Gruppe, mit höchstens einer gemeinsamen Rückfrage wie `requestClose`. */
  | { type: 'closeGroup'; groupId: string }
  /** „Neues Terminal“ in der Gruppe: am Ende der Gruppe, im aktuellen Ordner ihres gewählten Tabs, mit der Standard-Shell. */
  | { type: 'newTabInGroup'; groupId: string }
  /**
   * Der Nutzer will diese Tabs schliessen (×, Ctrl+Shift+W). Ruhen sie, schliesst der Kern sie sofort; läuft in einem
   * etwas, fragt er erst zurück (`askClose`).
   */
  | { type: 'requestClose'; tabIds: string[] }
  /**
   * „Andere Tabs schliessen“, mit höchstens einer gemeinsamen Rückfrage: bei einem einzelnen Tab alle anderen Einträge
   * der Leiste samt Gruppen, bei einem Tab in einer Gruppe die anderen Tabs dieser Gruppe.
   */
  | { type: 'closeOtherTabs'; tabId: string }
  /** Die Rückfrage ist bestätigt: Diese Tabs schliessen ohne weitere Rückfrage. */
  | { type: 'closeTabs'; tabIds: string[] }
  /** Den zuletzt geschlossenen Tab (Ctrl+Shift+Z) oder, mit `tabId`, genau diesen wieder öffnen. */
  | { type: 'reopenClosedTab'; tabId?: string }
  /** Die Ansicht des Tabs ist bereit; erst danach erteilt der Kern den Startauftrag. */
  | { type: 'viewReady'; tabId: string; cols: number; rows: number }
  | { type: 'resizeTab'; tabId: string; cols: number; rows: number }
  | { type: 'writeToTab'; tabId: string; data: string }
  /** Beendete Shell neu starten (beliebige Taste im Terminal). */
  | { type: 'restartTab'; tabId: string }
  /** Antwort auf `requestHistory`: der serialisierte Inhalt des Terminals eines Tabs. */
  | { type: 'saveHistory'; tabId: string; content: string }
  /**
   * Das Fenster ist im Vordergrund (hat den Fokus) bzw. nicht mehr. Gemeldet beim Laden und bei jedem
   * Wechsel; der aktive Tab gilt nur im Vordergrund als angeschaut.
   */
  | { type: 'windowForeground'; foreground: boolean }
  /**
   * Das Fenster ist sichtbar (`document.visibilityState`) bzw. nicht mehr: nicht minimiert, versteckt, ganz verdeckt
   * oder hinter dem Sperrbildschirm. Gemeldet beim Laden und bei jedem Wechsel; nur solange laufen die Countdowns der
   * Hinweise (Ticket 33).
   */
  | { type: 'windowVisible'; visible: boolean }
  /**
   * Klick auf einen Hinweis: Der Kern zeigt dessen Tab an; ein Hinweis mit offenen Punkten verschwindet dabei, auch aus
   * dem gespeicherten Zustand.
   */
  | { type: 'openToast'; toastId: string }
  /** Hinweis mit × wegklicken, ohne den Tab anzuzeigen. */
  | { type: 'dismissToast'; toastId: string }
  /** Die Maus steht auf dem Hinweis (`hold`) bzw. nicht mehr; solange hält sein Countdown an. */
  | { type: 'holdToast'; toastId: string; hold: boolean }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  /**
   * Schriftgrösse einen Schritt grösser (1) oder kleiner (-1). Der Kern rechnet vom eigenen Stand aus,
   * damit bei schnellen Schritten (Mausrad, gehaltene Taste) keiner verloren geht.
   */
  | { type: 'stepFontSize'; step: number };

export type Unsubscribe = () => void;

/** Wofür der Ordner-Dialog einen Ordner wählt; davon hängen Titel und Startordner des Dialogs ab. */
export type DirectoryPurpose = 'newTab' | 'defaultCwd';

/** Die API, die der Preload-Skript dem Renderer unter `window.thub` bereitstellt. */
/** Version der laufenden App (Ticket 30), für die Versionszeile im Einstellungsdialog. */
export interface AppInfo {
  /** Aus `package.json`, z.B. "0.2.0". */
  version: string;
  /** Installierte App; `false` bei `npm start` und `npm run dev`. */
  packaged: boolean;
}

export interface THubApi {
  loadSnapshot(): Promise<WorkspaceSnapshot>;
  onEvent(listener: (event: WorkspaceEvent) => void): Unsubscribe;
  send(command: WorkspaceCommand): void;
  /** Zuletzt benutzte Ordner, die es noch gibt, neueste zuerst; abgefragt beim Öffnen des Pfeil-Menüs. */
  loadRecentDirs(): Promise<RecentDir[]>;
  /** Die zuletzt geschlossenen Tabs, neueste zuerst, höchstens zehn („Zuletzt geschlossen“, Ticket 17). */
  loadClosedTabs(): Promise<ClosedTabInfo[]>;

  /** Öffnet den Ordner-Dialog von Windows; `null`, wenn er abgebrochen wurde. */
  pickDirectory(purpose: DirectoryPurpose): Promise<string | null>;
  /** „Ordner im Explorer öffnen“: öffnet den aktuellen Ordner des Tabs im Explorer. */
  openTabFolder(tabId: string): Promise<void>;

  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;

  /**
   * Ctrl+Klick auf einen Link im Terminal: öffnet die Adresse im Standardbrowser. Nur `http:` und `https:`; der
   * Hauptprozess prüft das selbst noch einmal.
   */
  openLink(url: string): Promise<void>;

  /** Version der laufenden App (Ticket 30). */
  loadAppInfo(): Promise<AppInfo>;

  /** Das geltende Design; es bestimmt der Hauptprozess. */
  loadTheme(): Promise<ResolvedTheme>;
  /** Meldet jeden Wechsel des Designs, zum Beispiel wenn Windows von dunkel auf hell wechselt. */
  onThemeChange(listener: (theme: ResolvedTheme) => void): Unsubscribe;
}

/** IPC-Kanalnamen an einem Ort, damit Main und Preload nicht auseinanderlaufen. */
export const IPC = {
  workspaceSnapshot: 'workspace:snapshot',
  workspaceCommand: 'workspace:command',
  workspaceEvent: 'workspace:event',
  workspaceRecentDirs: 'workspace:recent-dirs',
  workspaceClosedTabs: 'workspace:closed-tabs',
  dialogPickDirectory: 'dialog:pick-directory',
  tabOpenFolder: 'tab:open-folder',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
  linkOpen: 'link:open',
  appInfo: 'app:info',
  themeCurrent: 'theme:current',
  themeChanged: 'theme:changed',
} as const;
