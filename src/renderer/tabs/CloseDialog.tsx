import type { BusyReason } from '../../shared/types';
import { Dialog } from '../popup/Dialog';
import type { CloseQuestion } from '../useWorkspace';
import { STATUS_TEXT } from './TabIcon';

/** Was beim Schliessen eines einzelnen Tabs verloren geht (Wortlaut aus dem Prototyp). */
const REASON_TEXT: Record<BusyReason, string> = {
  working: 'Claude arbeitet gerade. Die laufende Antwort wird abgebrochen.',
  waiting: 'Claude wartet auf deine Antwort.',
  processes: 'Es läuft noch ein Programm. Es wird beim Schliessen beendet.',
};

const SHORTCUT = (
  <>
    <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
  </>
);

interface CloseDialogProps {
  question: CloseQuestion;
  /** `true`: schliessen; `false`: abbrechen (Knopf, Escape oder Klick daneben). */
  onAnswer(confirmed: boolean): void;
}

/**
 * Rückfrage vor dem Schliessen wie im Prototyp, für einen Tab oder für mehrere („Andere Tabs schliessen“) mit der Liste
 * der Tabs, in denen noch etwas läuft. Den Fokus hat „Abbrechen“; „Schliessen“ ist der Gefahr-Knopf.
 */
export function CloseDialog({ question, onAnswer }: CloseDialogProps) {
  const { tabIds, busy } = question;
  const single = tabIds.length === 1 && busy.length === 1 ? busy[0] : null;

  const actions = (
    <>
      <button type="button" className="btn" data-autofocus onClick={() => onAnswer(false)}>
        Abbrechen
      </button>
      <button type="button" className="btn danger" onClick={() => onAnswer(true)}>
        {single ? 'Schliessen' : `${tabIds.length} Tabs schliessen`}
      </button>
    </>
  );

  if (single) {
    return (
      <Dialog title={`„${single.name}“ schliessen?`} actions={actions} onClose={() => onAnswer(false)}>
        <p>{REASON_TEXT[single.reason]}</p>
        <p className="hint">
          Mit {SHORTCUT} öffnest du den Tab wieder{single.resumes ? ', die Claude-Session wird dann fortgesetzt' : ''}.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog title={`${tabIds.length} Tabs schliessen?`} actions={actions} onClose={() => onAnswer(false)}>
      <p>In {busy.length === 1 ? 'diesem Tab' : 'diesen Tabs'} läuft noch etwas:</p>
      <ul>
        {busy.map((tab) => (
          <li key={tab.id}>
            <b>{tab.name}</b>: {STATUS_TEXT[tab.reason]}
          </li>
        ))}
      </ul>
      <p className="hint">Geschlossene Tabs öffnest du mit {SHORTCUT} wieder.</p>
    </Dialog>
  );
}
