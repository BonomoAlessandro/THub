import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../support/fakes';
import { startWorkspace, type TestWorkspace, type TestWorkspaceOptions } from '../support/harness';

const BEL = '\x07';
const ST = '\x1b\\';
/** Ordner-Meldung, wie PowerShell und cmd sie schicken. */
const osc99 = (dir: string, end = BEL) => `\x1b]9;9;${dir}${end}`;
/** Ordner-Meldung, wie Git Bash sie schickt. */
const osc7 = (url: string, end = ST) => `\x1b]7;${url}${end}`;

/** Ein Kern mit laufender Shell im aktiven Tab. */
function running(options: TestWorkspaceOptions = {}): { h: TestWorkspace; id: string } {
  const h = startWorkspace(options);
  const id = h.activeTab()!.id;
  h.workspace.viewReady(id, 120, 30);
  return { h, id };
}

describe('Ordner-Erkennung', () => {
  it('übernimmt den gemeldeten Ordner als zuletzt aktiven Ordner und zeigt ihn im Tooltip', () => {
    const { h, id } = running({ directories: ['C:\\proj'] });

    h.terminal.output(id, `PS C:\\proj> ${osc99('C:\\proj')}`);

    expect(h.activeTab()?.cwd).toBe('C:\\proj');
    expect(h.storedTab(id)?.lastCwd).toBe('C:\\proj');
    expect(h.events.at(-1)).toMatchObject({ type: 'tabs', tabs: [{ id, cwd: 'C:\\proj' }] });
  });

  it.each([
    ['BEL', BEL],
    ['ESC \\', ST],
  ])('erkennt das Endzeichen %s', (_name, end) => {
    const { h, id } = running({ directories: ['C:\\proj'] });

    h.terminal.output(id, osc99('C:\\proj', end));

    expect(h.activeTab()?.cwd).toBe('C:\\proj');
  });

  describe('Sequenz zwischen zwei Stücken getrennt', () => {
    const sequences: [string, string][] = [
      ['OSC 9;9 mit BEL', osc99('C:\\proj', BEL)],
      ['OSC 9;9 mit ESC \\', osc99('C:\\proj', ST)],
      ['OSC 7 mit ESC \\', osc7('file://rechner/C:/proj')],
      ['OSC 7 mit BEL', osc7('file://rechner/C:/proj', BEL)],
    ];

    it.each(sequences)('%s, an jeder Stelle', (_name, sequence) => {
      for (let cut = 1; cut < sequence.length; cut++) {
        const { h, id } = running({ directories: ['C:\\proj'] });

        h.terminal.output(id, `Ausgabe davor ${sequence.slice(0, cut)}`);
        h.terminal.output(id, `${sequence.slice(cut)}PS> `);

        expect(h.activeTab()?.cwd, `getrennt nach Zeichen ${cut}`).toBe('C:\\proj');
      }
    });

    it.each(sequences)('%s, Zeichen für Zeichen', (_name, sequence) => {
      const { h, id } = running({ directories: ['C:\\proj'] });

      for (const char of sequence) h.terminal.output(id, char);

      expect(h.activeTab()?.cwd).toBe('C:\\proj');
    });
  });

  it('nimmt bei mehreren Sequenzen pro Stück den letzten Ordner', () => {
    const { h, id } = running({ directories: ['C:\\a', 'C:\\b', 'C:\\c'] });
    const tabsEventsBefore = h.eventsOfType('tabs').length;

    h.terminal.output(id, `${osc99('C:\\a')}eins\r\n${osc99('C:\\b', ST)}zwei\r\n${osc7('file://rechner/C:/c')}PS> `);

    expect(h.activeTab()?.cwd).toBe('C:\\c');
    // Eine Änderung pro Stück, nicht eine pro Sequenz.
    expect(h.eventsOfType('tabs')).toHaveLength(tabsEventsBefore + 1);
  });

  it('dekodiert die Prozentkodierung von OSC 7', () => {
    const dir = 'C:\\Users\\tester\\Ordner mit äöü 100%';
    const { h, id } = running({ directories: [dir] });

    h.terminal.output(id, osc7('file://rechner/C:/Users/tester/Ordner%20mit%20%C3%A4%C3%B6%C3%BC%20100%25'));

    expect(h.activeTab()?.cwd).toBe(dir);
  });

  it('nimmt OSC 9;9 roh, ohne Prozentkodierung', () => {
    const dir = 'C:\\Users\\tester\\Rabatt 100%20';
    const { h, id } = running({ directories: [dir] });

    h.terminal.output(id, osc99(dir));

    expect(h.activeTab()?.cwd).toBe(dir);
  });

  it.each([
    ['/c/Users/tester/projekt', osc7('file://rechner/c/Users/tester/projekt'), 'C:\\Users\\tester\\projekt'],
    ['/d (Laufwerk allein)', osc7('file://rechner/d'), 'D:\\'],
    ['/c/… per OSC 9;9', osc99('/c/Users/tester'), 'C:\\Users\\tester'],
    ['UNC //server/freigabe', osc7('file://rechner//server/freigabe/x'), '\\\\server\\freigabe\\x'],
  ])('wandelt Git-Bash-Pfade um: %s', (_name, sequence, dir) => {
    const { h, id } = running({ directories: [dir] });

    h.terminal.output(id, sequence);

    expect(h.activeTab()?.cwd).toBe(dir);
  });

  it.each([
    ['in Anführungszeichen', osc99('"C:\\Program Files"'), 'C:\\Program Files'],
    ['mit Schrägstrichen und Trenner am Ende', osc99('C:/proj/sub/'), 'C:\\proj\\sub'],
    ['Laufwerk klein geschrieben', osc99('d:\\daten'), 'D:\\daten'],
    ['UNC', osc99('\\\\server\\freigabe'), '\\\\server\\freigabe'],
    ['OSC 7 ohne Rechner', osc7('file:///C:/proj'), 'C:\\proj'],
  ])('liest Windows-Pfade %s', (_name, sequence, dir) => {
    const { h, id } = running({ directories: [dir] });

    h.terminal.output(id, sequence);

    expect(h.activeTab()?.cwd).toBe(dir);
  });

  it('löst 8.3-Kurznamen in der Meldung auf', () => {
    const { h, id } = running({
      directories: ['C:\\Users\\anna.mueller\\proj'],
      shortPaths: { 'C:\\Users\\ANNA~1': 'C:\\Users\\anna.mueller' },
    });

    h.terminal.output(id, osc99('C:\\Users\\ANNA~1\\proj'));

    expect(h.activeTab()?.cwd).toBe('C:\\Users\\anna.mueller\\proj');
  });

  it.each([
    ['Registry (PowerShell)', osc99('HKLM:\\SOFTWARE')],
    ['Zertifikate (PowerShell)', osc99('Cert:\\CurrentUser')],
    ['Provider-Pfad', osc99('Microsoft.PowerShell.Core\\Registry::HKEY_CURRENT_USER')],
    ['Pfad eines entfernten Linux-Rechners', osc7('file://server/home/anna')],
    ['andere Adresse als file://', osc7('http://example.com/C:/proj')],
    ['relativer Pfad', osc99('proj')],
    ['Ordner, den es nicht gibt', osc99('C:\\gibt-es-nicht')],
    ['Datei statt Ordner', osc99('C:\\proj\\notizen.txt')],
    ['kaputte Prozentkodierung', osc7('file://rechner/C:/a%E4')],
    ['leere Meldung', osc99('')],
  ])('ignoriert Orte ausserhalb des Dateisystems: %s', (_name, sequence) => {
    const { h, id } = running({ directories: ['C:\\proj', 'C:\\a\u00e4'] });
    h.terminal.output(id, osc99('C:\\proj'));

    h.terminal.output(id, sequence);

    expect(h.activeTab()?.cwd).toBe('C:\\proj');
  });

  it('lässt sich von anderen Escape-Sequenzen nicht stören', () => {
    const { h, id } = running({ directories: ['C:\\proj', 'C:\\anders'] });

    h.terminal.output(
      id,
      [
        '\x1b]0;Fenstertitel\x07',
        '\x1b]9;4;1;50\x07', // Fortschritt, ebenfalls OSC 9
        '\x1b]133;A\x1b\\',
        '\x1b[32mgrün\x1b[0m',
        '\x1b]9;9;C:\\anders\x1b[0m', // abgebrochen: ESC ohne \
        osc99('C:\\proj'),
      ].join(''),
    );

    expect(h.activeTab()?.cwd).toBe('C:\\proj');
  });

  it('lässt die Sequenzen im Strom', () => {
    const { h, id } = running({ directories: ['C:\\proj'] });
    const chunk = `${osc99('C:\\proj')}PS C:\\proj> `;

    h.terminal.output(id, chunk);

    expect(h.eventsOfType('output').at(-1)).toEqual({ type: 'output', tabId: id, data: chunk });
  });

  it('speichert bei jedem Prompt im selben Ordner nicht erneut', () => {
    const storage = new MemoryStorage();
    const { h, id } = running({ storage, directories: ['C:\\proj'] });
    h.terminal.output(id, osc99('C:\\proj'));
    const saves = storage.saves;
    const tabsEvents = h.eventsOfType('tabs').length;

    for (let i = 0; i < 3; i++) h.terminal.output(id, `${osc99('C:\\proj')}PS C:\\proj> `);

    expect(storage.saves).toBe(saves);
    expect(h.eventsOfType('tabs')).toHaveLength(tabsEvents);
  });

  it('setzt eine angefangene Sequenz einer beendeten Shell beim nächsten Start nicht fort', () => {
    const { h, id } = running({ homeDir: 'C:\\Users\\anna', directories: ['C:\\proj'] });
    h.terminal.output(id, '\x1b]9;9;C:\\proj');
    h.terminal.exit(id, 1);
    h.workspace.restartTab(id);

    h.terminal.output(id, `${BEL}PS> `);

    expect(h.activeTab()?.cwd).toBe('C:\\Users\\anna');
  });
});

describe('Wiederherstellen im zuletzt aktiven Ordner', () => {
  it('behält den Ordner über einen Neustart und startet die Shell dort', async () => {
    const { h, id } = running({ directories: ['C:\\proj'] });
    h.terminal.output(id, osc99('C:\\proj'));

    await h.restart();

    expect(h.tabs()).toMatchObject([{ id, cwd: 'C:\\proj' }]);
    h.showAllViews();
    expect(h.terminal.startsFor(id)[0].order.cwd).toBe('C:\\proj');
  });

  it('startet eine beendete Shell im zuletzt aktiven Ordner neu', () => {
    const { h, id } = running({ directories: ['C:\\proj'] });
    h.terminal.output(id, osc99('C:\\proj'));
    h.terminal.exit(id, 0);

    h.workspace.restartTab(id);

    expect(h.terminal.startsFor(id)[1].order.cwd).toBe('C:\\proj');
  });

  describe('Rückfallkette, wenn der zuletzt aktive Ordner gelöscht wurde', () => {
    /** Ein Tab mit Startordner C:\start, der zuletzt in C:\proj war. */
    async function tabThatWasIn(options: TestWorkspaceOptions) {
      const h = startWorkspace({ ...options, directories: ['C:\\start', 'C:\\proj', 'D:\\default'] });
      h.workspace.updateSettings({ defaultCwd: 'C:\\start' });
      const id = h.workspace.createTab();
      h.workspace.viewReady(id, 120, 30);
      h.terminal.output(id, osc99('C:\\proj'));
      return { h, id };
    }

    it('fällt auf den Startordner zurück', async () => {
      const { h, id } = await tabThatWasIn({});
      h.system.removeDirectory('C:\\proj');

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(id)[0].order.cwd).toBe('C:\\start');
    });

    it('dann auf den Standardordner', async () => {
      const { h, id } = await tabThatWasIn({});
      h.workspace.updateSettings({ defaultCwd: 'D:\\default' });
      h.system.removeDirectory('C:\\proj');
      h.system.removeDirectory('C:\\start');

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(id)[0].order.cwd).toBe('D:\\default');
    });

    it('dann auf den Benutzerordner', async () => {
      const { h, id } = await tabThatWasIn({ homeDir: 'C:\\Users\\anna' });
      h.system.removeDirectory('C:\\proj');
      h.system.removeDirectory('C:\\start');

      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(id)[0].order.cwd).toBe('C:\\Users\\anna');
    });
  });
});
