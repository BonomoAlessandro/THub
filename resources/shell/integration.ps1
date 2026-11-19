# THub-Integration fuer PowerShell 7 und Windows PowerShell 5.1 (reines ASCII).
#
# THub startet die Shell mit
#   pwsh.exe|powershell.exe -NoLogo -NoProfile -NoExit -EncodedCommand <dieser Text, UTF-16LE, Base64>
# -EncodedCommand ist keine Skriptdatei, darum blockiert eine Execution Policy diesen Code nicht.
# Der Code laeuft im globalen Bereich: zuerst die Profile des Nutzers wie ohne -NoProfile, dann der
# claude-Ersatz, zuletzt einmal der Startbefehl. Schlaegt etwas fehl, bleibt die Shell normal benutzbar.
#
# Umgebung: THUB_STARTER (voller Pfad zu starter.ps1), optional THUB_START_CMD (Startbefehl,
# PowerShell-Code, wird vor dem Ausfuehren entfernt). Nur fuer Tests: THUB_TEST_PROFILE ersetzt
# die Profile des Nutzers durch eine einzelne Datei.

# 1. Profile des Nutzers, in derselben Reihenfolge wie PowerShell selbst
if ($env:THUB_TEST_PROFILE) {
    $__THubProfiles = @($env:THUB_TEST_PROFILE)
} else {
    $__THubProfiles = @($PROFILE.AllUsersAllHosts, $PROFILE.AllUsersCurrentHost, $PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost)
}
foreach ($__THubProfile in $__THubProfiles) {
    if ($__THubProfile -and (Test-Path -LiteralPath $__THubProfile)) {
        try {
            . $__THubProfile
        } catch {
            Write-Error -ErrorRecord $_
        }
    }
}
Remove-Variable -Name __THubProfiles, __THubProfile -ErrorAction SilentlyContinue

# 2. claude-Ersatz: ruft den Starter mit genau den Argumenten auf, die ein direkt aufgerufenes
# claude.exe bekaeme. PowerShell baut die Befehlszeile fuer powershell.exe nach denselben Regeln
# wie fuer claude.exe (beides .exe), der Starter liest sie roh.
try {
    if ($env:THUB_STARTER -and $ExecutionContext.SessionState.LanguageMode -eq 'FullLanguage') {
        function global:claude {
            & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File $env:THUB_STARTER @args
        }
    }
} catch {
}

# 3. Startbefehl genau einmal
if ($env:THUB_START_CMD) {
    $__THubStart = $env:THUB_START_CMD
    Remove-Item -LiteralPath Env:THUB_START_CMD -ErrorAction SilentlyContinue
    try {
        Invoke-Expression $__THubStart
    } finally {
        Remove-Variable -Name __THubStart -ErrorAction SilentlyContinue
    }
}
