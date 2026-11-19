import { describe, expect, it } from 'vitest';
import { shellEnv } from '../../src/main/shellEnv';

describe('Umgebung der Shells', () => {
  it('übernimmt die eigene Umgebung', () => {
    expect(shellEnv({ PATH: 'C:\\Windows', USERPROFILE: 'C:\\Users\\ich' })).toEqual({
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
      TERMHUB_TAB_ID: 'c',
      TermHub_Token: 'd',
      THUBX: 'bleibt',
    });

    expect(env).toEqual({ PATH: 'C:\\Windows', THUBX: 'bleibt' });
  });

  it('entfernt npm- und Electron-Interna aus dem Dev-Start', () => {
    expect(shellEnv({ PATH: 'C:\\Windows', npm_lifecycle_event: 'start', ELECTRON_RUN_AS_NODE: '1' })).toEqual({
      PATH: 'C:\\Windows',
    });
  });
});
