import { describe, expect, it } from 'vitest';
import { shellEnv } from '../../src/main/shellEnv';

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
});
