import { useRef } from 'react';
import { FONT_SIZE, type Settings, type Theme } from '../../shared/types';
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
  onClose(): void;
}

/**
 * Einstellungen, geöffnet über das Zahnrad: Standardordner, Design und Schriftgrösse; weitere Felder
 * (Standard-Shell, Hinweise) kommen mit späteren Tickets dazu, je als eigene Zeile in ihrem Abschnitt.
 * Jede Änderung geht sofort an den Kern und wirkt ohne „Fertig“; der Dialog zeigt, was der Kern meldet.
 */
export function SettingsDialog({ settings, homeDir, onClose }: SettingsDialogProps) {
  const changeRef = useRef<HTMLButtonElement>(null);
  const folder = settings.defaultCwd;
  const { theme, fontSize } = settings;

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
    </Dialog>
  );
}
