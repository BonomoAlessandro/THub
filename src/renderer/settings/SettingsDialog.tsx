import { useRef } from 'react';
import type { Settings } from '../../shared/types';
import { Dialog } from '../popup/Dialog';

const api = window.thub;

interface SettingsDialogProps {
  settings: Settings;
  /** Benutzerordner; gilt, solange kein Standardordner eingestellt ist. */
  homeDir: string;
  onClose(): void;
}

/**
 * Einstellungen, geöffnet über das Zahnrad. Bisher mit dem Standardordner; weitere Felder (Standard-Shell,
 * Design, Schriftgrösse, Hinweise) kommen mit späteren Tickets dazu, je als eigene Zeile in ihrem Abschnitt.
 * Jede Änderung geht sofort an den Kern; der Dialog zeigt, was der Kern meldet.
 */
export function SettingsDialog({ settings, homeDir, onClose }: SettingsDialogProps) {
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
      </section>
    </Dialog>
  );
}
