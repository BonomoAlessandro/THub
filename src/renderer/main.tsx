// Einstieg der React-Oberfläche. CSS-Imports bündelt esbuild nach dist/renderer/renderer.css.
import '@xterm/xterm/css/xterm.css';
import './styles/tokens.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { followTheme } from './theme';

// Erst das Design übernehmen, dann zeichnen, damit Oberfläche und Terminals gleich im richtigen
// Design erscheinen. Bis dahin zeigt das Fenster schon seine deckende Hintergrundfarbe.
void followTheme().then(() => {
  // Bewusst ohne StrictMode: Er würde jede Terminal-Ansicht in der Entwicklung zweimal erzeugen und
  // zweimal „bereit“ melden lassen; Ausgabe dazwischen ginge an die verworfene Ansicht.
  createRoot(document.getElementById('root')!).render(<App />);
});
