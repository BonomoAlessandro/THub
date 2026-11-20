// Ordner-Meldungen der Shell (Ticket 07): Die Shell-Integration meldet bei jedem Prompt den aktuellen
// Ordner per Escape-Sequenz, OSC 7 (`ESC ] 7 ; file://<Rechner>/<Pfad> ST`, prozentkodiert) oder
// OSC 9;9 (`ESC ] 9 ; 9 ; <Pfad> ST`). ST ist BEL oder `ESC \`.
// Hier steht die reine Erkennung im rohen Ausgabestrom; ob es den Ordner gibt, prüft der Workspace-Kern.
// Die Sequenzen bleiben im Strom, xterm.js ignoriert sie.

import * as path from 'node:path';

/** Längere OSC-Sequenzen sind keine Ordner-Meldung; schützt vor endlosem Sammeln bei Binärausgabe. */
const MAX_PAYLOAD_LENGTH = 32 * 1024;

const BEL = 0x07;
const ESC = 0x1b;
/** CAN und SUB brechen eine laufende Escape-Sequenz ab. */
const CAN = 0x18;
const SUB = 0x1a;

const REPORT_PREFIXES = ['7;', '9;9;'];

type ScanState =
  /** Normaler Text. */
  | 'text'
  /** Ein ESC im Text; das nächste Zeichen entscheidet. */
  | 'esc'
  /** Im Inhalt einer OSC-Sequenz. */
  | 'osc'
  /** Ein ESC im Inhalt einer OSC-Sequenz: Folgt `\`, ist sie zu Ende, sonst abgebrochen. */
  | 'oscEsc';

/**
 * Erkennt die Ordner-Meldungen im rohen Ausgabestrom einer Shell. Ein Exemplar pro laufendem
 * Shell-Prozess, weil eine Sequenz über beliebig viele Ausgabestücke verteilt sein kann.
 */
export class CwdReportScanner {
  private state: ScanState = 'text';
  private payload = '';
  /** Die laufende OSC-Sequenz kann keine Ordner-Meldung sein; ihr Inhalt wird nicht gesammelt. */
  private skipping = false;

  /**
   * Nimmt das nächste Ausgabestück und liefert die darin abgeschlossenen Ordner-Meldungen in der
   * Reihenfolge des Stroms, als Windows-Pfade. Orte, die sich nicht als Windows-Pfad lesen lassen
   * (etwa `HKLM:\` oder der Pfad eines entfernten Linux-Rechners), fallen weg.
   */
  feed(chunk: string): string[] {
    const found: string[] = [];
    let i = 0;
    while (i < chunk.length) {
      switch (this.state) {
        case 'text': {
          const esc = chunk.indexOf('\x1b', i);
          if (esc < 0) return found;
          this.state = 'esc';
          i = esc + 1;
          break;
        }
        case 'esc':
          if (chunk[i] === ']') {
            this.state = 'osc';
            this.payload = '';
            this.skipping = false;
            i++;
          } else {
            // Eine andere Escape-Sequenz; das Zeichen wird als Text neu betrachtet (es kann ein ESC sein).
            this.state = 'text';
          }
          break;
        case 'osc': {
          let end = i;
          while (end < chunk.length) {
            const code = chunk.charCodeAt(end);
            if (code === BEL || code === ESC || code === CAN || code === SUB) break;
            end++;
          }
          this.collect(chunk.slice(i, end));
          if (end === chunk.length) return found;
          const code = chunk.charCodeAt(end);
          i = end + 1;
          if (code === BEL) this.finish(found);
          else if (code === ESC) this.state = 'oscEsc';
          else this.state = 'text';
          break;
        }
        case 'oscEsc':
          if (chunk[i] === '\\') {
            this.finish(found);
            i++;
          } else {
            // ESC ohne `\` bricht die Sequenz ab und beginnt eine neue.
            this.state = 'esc';
          }
          break;
      }
    }
    return found;
  }

  private collect(text: string): void {
    if (this.skipping || text === '') return;
    this.payload += text;
    const possible = REPORT_PREFIXES.some((p) => p.startsWith(this.payload) || this.payload.startsWith(p));
    if (!possible || this.payload.length > MAX_PAYLOAD_LENGTH) {
      this.skipping = true;
      this.payload = '';
    }
  }

  private finish(found: string[]): void {
    if (!this.skipping) {
      const dir = parseCwdReport(this.payload);
      if (dir) found.push(dir);
    }
    this.state = 'text';
    this.payload = '';
    this.skipping = false;
  }
}

/**
 * Liest den Inhalt einer OSC-Sequenz (ohne `ESC ]` und Endzeichen) als Ordner-Meldung und liefert den
 * Windows-Pfad, sonst `null`.
 * - OSC 7: `7;file://<Rechner>/<Pfad>`, prozentkodiert. Der Rechner zählt nicht.
 * - OSC 9;9: `9;9;<Pfad>`, roh, auf Wunsch in Anführungszeichen.
 * Pfade: `C:\…` bzw. `C:/…`, `/C:/…`, Git-Bash-Pfade `/c/…`, UNC `\\Server\Freigabe\…` bzw. `//Server/…`.
 */
export function parseCwdReport(payload: string): string | null {
  if (payload.startsWith('7;')) {
    const match = /^file:\/\/[^/]*(\/.*)$/i.exec(payload.slice(2));
    if (!match) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    return windowsPath(decoded);
  }
  if (payload.startsWith('9;9;')) {
    let raw = payload.slice(4).trim();
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    return windowsPath(raw);
  }
  return null;
}

/** Ein absoluter Pfad in einer der gemeldeten Schreibweisen als Windows-Pfad; sonst `null`. */
function windowsPath(raw: string): string | null {
  if (raw.includes('\u0000')) return null;
  let p = raw.replace(/\//g, '\\');
  // Langform-Präfix: \\?\C:\… und \\?\UNC\Server\…
  if (/^\\\\\?\\unc\\/i.test(p)) p = `\\\\${p.slice(8)}`;
  else if (/^\\\\\?\\[a-z]:/i.test(p)) p = p.slice(4);

  // UNC: \\Server\Freigabe\…, aber keine Gerätepfade wie \\.\…
  if (/^\\\\(?![.?]\\)[^\\]+\\[^\\]+/.test(p)) return path.win32.normalize(p);

  const drive =
    /^([a-z]):(\\.*)?$/i.exec(p) ?? // C:\… oder C:
    /^\\([a-z]):(\\.*)?$/i.exec(p) ?? // /C:/… aus einer file://-Adresse
    /^\\([a-z])(\\.*)?$/i.exec(p); // Git Bash: /c/…
  if (!drive) return null;
  // Laufwerk gross, wie Windows es anzeigt (Git Bash meldet /c/…).
  return path.win32.normalize(`${drive[1].toUpperCase()}:${drive[2] ?? '\\'}`);
}
