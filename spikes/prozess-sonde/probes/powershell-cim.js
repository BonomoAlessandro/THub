// Wegwerf-Spike: ein langlebiger PowerShell-Kindprozess, der auf Anfrage
// `Get-CimInstance Win32_Process` abfragt und eine Zeile Text zurückschreibt.
// Pro Abfrage wird kein neuer Prozess gestartet; die Arbeit verteilt sich aber auf
// powershell.exe und den WMI-Dienst (WmiPrvSE.exe).
//
// Formate: 'csv' (StringBuilder, "pid,ppid,name|...") oder 'json' (ConvertTo-Json -Compress).
'use strict';
const { spawn } = require('child_process');

function script(format) {
  const emit =
    format === 'json'
      ? `$line = ConvertTo-Json -Compress -InputObject @($procs | Select-Object ProcessId, ParentProcessId, Name)`
      : `[void]$sb.Clear()
    foreach ($p in $procs) { [void]$sb.Append($p.ProcessId).Append(',').Append($p.ParentProcessId).Append(',').Append($p.Name).Append('|') }
    $line = $sb.ToString()`;
  return `
$ErrorActionPreference = 'Stop'
$out = [Console]::OpenStandardOutput()
$enc = [Text.UTF8Encoding]::new($false)
$sb = [Text.StringBuilder]::new(65536)
while ($true) {
  $req = [Console]::In.ReadLine()
  if ($null -eq $req) { break }
  $procs = Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, Name
  ${emit}
  $bytes = $enc.GetBytes($line + [char]10)
  $out.Write($bytes, 0, $bytes.Length)
  $out.Flush()
}`;
}

function parse(format, line) {
  if (format === 'json') {
    return JSON.parse(line).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name }));
  }
  const out = [];
  for (const rec of line.split('|')) {
    if (!rec) continue;
    const a = rec.indexOf(',');
    const b = rec.indexOf(',', a + 1);
    out.push({ pid: +rec.slice(0, a), ppid: +rec.slice(a + 1, b), name: rec.slice(b + 1) });
  }
  return out;
}

function create({ exe = 'powershell.exe', format = 'csv' } = {}) {
  const encoded = Buffer.from(script(format), 'utf16le').toString('base64');
  const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let pending = null;
  let acc = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    acc += chunk;
    let nl;
    while ((nl = acc.indexOf('\n')) >= 0) {
      const line = acc.slice(0, nl).replace(/\r$/, '');
      acc = acc.slice(nl + 1);
      const p = pending;
      pending = null;
      if (p) {
        try {
          p.resolve(parse(format, line));
        } catch (e) {
          p.reject(e);
        }
      }
    }
  });
  child.stderr.on('data', (d) => (stderr += d));
  child.on('exit', (code) => {
    if (pending) pending.reject(new Error(`PowerShell beendet (${code}): ${stderr}`));
    pending = null;
  });

  return {
    name: `${exe} + Get-CimInstance (${format})`,
    kind: 'child',
    childPid: child.pid,
    snapshot() {
      if (pending) return Promise.reject(new Error('Abfrage läuft schon'));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        child.stdin.write('x\n');
      });
    },
    dispose() {
      return new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        const t = setTimeout(() => {
          child.kill();
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
        child.stdin.end();
      });
    },
  };
}

module.exports = { create };
