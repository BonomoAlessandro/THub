@ECHO off
REM Nachgemachtes claude.cmd, aufgebaut wie der Shim, den npm fuer globale Pakete erzeugt
REM (cmd-shim). Statt node.exe mit cli.js startet es claude-impl.exe (das nachgemachte claude).
REM Wie bei npm beendet "goto #_undefined_#" den Batch-Kontext, bevor das Programm laeuft.
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
SET "_prog=%dp0%\claude-impl.exe"
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" %*
