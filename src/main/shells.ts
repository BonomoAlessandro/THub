import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShellInfo } from './workspace/ports';

/** Feste Shell-Liste, bis die Shell-Erkennung (Ticket 06) sie ersetzt. */
export const FIXED_SHELLS: ShellInfo[] = [
  { id: 'pwsh', name: 'PowerShell 7', file: 'pwsh.exe', args: [], capturesClaude: true, integration: 'powershell' },
  {
    id: 'powershell',
    name: 'Windows PowerShell',
    file: 'powershell.exe',
    args: [],
    capturesClaude: true,
    integration: 'powershell',
  },
  { id: 'cmd', name: 'cmd', file: 'cmd.exe', args: [], capturesClaude: true, integration: 'cmd' },
];

/**
 * Vorläufig, bis Ticket 06 die Shells erkennt: die feste Liste, dazu Git Bash, falls es am
 * Standard-Installationsort liegt. Nur über den vollen Pfad: `bash.exe` im PATH ist oft die von WSL.
 */
export function provisionalShells(env: NodeJS.ProcessEnv = process.env): ShellInfo[] {
  const gitBash = path.join(env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
  if (!fs.existsSync(gitBash)) return FIXED_SHELLS;
  return [
    ...FIXED_SHELLS,
    // Ohne Integration (Rückfall) startet Git Bash wie üblich als Login-Shell.
    { id: 'gitbash', name: 'Git Bash', file: gitBash, args: ['--login', '-i'], capturesClaude: true, integration: 'bash' },
  ];
}
