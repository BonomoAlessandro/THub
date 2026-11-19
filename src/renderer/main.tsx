// Einstieg der React-Oberfläche. CSS-Imports bündelt esbuild nach dist/renderer/renderer.css.
import '@xterm/xterm/css/xterm.css';
import './styles/tokens.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applySystemTheme } from './theme';

// Vor dem ersten Zeichnen, damit Oberfläche und Terminals gleich im richtigen Design erscheinen.
applySystemTheme();

// Bewusst ohne StrictMode: Er würde jede Terminal-Ansicht in der Entwicklung zweimal erzeugen und
// zweimal „bereit“ melden lassen; Ausgabe dazwischen ginge an die verworfene Ansicht.
createRoot(document.getElementById('root')!).render(<App />);
