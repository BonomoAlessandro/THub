import type { ShellInfo } from './workspace/ports';

/** Feste Shell-Liste, bis die Shell-Erkennung (Ticket 06) sie ersetzt. */
export const FIXED_SHELLS: ShellInfo[] = [
  { id: 'pwsh', name: 'PowerShell 7', file: 'pwsh.exe', args: [], capturesClaude: true },
  { id: 'powershell', name: 'Windows PowerShell', file: 'powershell.exe', args: [], capturesClaude: true },
  { id: 'cmd', name: 'cmd', file: 'cmd.exe', args: [], capturesClaude: true },
];
