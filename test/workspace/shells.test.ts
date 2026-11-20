import { describe, expect, it } from 'vitest';
import type { ShellInfo } from '../../src/main/workspace/ports';
import { startWorkspace } from '../support/harness';

// Der Kern mit den Listen, die die Shell-Erkennung auf verschiedenen Rechnern liefern würde.

const PWSH: ShellInfo = {
  id: 'pwsh',
  name: 'PowerShell 7',
  file: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  args: [],
  capturesClaude: true,
  integration: 'powershell',
};
const POWERSHELL: ShellInfo = {
  id: 'powershell',
  name: 'Windows PowerShell',
  file: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  args: [],
  capturesClaude: true,
  integration: 'powershell',
};
const CMD: ShellInfo = {
  id: 'cmd',
  name: 'Eingabeaufforderung',
  file: 'C:\\Windows\\System32\\cmd.exe',
  args: [],
  capturesClaude: true,
  integration: 'cmd',
};
const GIT_BASH: ShellInfo = {
  id: 'gitbash',
  name: 'Git Bash',
  file: 'C:\\Program Files\\Git\\bin\\bash.exe',
  args: ['--login', '-i'],
  capturesClaude: true,
  integration: 'bash',
};
const UBUNTU: ShellInfo = {
  id: 'wsl:Ubuntu',
  name: 'Ubuntu (WSL)',
  file: 'C:\\Windows\\System32\\wsl.exe',
  args: ['-d', 'Ubuntu'],
  capturesClaude: false,
};

/** Alles installiert. */
const ALL = [PWSH, POWERSHELL, CMD, GIT_BASH, UBUNTU];
/** Ein Rechner ohne PowerShell 7. */
const WITHOUT_PWSH = [POWERSHELL, CMD, GIT_BASH, UBUNTU];
const WITHOUT_GIT_BASH = [PWSH, POWERSHELL, CMD, UBUNTU];
const WITHOUT_WSL = [PWSH, POWERSHELL, CMD, GIT_BASH];

describe('Shells', () => {
  describe('Standard-Shell', () => {
    it('ist PowerShell 7, wenn es sie gibt', () => {
      const h = startWorkspace({ shells: ALL });
      const id = h.activeTab()!.id;

      h.workspace.viewReady(id, 80, 24);

      expect(h.snapshot().defaultShellId).toBe('pwsh');
      expect(h.activeTab()).toMatchObject({ shellId: 'pwsh', shellName: 'PowerShell 7' });
      expect(h.terminal.starts[0].order).toMatchObject({ file: PWSH.file, args: [] });
    });

    it('ist ohne PowerShell 7 Windows PowerShell', () => {
      const h = startWorkspace({ shells: WITHOUT_PWSH });
      const id = h.activeTab()!.id;

      h.workspace.viewReady(id, 80, 24);

      expect(h.snapshot().defaultShellId).toBe('powershell');
      expect(h.activeTab()).toMatchObject({ shellId: 'powershell', shellName: 'Windows PowerShell' });
      expect(h.terminal.starts[0].order).toMatchObject({ file: POWERSHELL.file, args: [] });
    });

    it('ist ohne beide PowerShells die erste erkannte Shell', () => {
      const h = startWorkspace({ shells: [CMD, GIT_BASH] });

      expect(h.snapshot().defaultShellId).toBe('cmd');
      expect(h.activeTab()?.shellId).toBe('cmd');
    });

    it('lässt sich in den Einstellungen ändern; das gilt für neue Tabs, nicht für offene', () => {
      const h = startWorkspace({ shells: ALL });
      const first = h.activeTab()!.id;

      h.workspace.updateSettings({ defaultShellId: 'gitbash' });
      const second = h.workspace.createTab();

      expect(h.events.find((e) => e.type === 'settings')).toMatchObject({
        settings: { defaultShellId: 'gitbash' },
        defaultShellId: 'gitbash',
      });
      expect(h.snapshot().defaultShellId).toBe('gitbash');
      expect(h.tabs().map((t) => [t.id, t.shellId])).toEqual([
        [first, 'pwsh'],
        [second, 'gitbash'],
      ]);
    });

    it('fällt auf PowerShell 7 zurück, solange die eingestellte Shell fehlt, und behält die Einstellung', async () => {
      const h = startWorkspace({ shells: ALL });
      h.workspace.updateSettings({ defaultShellId: 'gitbash' });

      await h.restart({ shells: WITHOUT_GIT_BASH });
      h.workspace.createTab();

      expect(h.snapshot()).toMatchObject({ defaultShellId: 'pwsh', settings: { defaultShellId: 'gitbash' } });
      expect(h.activeTab()?.shellId).toBe('pwsh');

      await h.restart({ shells: ALL });
      expect(h.snapshot().defaultShellId).toBe('gitbash');
    });
  });

  describe('Shell wählen', () => {
    it('listet die erkannten Shells im Schnappschuss, in der Reihenfolge der Erkennung', () => {
      const h = startWorkspace({ shells: ALL });

      expect(h.snapshot().shells).toEqual([
        { id: 'pwsh', name: 'PowerShell 7' },
        { id: 'powershell', name: 'Windows PowerShell' },
        { id: 'cmd', name: 'Eingabeaufforderung' },
        { id: 'gitbash', name: 'Git Bash' },
        { id: 'wsl:Ubuntu', name: 'Ubuntu (WSL)' },
      ]);
    });

    it('öffnet einen Tab mit der gewählten Shell im Standardordner; der Startauftrag hat ihr Programm und ihre Argumente', () => {
      const h = startWorkspace({ shells: ALL, directories: ['D:\\work'] });
      h.workspace.updateSettings({ defaultCwd: 'D:\\work' });

      const id = h.workspace.createTab({ shellId: 'gitbash' });
      h.workspace.viewReady(id, 100, 30);

      expect(h.activeTab()).toMatchObject({ id, name: 'work', shellId: 'gitbash', shellName: 'Git Bash', cwd: 'D:\\work' });
      expect(h.terminal.startsFor(id)).toMatchObject([
        { order: { file: GIT_BASH.file, args: ['--login', '-i'], integration: 'bash', cwd: 'D:\\work', cols: 100, rows: 30 } },
      ]);
    });

    it('nimmt für eine nicht erkannte Shell die Standard-Shell', () => {
      const h = startWorkspace({ shells: WITHOUT_WSL });

      h.workspace.createTab({ shellId: 'wsl:Ubuntu' });

      expect(h.activeTab()?.shellId).toBe('pwsh');
    });
  });

  describe('Neustart', () => {
    it('ein Tab behält seine Shell und startet wieder mit ihr', async () => {
      const h = startWorkspace({ shells: ALL });
      const id = h.workspace.createTab({ shellId: 'gitbash' });

      await h.restart();
      h.showAllViews();

      expect(h.tabs().map((t) => t.shellId)).toEqual(['pwsh', 'gitbash']);
      expect(h.terminal.startsFor(id)).toMatchObject([{ order: { file: GIT_BASH.file, args: ['--login', '-i'] } }]);
      expect(h.eventsOfType('notice')).toEqual([]);
    });

    it('fehlt die Shell, startet der Tab mit der Standard-Shell und zeigt davor einen Hinweis im Terminal', async () => {
      const h = startWorkspace({ shells: ALL });
      const id = h.workspace.createTab({ shellId: 'gitbash' });

      await h.restart({ shells: WITHOUT_GIT_BASH });
      h.workspace.viewReady(id, 80, 24);

      expect(h.terminal.startsFor(id)).toMatchObject([{ order: { file: PWSH.file, args: [], integration: 'powershell' } }]);
      expect(h.eventsOfType('notice')).toEqual([
        {
          type: 'notice',
          tabId: id,
          level: 'info',
          text: 'Git Bash wurde auf diesem Rechner nicht gefunden. Der Tab startet mit der Standard-Shell PowerShell 7.',
          beforeStart: true,
        },
      ]);
      // Der Hinweis kommt vor dem Start, also vor der ersten Ausgabe der Shell.
      const noticeAt = h.events.findIndex((e) => e.type === 'notice');
      const runningAt = h.events.findIndex(
        (e) => e.type === 'tabs' && e.tabs.some((t) => t.id === id && t.process === 'running'),
      );
      expect(noticeAt).toBeGreaterThanOrEqual(0);
      expect(noticeAt).toBeLessThan(runningAt);
      expect(h.tabs().find((t) => t.id === id)?.shellName).toBe('PowerShell 7');
    });

    it('nennt eine fehlende WSL-Distribution beim Namen', async () => {
      const h = startWorkspace({ shells: ALL });
      const id = h.workspace.createTab({ shellId: 'wsl:Ubuntu' });

      await h.restart({ shells: WITHOUT_WSL });
      h.workspace.viewReady(id, 80, 24);

      expect(h.eventsOfType('notice')).toMatchObject([
        { tabId: id, text: 'Ubuntu (WSL) wurde auf diesem Rechner nicht gefunden. Der Tab startet mit der Standard-Shell PowerShell 7.' },
      ]);
      expect(h.terminal.startsFor(id)).toMatchObject([{ order: { file: PWSH.file, args: [] } }]);
    });

    it('behält beim Rückfall seine Shell und startet wieder mit ihr, sobald es sie wieder gibt', async () => {
      const h = startWorkspace({ shells: ALL });
      const id = h.workspace.createTab({ shellId: 'gitbash' });
      await h.restart({ shells: WITHOUT_GIT_BASH });
      h.showAllViews();

      expect(h.storedTab(id)?.shellId).toBe('gitbash');

      await h.restart({ shells: ALL });
      h.showAllViews();

      expect(h.terminal.startsFor(id)).toMatchObject([{ order: { file: GIT_BASH.file } }]);
      expect(h.eventsOfType('notice')).toEqual([]);
    });

    it('zeigt den Hinweis nur vor dem ersten Start, nicht beim Neustart der beendeten Shell', async () => {
      const h = startWorkspace({ shells: ALL });
      const id = h.workspace.createTab({ shellId: 'gitbash' });
      await h.restart({ shells: WITHOUT_GIT_BASH });
      h.workspace.viewReady(id, 80, 24);

      h.terminal.exit(id, 0);
      h.workspace.restartTab(id);

      expect(h.eventsOfType('notice')).toHaveLength(1);
      expect(h.terminal.startsFor(id).map((s) => s.order.file)).toEqual([PWSH.file, PWSH.file]);
    });

    it('fällt auf die eingestellte Standard-Shell zurück', async () => {
      const h = startWorkspace({ shells: ALL });
      const id = h.workspace.createTab({ shellId: 'wsl:Ubuntu' });
      h.workspace.updateSettings({ defaultShellId: 'cmd' });

      await h.restart({ shells: WITHOUT_WSL });
      h.workspace.viewReady(id, 80, 24);

      expect(h.terminal.startsFor(id)).toMatchObject([{ order: { file: CMD.file } }]);
      expect(h.eventsOfType('notice')[0].text).toContain('Standard-Shell Eingabeaufforderung');
    });
  });

  describe('WSL', () => {
    it('startet einen WSL-Tab mit -d <Distribution> --cd <Ordner>', () => {
      const h = startWorkspace({ shells: ALL, directories: ['D:\\proj'] });

      const id = h.workspace.createTab({ shellId: 'wsl:Ubuntu', cwd: 'D:\\proj' });
      h.workspace.viewReady(id, 80, 24);

      expect(h.activeTab()).toMatchObject({ name: 'proj', shellName: 'Ubuntu (WSL)' });
      expect(h.terminal.startsFor(id)).toMatchObject([
        { order: { file: UBUNTU.file, args: ['-d', 'Ubuntu', '--cd', 'D:\\proj'], cwd: 'D:\\proj' } },
      ]);
    });

    it('übergibt mit --cd den Ordner, in dem der Tab tatsächlich startet', async () => {
      const h = startWorkspace({ shells: ALL, directories: ['D:\\proj'] });
      const id = h.workspace.createTab({ shellId: 'wsl:Ubuntu', cwd: 'D:\\proj' });

      h.system.removeDirectory('D:\\proj');
      await h.restart();
      h.showAllViews();

      expect(h.terminal.startsFor(id)).toMatchObject([
        { order: { args: ['-d', 'Ubuntu', '--cd', 'C:\\Users\\tester'], cwd: 'C:\\Users\\tester' } },
      ]);
    });

    it('gibt Windows-Shells kein --cd mit', () => {
      const h = startWorkspace({ shells: ALL });

      h.showAllViews();

      expect(h.terminal.starts[0].order.args).toEqual([]);
    });
  });
});
