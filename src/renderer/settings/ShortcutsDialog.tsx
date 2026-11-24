import { Fragment } from 'react';
import { Dialog } from '../popup/Dialog';
import { shortcutOverview, type KeyCombo } from '../shortcuts';

interface ShortcutsDialogProps {
  onClose(): void;
}

/**
 * Übersicht der Tastenkürzel im Stil der Einstellungen, gruppiert nach Tabs, Bearbeiten, Darstellung und Fenster.
 * Erzeugt aus derselben Tabelle, nach der die Tasten verarbeitet werden (`shortcuts.ts`), damit sie nie veraltet.
 * Geöffnet über „Tastenkürzel anzeigen“ in der Befehlspalette und „Alle Tastenkürzel …“ in den Einstellungen.
 */
export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  return (
    <Dialog
      title="Tastenkürzel"
      wide
      onClose={onClose}
      actions={
        <button type="button" className="btn primary" data-autofocus onClick={onClose}>
          Fertig
        </button>
      }
    >
      <ShortcutList />
      <p className="hint">
        Alle anderen Tasten gehen ans Terminal, auch <kbd>Ctrl</kbd>+<kbd>K</kbd> und <kbd>Ctrl</kbd>+<kbd>C</kbd> ohne
        Markierung.
      </p>
    </Dialog>
  );
}

/** Die Abschnitte der Übersicht mit ihren Kürzeln, je eine Zeile wie in den Einstellungen. */
export function ShortcutList() {
  return (
    // Mit der Tastatur erreichbar, damit sich eine lange Liste auch ohne Maus scrollen lässt.
    <div className="keys-list" tabIndex={0} aria-label="Alle Tastenkürzel">
      {shortcutOverview().map(({ group, shortcuts }) => (
        <section key={group} className="set-section">
          <h4>{group}</h4>
          {shortcuts.map(({ shortcut, combos }) => (
            <div key={shortcut.id} className="set-row">
              <div className="set-label">{shortcut.label}</div>
              <div className="set-ctl">
                {combos.map((combo, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="keys-or">oder</span>}
                    <Combo combo={combo} />
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Eine Tastenkombination: Tasten mit „+“ dazwischen, z.B. Ctrl+Shift+T, Ctrl+1 … 9, Ctrl + Mausrad oder
 * Ctrl+C (nur mit Markierung).
 */
function Combo({ combo }: { combo: KeyCombo }) {
  return (
    <span className="combo">
      {combo.keys.map((key, i) => (
        <Fragment key={i}>
          {i > 0 && '+'}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
      {combo.through && (
        <>
          {' … '}
          <kbd>{combo.through}</kbd>
        </>
      )}
      {combo.gesture && ` + ${combo.gesture}`}
      {combo.note && ` (${combo.note})`}
    </span>
  );
}
