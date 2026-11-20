import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shellEnv } from '../../src/main/shellEnv';
import { makeTempDir } from '../support/tempDir';

describe('Umgebung der Shells', () => {
  it('übernimmt die eigene Umgebung', () => {
    expect(shellEnv({ PATH: 'C:\\Windows', USERPROFILE: 'C:\\Users\\ich' })).toMatchObject({
      PATH: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\ich',
    });
  });

  it('entfernt geerbte THUB_* und die alten TERMHUB_*, gleich wie geschrieben', () => {
    const env = shellEnv({
      PATH: 'C:\\Windows',
      THUB_TAB_ID: 'a',
      THUB_API: 'http://127.0.0.1:1',
      thub_token: 'b',
      THUB_START_CMD: 'claude',
      TERMHUB_TAB_ID: 'c',
      TermHub_Token: 'd',
      THUBX: 'bleibt',
    });

    expect(Object.keys(env).sort()).toEqual(['NO_PROXY', 'PATH', 'THUBX']);
  });

  it('entfernt npm- und Electron-Interna aus dem Dev-Start', () => {
    const env = shellEnv({ PATH: 'C:\\Windows', npm_lifecycle_event: 'start', ELECTRON_RUN_AS_NODE: '1' });

    expect(Object.keys(env).sort()).toEqual(['NO_PROXY', 'PATH']);
  });

  describe('NO_PROXY', () => {
    it('enthält 127.0.0.1 und localhost, auch ohne geerbten Wert', () => {
      expect(shellEnv({ PATH: 'C:\\Windows' }).NO_PROXY).toBe('127.0.0.1,localhost');
    });

    it('ergänzt einen geerbten Wert, ohne Doppelte', () => {
      expect(shellEnv({ NO_PROXY: 'intranet.example, LOCALHOST' }).NO_PROXY).toBe('intranet.example,LOCALHOST,127.0.0.1');
    });

    it('fasst no_proxy und NO_PROXY zu einer Variablen zusammen', () => {
      const env = shellEnv({ no_proxy: '.corp.example' });

      expect(env).not.toHaveProperty('no_proxy');
      expect(env.NO_PROXY).toBe('.corp.example,127.0.0.1,localhost');
    });
  });

  // Wurde THub aus PowerShell 7 gestartet, stehen dessen Modulordner vorne in PSModulePath; Windows PowerShell kann
  // dann Microsoft.PowerShell.Security nicht laden. Dass es danach in echten Shells lädt, prüft Teststelle 2.
  describe('PSModulePath', () => {
    const WINDOWS_POWERSHELL = [
      'C:\\Users\\anna\\Documents\\WindowsPowerShell\\Modules',
      'C:\\Program Files\\WindowsPowerShell\\Modules',
      'C:\\WINDOWS\\system32\\WindowsPowerShell\\v1.0\\Modules',
      'C:\\Program Files\\Microsoft Monitoring Agent\\Agent\\PowerShell\\',
      'D:\\Eigene Module',
    ];
    /** Wo ein pwsh.exe liegt: PowerShell 7 aus dem Store und aus dem Installer. */
    const PWSH_HOMES = [
      'c:\\program files\\windowsapps\\microsoft.powershell_7.7.0.0_x64__8wekyb3d8bbwe',
      'C:\\Program Files\\PowerShell\\7',
    ];
    const isFile = (file: string) => PWSH_HOMES.some((home) => file.toLowerCase() === `${home}\\pwsh.exe`.toLowerCase());

    it('nimmt die Modulordner von PowerShell 7 weg, die von Windows PowerShell und eigene bleiben in ihrer Reihenfolge', () => {
      const fromPwsh = [
        'C:\\Users\\anna\\Documents\\PowerShell\\Modules',
        'C:\\Program Files\\PowerShell\\Modules',
        `${PWSH_HOMES[0]}\\Modules`,
        ...WINDOWS_POWERSHELL,
      ].join(';');

      expect(shellEnv({ PSModulePath: fromPwsh }, isFile).PSModulePath).toBe(WINDOWS_POWERSHELL.join(';'));
    });

    it.each([
      ['umgeleitete Dokumente', 'C:\\Users\\anna\\OneDrive - Firma\\Dokumente\\PowerShell\\Modules'],
      ['abschliessender Trenner', 'C:\\Program Files\\PowerShell\\Modules\\'],
      ['$PSHOME des Installers', 'C:\\Program Files\\PowerShell\\7\\Modules'],
      ['Gross-/Kleinschreibung', 'c:\\users\\anna\\documents\\powershell\\modules'],
    ])('erkennt auch: %s', (_name, entry) => {
      expect(shellEnv({ PSModulePath: `${entry};${WINDOWS_POWERSHELL[2]}` }, isFile).PSModulePath).toBe(WINDOWS_POWERSHELL[2]);
    });

    it('lässt einen PSModulePath ohne Ordner von PowerShell 7 unverändert', () => {
      expect(shellEnv({ PSModulePath: WINDOWS_POWERSHELL.join(';') }, isFile).PSModulePath).toBe(WINDOWS_POWERSHELL.join(';'));
    });

    it('lässt die Variable weg, wenn nur Ordner von PowerShell 7 drinstehen; Windows PowerShell nimmt dann seine eigenen', () => {
      const env = shellEnv({ PSMODULEPATH: 'C:\\Users\\anna\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules' }, isFile);

      expect(Object.keys(env).map((k) => k.toUpperCase())).not.toContain('PSMODULEPATH');
    });

    it('findet pwsh.exe im echten Dateisystem', () => {
      const home = path.join(makeTempDir(), 'pwsh zip');
      fs.mkdirSync(path.join(home, 'Modules'), { recursive: true });
      fs.writeFileSync(path.join(home, 'pwsh.exe'), '');

      expect(shellEnv({ PSModulePath: `${path.join(home, 'Modules')};${WINDOWS_POWERSHELL[2]}` }).PSModulePath).toBe(
        WINDOWS_POWERSHELL[2],
      );
    });
  });
});
