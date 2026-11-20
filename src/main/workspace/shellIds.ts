// Kennungen und Anzeigenamen der Shells. Die Shell-Erkennung (src/main/shells.ts) vergibt sie; der Kern
// braucht die Namen auch für eine Shell, die auf diesem Rechner (nicht mehr) erkannt wird.
//
// Stabile Kennungen: "pwsh", "powershell", "cmd", "gitbash" und "wsl:<Distribution>". Sie stehen im
// gespeicherten Zustand und dürfen sich nicht ändern.

const WSL_PREFIX = 'wsl:';

const NAMES: Record<string, string> = {
  pwsh: 'PowerShell 7',
  powershell: 'Windows PowerShell',
  cmd: 'Eingabeaufforderung',
  gitbash: 'Git Bash',
};

/** Kennung einer WSL-Distribution, z.B. "wsl:Ubuntu". */
export function wslShellId(distribution: string): string {
  return WSL_PREFIX + distribution;
}

/** Die Distribution einer WSL-Kennung; `null` für alle anderen Shells. */
export function wslDistribution(shellId: string): string | null {
  return shellId.startsWith(WSL_PREFIX) && shellId.length > WSL_PREFIX.length
    ? shellId.slice(WSL_PREFIX.length)
    : null;
}

/** Anzeigename zu einer Kennung, z.B. "PowerShell 7" oder "Ubuntu (WSL)"; Unbekanntes bleibt, wie es ist. */
export function shellLabel(shellId: string): string {
  const distribution = wslDistribution(shellId);
  if (distribution) return `${distribution} (WSL)`;
  return NAMES[shellId] ?? shellId;
}
