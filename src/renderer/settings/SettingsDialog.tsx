import { useRef } from 'react';
import type { Settings, ShellOption } from '../../shared/types';
import { Dialog } from '../popup/Dialog';

const api = window.thub;

interface SettingsDialogProps {
  settings: Settings;
  /** Benutzerordner; gilt, solange kein Standardordner eingestellt ist. */
  homeDir: string;
  /** Die erkannten Shells zur Wahl der Standard-Shell. */
  shells: ShellOption[];
  /** Die Standard-Shell, wie sie der Kern aus der Einstellung ableitet. */
  defaultShellId: string;
  onClose(): void;
}

/**
 * Einstellungen, geöffnet über das Zahnrad. Bisher mit Standardordner und Standard-Shell; weitere Felder
 * (Design, Schriftgrösse, Hinweise) kommen mit späteren Tickets dazu, je als eigene Zeile in ihrem Abschnitt.
 * Jede Änderung geht sofort an den Kern; der Dialog zeigt, was der Kern meldet.
 */
export function SettingsDialog({ settings, homeDir, shells, defaultShellId, onClose }: SettingsDialogProps) {
  const changeRef = useRef<HTMLButtonElement>(null);
  const folder = settings.defaultCwd;

  const pickFolder = async () => {
    const dir = await api.pickDirectory('defaultCwd');
    if (dir) api.send({ type: 'updateSettings', patch: { defaultCwd: dir } });
  };

  const resetFolder = () => {
    api.send({ type: 'updateSettings', patch: { defaultCwd: '' } });
    // „Zurücksetzen“ verschwindet gleich; der Fokus bleibt im Dialog.
    changeRef.current?.focus();
  };

  return (
    <Dialog
      title="Einstellungen"
      wide
      onClose={onClose}
      actions={
        <button type="button" className="btn primary" data-autofocus onClick={onClose}>
          Fertig
        </button>
      }
    >
      <section className="set-section">
        <h4>Allgemein</h4>
        <div className="set-row">
          <div>
            <div className="set-label">Standardordner</div>
            <div className="set-desc">Hier starten neue Terminals.</div>
          </div>
          <div className="set-ctl">
            <span className={folder ? 'path-box' : 'path-box placeholder'} title={folder || homeDir}>
              {folder || 'Benutzerordner'}
            </span>
            <button type="button" ref={changeRef} className="btn sm" onClick={() => void pickFolder()}>
              Ändern …
            </button>
            {folder && (
              <button type="button" className="btn sm" onClick={resetFolder}>
                Zurücksetzen
              </button>
            )}
          </div>
        </div>
        <div className="set-row">
          <div>
            <div className="set-label">Standard-Shell</div>
            <div className="set-desc">
              Für <kbd>+</kbd> und <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>.
            </div>
          </div>
          <div className="set-ctl">
            <select
              className="select"
              aria-label="Standard-Shell"
              value={defaultShellId}
              onChange={(e) => api.send({ type: 'updateSettings', patch: { defaultShellId: e.target.value } })}
            >
              {shells.map((shell) => (
                <option key={shell.id} value={shell.id}>
                  {shell.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </Dialog>
  );
}
