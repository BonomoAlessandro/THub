# TermHub-Integration fuer PowerShell 7 und Windows PowerShell 5.1 (reines ASCII).
#
# TermHub startet die Shell mit
#   pwsh.exe|powershell.exe -NoLogo -NoProfile -NoExit -EncodedCommand <dieser Text, UTF-16LE, Base64>
# -EncodedCommand ist keine Skriptdatei, darum blockiert eine Execution Policy diesen Code nicht.
# Der Code laeuft im globalen Bereich: zuerst die Profile des Nutzers wie ohne -NoProfile, dann der
# claude-Ersatz, zuletzt einmal der Startbefehl. Schlaegt etwas fehl, bleibt die Shell normal benutzbar.
#
# Umgebung: TERMHUB_STARTER (voller Pfad zu starter.ps1), optional TERMHUB_START_CMD (Startbefehl,
# PowerShell-Code, wird vor dem Ausfuehren entfernt). Nur fuer Tests: TERMHUB_TEST_PROFILE ersetzt
# die Profile des Nutzers durch eine einzelne Datei.

# 1. Profile des Nutzers, in derselben Reihenfolge wie PowerShell selbst
if ($env:TERMHUB_TEST_PROFILE) {
    $__TermHubProfiles = @($env:TERMHUB_TEST_PROFILE)
} else {
    $__TermHubProfiles = @($PROFILE.AllUsersAllHosts, $PROFILE.AllUsersCurrentHost, $PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost)
}
foreach ($__TermHubProfile in $__TermHubProfiles) {
    if ($__TermHubProfile -and (Test-Path -LiteralPath $__TermHubProfile)) {
        try {
            . $__TermHubProfile
        } catch {
            Write-Error -ErrorRecord $_
        }
    }
}
Remove-Variable -Name __TermHubProfiles, __TermHubProfile -ErrorAction SilentlyContinue

# 2. claude-Ersatz: ruft den Starter mit genau den Argumenten auf, die ein direkt aufgerufenes
# claude.exe bekaeme. PowerShell baut die Befehlszeile fuer powershell.exe nach denselben Regeln
# wie fuer claude.exe (beides .exe), der Starter liest sie roh.
try {
    if ($env:TERMHUB_STARTER -and $ExecutionContext.SessionState.LanguageMode -eq 'FullLanguage') {
        function global:claude {
            & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File $env:TERMHUB_STARTER @args
        }
    }
} catch {
}

# 3. Startbefehl genau einmal
if ($env:TERMHUB_START_CMD) {
    $__TermHubStart = $env:TERMHUB_START_CMD
    Remove-Item -LiteralPath Env:TERMHUB_START_CMD -ErrorAction SilentlyContinue
    try {
        Invoke-Expression $__TermHubStart
    } finally {
        Remove-Variable -Name __TermHubStart -ErrorAction SilentlyContinue
    }
}
