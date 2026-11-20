# THub-Starter fuer `claude` (Windows PowerShell 5.1, reines ASCII).
#
# Aufruf nur ueber die Ersatz-Varianten (PowerShell-Funktion, Bash-Funktion, doskey-Makro)
# und den Startbefehl:
#
#   powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File <starter.ps1> <Argumente wie fuer claude>
#
# Die Argumente werden NICHT ueber $args gelesen. Die Shell hat die Befehlszeile dieses Prozesses
# genau so gebaut, wie sie sie fuer ein direkt aufgerufenes claude.exe gebaut haette. Der Starter
# liest sie roh aus [Environment]::CommandLine und nimmt alles hinter dem Skriptpfad ("Rest").
#
# Schritte (siehe docs/specs/termhub-v2.md, "Shell-Integration", Punkt 2):
#   1. echtes claude im PATH finden (ohne den Ordner des Starters; claude.exe vor claude.cmd; nie .ps1)
#   2. Aufruf einordnen: durchreichen oder Fall new / withId / withoutId
#   3. POST /claude/launch (ohne Proxy, ca. 1 s Zeitlimit); ohne Antwort claude unveraendert starten
#   4. --settings, --session-id, -n ergaenzen
#   5. Befehlszeile selbst bauen und mit geerbter Konsole starten; POST /claude/started
#   6. warten, POST /claude/exit, Exit-Code weitergeben
#
# Umgebung: THUB_TAB_ID, THUB_API (z.B. http://127.0.0.1:1234), THUB_TOKEN.

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

# --- Optionen von claude (Stand Claude Code 2.1.328, `claude --help`) -------------------------

# Optionen mit Pflichtwert <x>
$script:ValueOptions = @(
    '--agent', '--agents', '--append-system-prompt', '--append-system-prompt-file', '--autocompact',
    '--debug-file', '--effort', '--environment', '--fallback-model', '--input-format', '--json-schema',
    '--max-budget-usd', '--model', '--name', '--output-format', '--permission-mode',
    '--permission-prompts', '--plugin-dir', '--plugin-url', '--remote-control-session-name-prefix',
    '--session-id', '--setting-sources', '--settings', '--system-prompt', '--system-prompt-file',
    '--system-prompt-snapshot'
)
# Optionen mit beliebig vielen Werten <x...>: verbrauchen alles bis zum naechsten "-..."
$script:VariadicOptions = @(
    '--add-dir', '--allowedTools', '--allowed-tools', '--betas', '--disallowedTools',
    '--disallowed-tools', '--file', '--mcp-config', '--tools'
)
# Optionen mit optionalem Wert [x]: verbrauchen das naechste Argument, wenn es nicht mit "-" beginnt
$script:OptionalValueOptions = @(
    '--cloud', '--debug', '--from-pr', '--prompt-suggestions', '--remote-control', '--resume',
    '--teleport', '--worktree'
)
# Kurzformen: Buchstabe -> Langform
$script:ShortOptions = New-Object System.Collections.Hashtable ([StringComparer]::Ordinal)
$script:ShortOptions['c'] = '--continue'
$script:ShortOptions['d'] = '--debug'
$script:ShortOptions['h'] = '--help'
$script:ShortOptions['n'] = '--name'
$script:ShortOptions['p'] = '--print'
$script:ShortOptions['r'] = '--resume'
$script:ShortOptions['v'] = '--version'
$script:ShortOptions['w'] = '--worktree'
$script:Subcommands = @(
    'agents', 'attach', 'auth', 'auto-mode', 'doctor', 'gateway', 'import', 'install', 'logs', 'mcp',
    'plugin', 'plugins', 'purge', 'respawn', 'rm', 'setup-token', 'stop', 'kill', 'ultrareview',
    'update', 'upgrade'
)
# Optionen, mit denen die Session nicht in diesem Terminal laeuft: durchreichen wie -p
$script:PassThroughOptions = @('--print', '--version', '--help', '--bg', '--background', '--desktop', '--cloud')

# --- Befehlszeile zerlegen ---------------------------------------------------------------------

# Zerlegt eine Befehlszeile nach den Regeln der C-Laufzeit ab 2008 (UCRT; so zerlegen auch Node
# und Bun). Liefert pro Argument Value und End (Index hinter dem Argument). CommandLineToArgvW
# weicht nur bei "" innerhalb von Anfuehrungszeichen ab.
# $FirstIsProgram: das erste Argument nach den Sonderregeln fuer argv[0] lesen.
function Split-CommandLine([string]$Line, [bool]$FirstIsProgram) {
    $result = New-Object System.Collections.ArrayList
    $i = 0
    $n = $Line.Length
    if ($FirstIsProgram) {
        while ($i -lt $n -and ($Line[$i] -eq ' ' -or $Line[$i] -eq "`t")) { $i++ }
        $sb = New-Object System.Text.StringBuilder
        if ($i -lt $n -and $Line[$i] -eq '"') {
            $i++
            while ($i -lt $n -and $Line[$i] -ne '"') { [void]$sb.Append($Line[$i]); $i++ }
            if ($i -lt $n) { $i++ }
        } else {
            while ($i -lt $n -and $Line[$i] -ne ' ' -and $Line[$i] -ne "`t") { [void]$sb.Append($Line[$i]); $i++ }
        }
        [void]$result.Add(@{ Value = $sb.ToString(); End = $i })
    }
    $inQuote = $false
    while ($true) {
        while ($i -lt $n -and ($Line[$i] -eq ' ' -or $Line[$i] -eq "`t")) { $i++ }
        if ($i -ge $n) { break }
        $sb = New-Object System.Text.StringBuilder
        while ($true) {
            $copy = $true
            $slashes = 0
            while ($i -lt $n -and $Line[$i] -eq '\') { $slashes++; $i++ }
            if ($i -lt $n -and $Line[$i] -eq '"') {
                if ($slashes % 2 -eq 0) {
                    if ($inQuote -and ($i + 1) -lt $n -and $Line[$i + 1] -eq '"') {
                        $i++
                    } else {
                        $copy = $false
                        $inQuote = -not $inQuote
                    }
                }
                $slashes = [Math]::Floor($slashes / 2)
            }
            if ($slashes -gt 0) { [void]$sb.Append('\', $slashes) }
            if ($i -ge $n -or (-not $inQuote -and ($Line[$i] -eq ' ' -or $Line[$i] -eq "`t"))) { break }
            if ($copy) { [void]$sb.Append($Line[$i]) }
            $i++
        }
        [void]$result.Add(@{ Value = $sb.ToString(); End = $i })
    }
    return , $result
}

# Rest der eigenen Befehlszeile hinter "-File <starter.ps1>", unveraendert.
function Get-RawTail {
    $line = [Environment]::CommandLine
    $tokens = Split-CommandLine $line $true
    for ($k = 1; $k -lt $tokens.Count - 1; $k++) {
        if ($tokens[$k].Value -ieq '-File') {
            $end = $tokens[$k + 1].End
            $tail = $line.Substring($end)
            return $tail.TrimStart(' ', "`t")
        }
    }
    return ''
}

# --- Quoting -------------------------------------------------------------------------------------

# Ein Argument nach den Regeln von CommandLineToArgvW bzw. der C-Laufzeit quoten. Erzeugt nie ""
# innerhalb von Anfuehrungszeichen, darum ergeben beide Regelwerke dasselbe.
function ConvertTo-ArgvQuoted([string]$Arg, [bool]$Always) {
    if (-not $Always -and $Arg.Length -gt 0 -and $Arg -notmatch '[\s"]') { return $Arg }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    $slashes = 0
    foreach ($ch in $Arg.ToCharArray()) {
        if ($ch -eq '\') { $slashes++; continue }
        if ($ch -eq '"') {
            [void]$sb.Append('\', $slashes * 2 + 1)
            [void]$sb.Append('"')
        } else {
            if ($slashes -gt 0) { [void]$sb.Append('\', $slashes) }
            [void]$sb.Append($ch)
        }
        $slashes = 0
    }
    if ($slashes -gt 0) { [void]$sb.Append('\', $slashes * 2) }
    [void]$sb.Append('"')
    return $sb.ToString()
}

# Eine nach C-Laufzeit-Regeln gequotete Zeile fuer `cmd.exe /d /v:off /s /c` und die Batch-Datei
# (npm-Shim mit %*) absichern. cmd wertet die Zeile zweimal aus: einmal fuer /c und noch einmal in
# der Batch-Datei, wenn %* eingesetzt wird. Sonderzeichen ausserhalb von cmd-Anfuehrungszeichen
# bekommen darum drei Caret (^^^& -> ^& -> &). Prozentzeichen werden in beiden Durchgaengen nicht
# ersetzt, wenn sie als %%cd:~,% geschrieben werden (%cd:~,% ergibt einen leeren Text).
function ConvertTo-CmdSafe([string]$Line) {
    $sb = New-Object System.Text.StringBuilder
    $inQuote = $false
    foreach ($ch in $Line.ToCharArray()) {
        if ($ch -eq '"') {
            $inQuote = -not $inQuote
            [void]$sb.Append($ch)
        } elseif ($ch -eq '%') {
            [void]$sb.Append('%%cd:~,%')
        } elseif (-not $inQuote -and '&|<>^()'.IndexOf($ch) -ge 0) {
            [void]$sb.Append('^^^').Append($ch)
        } else {
            [void]$sb.Append($ch)
        }
    }
    return $sb.ToString()
}

# --- Schritt 1: echtes claude finden -------------------------------------------------------------

function Find-Claude {
    $own = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
    foreach ($entry in ($env:PATH -split ';')) {
        $dir = $entry.Trim().Trim('"')
        if ($dir -eq '') { continue }
        try { $full = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($dir)).TrimEnd('\') } catch { continue }
        if ($full -ieq $own) { continue }
        foreach ($name in @('claude.exe', 'claude.cmd')) {
            $candidate = Join-Path $full $name
            if ([IO.File]::Exists($candidate)) { return $candidate }
        }
    }
    return $null
}

# --- Schritt 2: einordnen ------------------------------------------------------------------------

# Faelle (docs/specs/termhub-v2.md, "Shell-Integration", Punkt 2):
#   withId     --session-id <x> (bestimmt die Kennung, auch mit --fork-session), sonst --resume <x> / -r <x>
#   withoutId  --resume <x> mit --fork-session (die neue Session bekommt eine eigene Kennung), --continue / -c,
#              --resume ohne Wert, --from-pr, --teleport
#   new        sonst; --remote-control aendert den Fall nicht
function Get-Classification([string[]]$Argv) {
    $c = @{
        PassThrough = $false; Case = 'new'; GivenId = $null
        HasSettings = $false; HasName = $false; Continue = $false; ResumePick = $false
        ResumeId = $null; SessionId = $null; Fork = $false
    }
    $first = $null
    $i = 0
    while ($i -lt $Argv.Count) {
        $a = $Argv[$i]
        $next = $null
        if ($i + 1 -lt $Argv.Count) { $next = $Argv[$i + 1] }
        $nextIsValue = ($next -ne $null) -and -not $next.StartsWith('-')

        if ($a -eq '--') { break }

        $opt = $null; $inline = $null
        if ($a.StartsWith('--')) {
            $eq = $a.IndexOf('=')
            if ($eq -gt 0) { $opt = $a.Substring(0, $eq); $inline = $a.Substring($eq + 1) } else { $opt = $a }
        } elseif ($a.StartsWith('-') -and $a.Length -gt 1) {
            # Kurzform, auch gebuendelt (-pc) oder mit angehaengtem Wert (-rabc, -nName)
            $j = 1
            while ($j -lt $a.Length) {
                $long = $script:ShortOptions[[string]$a[$j]]
                if ($long -eq $null) { break }
                if ($long -eq '--print' -or $long -eq '--version' -or $long -eq '--help') { $c.PassThrough = $true; $j++; continue }
                if ($long -eq '--continue') { $c.Continue = $true; $j++; continue }
                # Optionen mit Wert: der Rest des Arguments ist der Wert
                $opt = $long
                if ($j + 1 -lt $a.Length) { $inline = $a.Substring($j + 1) }
                break
            }
            if ($opt -eq $null) { $i++; continue }
        } else {
            if ($first -eq $null) { $first = $a }
            $i++
            continue
        }

        if ($script:PassThroughOptions -ccontains $opt) { $c.PassThrough = $true }
        switch -CaseSensitive ($opt) {
            '--continue' { $c.Continue = $true }
            '--settings' { $c.HasSettings = $true }
            '--name' { $c.HasName = $true }
            '--resume' {
                if ($inline -ne $null -and $inline -ne '') { $c.ResumeId = $inline }
                elseif ($inline -eq $null -and $nextIsValue) { $c.ResumeId = $next }
                else { $c.ResumePick = $true }
            }
            '--session-id' {
                if ($inline -ne $null) { $c.SessionId = $inline } elseif ($next -ne $null) { $c.SessionId = $next }
            }
            '--fork-session' { $c.Fork = $true }
            # setzen eine bestehende Session fort, deren Kennung der Starter nicht kennt
            '--from-pr' { $c.ResumePick = $true }
            '--teleport' { $c.ResumePick = $true }
        }

        if ($inline -eq $null) {
            if ($script:ValueOptions -ccontains $opt) {
                $i++
            } elseif ($script:VariadicOptions -ccontains $opt) {
                while ($i + 1 -lt $Argv.Count -and -not $Argv[$i + 1].StartsWith('-')) { $i++ }
            } elseif ($script:OptionalValueOptions -ccontains $opt) {
                if ($nextIsValue) { $i++ }
            }
        }
        $i++
    }
    if ($first -ne $null -and $script:Subcommands -ccontains $first) { $c.PassThrough = $true }

    if ($c.SessionId -ne $null) { $c.Case = 'withId'; $c.GivenId = $c.SessionId }
    elseif ($c.ResumeId -ne $null -and -not $c.Fork) { $c.Case = 'withId'; $c.GivenId = $c.ResumeId }
    elseif ($c.ResumeId -ne $null -or $c.Continue -or $c.ResumePick) { $c.Case = 'withoutId' }
    else { $c.Case = 'new' }
    return $c
}

# --- Schritt 3 und 6: THub anfragen --------------------------------------------------------------

[System.Net.ServicePointManager]::Expect100Continue = $false

function Invoke-THub([string]$Path, [hashtable]$Body) {
    $req = [System.Net.HttpWebRequest]::Create($env:THUB_API.TrimEnd('/') + $Path)
    $req.Method = 'POST'
    $req.Proxy = $null
    $req.Timeout = 1000
    $req.ReadWriteTimeout = 1000
    $req.KeepAlive = $false
    $req.ContentType = 'application/json; charset=utf-8'
    $req.Headers.Add('X-THub-Token', [string]$env:THUB_TOKEN)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Body -Compress))
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
        $text = $reader.ReadToEnd()
    } finally {
        $resp.Close()
    }
    if ($text) { return (ConvertFrom-Json $text) }
    return $null
}

# Meldung ohne PowerShell-Befehle (nur .NET-Aufrufe), damit sie auch im finally nach Ctrl+C laeuft.
function Send-Report([string]$Path, [string]$Json) {
    try {
        $req = [System.Net.HttpWebRequest]::Create($env:THUB_API.TrimEnd('/') + $Path)
        $req.Method = 'POST'
        $req.Proxy = $null
        $req.Timeout = 1000
        $req.ReadWriteTimeout = 1000
        $req.KeepAlive = $false
        $req.ContentType = 'application/json; charset=utf-8'
        $req.Headers.Add('X-THub-Token', [string]$env:THUB_TOKEN)
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
        $req.ContentLength = $bytes.Length
        $stream = $req.GetRequestStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
        $req.GetResponse().Close()
    } catch {
    }
}

function ConvertTo-JsonString([string]$s) {
    if ($s -eq $null) { return 'null' }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($ch in $s.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '"') { [void]$sb.Append('\"') }
        elseif ($ch -eq '\') { [void]$sb.Append('\\') }
        elseif ($code -lt 0x20) { [void]$sb.Append('\u').Append($code.ToString('x4')) }
        else { [void]$sb.Append($ch) }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

# --- Ablauf --------------------------------------------------------------------------------------

$claude = Find-Claude
if ($claude -eq $null) {
    [Console]::Error.WriteLine('claude wurde nicht gefunden')
    exit 1
}
$isCmd = $claude.EndsWith('.cmd', [StringComparison]::OrdinalIgnoreCase)

$tail = Get-RawTail
$argv = @()
foreach ($t in (Split-CommandLine $tail $false)) { $argv += , [string]$t.Value }

$class = Get-Classification $argv

# Nur Einordnung ausgeben, nichts anfragen und nichts starten (Fehlersuche, Tests)
if ($env:THUB_STARTER_DRYRUN) {
    $class['Claude'] = $claude
    $class['Argv'] = $argv
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $class -Compress))
    exit 0
}

$added = @()
$report = $false
$sessionId = $null

if (-not $class.PassThrough -and $env:THUB_API -and $env:THUB_TAB_ID) {
    try {
        $launch = Invoke-THub '/claude/launch' @{
            tabId = $env:THUB_TAB_ID
            case = $class.Case
            sessionId = $class.GivenId
            cwd = [Environment]::CurrentDirectory
        }
        $report = $true
        if ($launch -ne $null) {
            if (-not $class.HasSettings -and $launch.hookFile) { $added += '--settings', [string]$launch.hookFile }
            if ($class.Case -eq 'new' -and $launch.sessionId) {
                $added += '--session-id', [string]$launch.sessionId
                $sessionId = [string]$launch.sessionId
            }
            if ($class.Case -eq 'new' -and -not $class.HasName -and $launch.tabName) { $added += '-n', [string]$launch.tabName }
        }
        if ($class.Case -eq 'withId') { $sessionId = $class.GivenId }
    } catch {
        # THub nicht erreichbar: claude unveraendert starten, nichts melden
        $added = @()
        $report = $false
    }
}

# --- Schritt 5: Befehlszeile bauen und starten ---------------------------------------------------

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.UseShellExecute = $false
if ($isCmd) {
    # Batch-Datei: neu quoten, jedes Argument in Anfuehrungszeichen, dann fuer cmd absichern.
    $all = @($added) + @($argv)
    foreach ($a in $all) {
        if ($a.IndexOf("`n") -ge 0 -or $a.IndexOf("`r") -ge 0) {
            [Console]::Error.WriteLine('THub: Zeilenumbrueche in Argumenten kann claude.cmd nicht empfangen')
            exit 1
        }
    }
    $quoted = ($all | ForEach-Object { ConvertTo-ArgvQuoted $_ $true }) -join ' '
    $inner = '"' + $claude + '"'
    if ($quoted) { $inner += ' ' + $quoted }
    $psi.FileName = Join-Path $env:SystemRoot 'System32\cmd.exe'
    $psi.Arguments = '/d /v:off /s /c "' + (ConvertTo-CmdSafe $inner) + '"'
} else {
    # claude.exe: ergaenzte Optionen vorne, danach der Rest der Befehlszeile unveraendert. claude
    # zerlegt so genau dieselben Zeichen wie bei einem direkten Aufruf.
    $parts = @($added | ForEach-Object { ConvertTo-ArgvQuoted $_ $false })
    if ($tail) { $parts += $tail }
    $psi.FileName = $claude
    $psi.Arguments = $parts -join ' '
}

if ($env:THUB_STARTER_DEBUG) {
    [Console]::Error.WriteLine('THub-Starter: ' + $psi.FileName + ' ' + $psi.Arguments)
}

$sid = 'null'
if ($sessionId -ne $null) { $sid = ConvertTo-JsonString $sessionId }
$tabJson = ConvertTo-JsonString $env:THUB_TAB_ID
$exitJsonHead = '{"tabId":' + $tabJson + ',"sessionId":' + $sid + ',"exitCode":'

# Ctrl+C geht an alle Prozesse der Konsole, auch an diesen. PowerShell merkt sich dann, dass die
# Pipeline abgebrochen werden soll, und bricht beim naechsten Aufruf eines Befehls (Funktion,
# Cmdlet) ab, ausser im finally. WaitForExit() selbst wird nicht unterbrochen: der Starter wartet,
# bis claude selbst entschieden hat zu enden. Darum geschieht alles nach dem Start im finally.
# `exit` statt [Environment]::Exit(), das in Windows PowerShell 5.1 rund 2 s kostet.
$proc = $null
try {
    $proc = [System.Diagnostics.Process]::Start($psi)
    if ($report) { Send-Report '/claude/started' ('{"tabId":' + $tabJson + ',"pid":' + $proc.Id + '}') }
    $proc.WaitForExit()
} finally {
    if ($proc -ne $null) {
        $proc.WaitForExit()
        if ($env:THUB_STARTER_DEBUG) { [Console]::Error.WriteLine('THub-Starter: claude beendet, Exit-Code ' + $proc.ExitCode) }
        if ($report) { Send-Report '/claude/exit' ($exitJsonHead + $proc.ExitCode + '}') }
        exit $proc.ExitCode
    }
}
exit 1
