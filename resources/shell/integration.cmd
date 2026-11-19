@rem THub-Integration fuer cmd (reines ASCII).
@rem
@rem THub startet cmd ohne /d, damit AutoRun (das "Profil" von cmd) wie gewohnt laeuft:
@rem   cmd.exe /s /k ""<Pfad>\integration.cmd""                     ohne Startbefehl
@rem   cmd.exe /s /k ""<Pfad>\integration.cmd" & <Startbefehl>"     mit Startbefehl
@rem Der Startbefehl steht in der /k-Zeile und nicht in dieser Datei: so laeuft er nicht in einem
@rem Batch-Kontext, und Ctrl+C fuehrt nicht zur Rueckfrage "Batchvorgang abbrechen (J/N)?".
@rem
@rem Kein "echo off": die Datei laeuft im interaktiven cmd, das wuerde den Prompt ausblenden.
@rem
@rem claude-Ersatz: doskey-Makro, ruft powershell.exe direkt auf, ohne Batch-Datei. $* ist der rohe
@rem Rest der getippten Zeile; cmd verarbeitet die eingesetzte Zeile genau wie einen direkten Aufruf.
@if defined THUB_STARTER doskey claude="%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%THUB_STARTER%" $*
