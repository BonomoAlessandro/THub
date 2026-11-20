import { useRef } from 'react';
import { FONT_SIZE, type Settings, type ShellOption, type Theme } from '../../shared/types';
import { Dialog } from '../popup/Dialog';

const api = window.thub;

/** Die Wahl des Designs, in der Reihenfolge des Prototyps. */
const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

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
 * Einstellungen, geöffnet über das Zahnrad: Standardordner, Standard-Shell, Design, Schriftgrösse, Hinweise im Fenster
 * und offene Punkte aus Claudes Antworten; weitere Felder kommen mit späteren Tickets dazu, je als eigene Zeile in ihrem
 * Abschnitt.
 * Jede Änderung geht sofort an den Kern und wirkt ohne „Fertig“; der Dialog zeigt, was der Kern meldet.
 */
export function SettingsDialog({ settings, homeDir, shells, defaultShellId, onClose }: SettingsDialogProps) {
  const changeRef = useRef<HTMLButtonElement>(null);
  const folder = settings.defaultCwd;
  const { theme, fontSize, notifications, openPoints } = settings;

  const update = (patch: Partial<Settings>) => api.send({ type: 'updateSettings', patch });

  const pickFolder = async () => {
    const dir = await api.pickDirectory('defaultCwd');
    if (dir) update({ defaultCwd: dir });
  };

  const resetFolder = () => {
    update({ defaultCwd: '' });
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
              onChange={(e) => update({ defaultShellId: e.target.value })}
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

      <section className="set-section">
        <h4>Darstellung</h4>
        <div className="set-row">
          <div>
            <div className="set-label">Design</div>
            <div className="set-desc">„System“ folgt der Einstellung von Windows.</div>
          </div>
          <div className="set-ctl">
            <div className="seg" role="group" aria-label="Design">
              {THEMES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={theme === value ? 'on' : undefined}
                  aria-pressed={theme === value}
                  onClick={() => update({ theme: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="set-row">
          <div>
            <div className="set-label">Schriftgrösse im Terminal</div>
            <div className="set-desc">
              Auch mit <kbd>Ctrl</kbd> + Mausrad.
            </div>
          </div>
          <div className="set-ctl">
            <div className="stepper" role="group" aria-label="Schriftgrösse im Terminal">
              <button
                type="button"
                aria-label="Kleiner"
                disabled={fontSize <= FONT_SIZE.min}
                onClick={() => api.send({ type: 'stepFontSize', step: -1 })}
              >
                −
              </button>
              <span aria-live="polite">{fontSize}</span>
              <button
                type="button"
                aria-label="Grösser"
                disabled={fontSize >= FONT_SIZE.max}
                onClick={() => api.send({ type: 'stepFontSize', step: 1 })}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="set-section">
        <h4>Hinweise</h4>
        <div className="set-row">
          <div>
            <div className="set-label">Hinweise im Fenster</div>
            <div className="set-desc">Meldet, wenn Claude in einem anderen Tab wartet oder fertig ist.</div>
          </div>
          <div className="set-ctl">
            <button
              type="button"
              role="switch"
              className={notifications ? 'switch on' : 'switch'}
              aria-checked={notifications}
              aria-label="Hinweise im Fenster"
              onClick={() => update({ notifications: !notifications })}
            />
          </div>
        </div>
        <div className="set-row">
          <div>
            <div className="set-label">Offene Punkte aus Claudes Antworten anzeigen</div>
            <div className="set-desc">
              Fragen und offene Punkte am Ende einer Antwort bleiben stehen, bis du sie schliesst.
            </div>
          </div>
          <div className="set-ctl">
            <button
              type="button"
              role="switch"
              className={openPoints ? 'switch on' : 'switch'}
              aria-checked={openPoints}
              aria-label="Offene Punkte aus Claudes Antworten anzeigen"
              onClick={() => update({ openPoints: !openPoints })}
            />
          </div>
        </div>
      </section>
    </Dialog>
  );
}
