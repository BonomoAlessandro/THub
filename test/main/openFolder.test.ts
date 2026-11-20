import { afterEach, describe, expect, it, vi } from 'vitest';
import { openTabFolder, type FolderOpener } from '../../src/main/openFolder';
import { startWorkspace, type TestWorkspace } from '../support/harness';

// „Ordner im Explorer öffnen“ mit nachgemachtem `shell.openPath`: Ein echtes Explorer-Fenster ginge auf dem Desktop
// des Nutzers auf. Ob der Explorer wirklich den richtigen Ordner zeigt, steht in der Prüfliste „Abnahme von Hand“.

const PROJ = 'C:\\proj';
const SUB = 'C:\\proj\\src';

/** `shell.openPath`, nachgemacht: merkt sich die geöffneten Pfade und meldet `error` (leer heisst Erfolg). */
function fakeOpener(h: TestWorkspace, error = ''): FolderOpener & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    directoryExists: (dir) => h.system.directoryExists(dir),
    openPath: (dir) => {
      opened.push(dir);
      return Promise.resolve(error);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Ordner im Explorer öffnen', () => {
  it('öffnet den aktuellen Ordner des Tabs, auch nach cd', async () => {
    const h = startWorkspace({ directories: [PROJ, SUB] });
    const tab = h.workspace.createTab({ cwd: PROJ });
    const opener = fakeOpener(h);

    expect(await openTabFolder(h.workspace, tab, opener)).toBe(PROJ);

    h.showAllViews();
    h.terminal.output(tab, `\x1b]9;9;${SUB}\x07`);
    expect(await openTabFolder(h.workspace, tab, opener)).toBe(SUB);

    expect(opener.opened).toEqual([PROJ, SUB]);
  });

  it('öffnet nichts für unbekannte Tabs und Kennungen, die keine Zeichenkette sind', async () => {
    const h = startWorkspace({ directories: [PROJ] });
    const opener = fakeOpener(h);

    expect(await openTabFolder(h.workspace, 'gibt-es-nicht', opener)).toBeNull();
    expect(await openTabFolder(h.workspace, { id: 1 }, opener)).toBeNull();
    expect(await openTabFolder(h.workspace, undefined, opener)).toBeNull();

    expect(opener.opened).toEqual([]);
  });

  it('öffnet nichts, wenn es den Ordner nicht mehr gibt, und meldet das', async () => {
    const h = startWorkspace({ directories: [PROJ] });
    const tab = h.workspace.createTab({ cwd: PROJ });
    h.system.removeDirectory(PROJ);
    const opener = fakeOpener(h);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await openTabFolder(h.workspace, tab, opener)).toBeNull();

    expect(opener.opened).toEqual([]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(PROJ));
  });

  it('meldet einen Fehler von shell.openPath', async () => {
    const h = startWorkspace({ directories: [PROJ] });
    const tab = h.workspace.createTab({ cwd: PROJ });
    const opener = fakeOpener(h, 'Zugriff verweigert');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await openTabFolder(h.workspace, tab, opener)).toBeNull();

    expect(opener.opened).toEqual([PROJ]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('Zugriff verweigert'));
  });
});
