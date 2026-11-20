@rem THub-Integration fuer cmd (reines ASCII).
@rem
@rem THub startet cmd ohne /d, damit AutoRun (das "Profil" von cmd) wie gewohnt laeuft:
@rem   cmd.exe /s /k ""<Pfad>\integration.cmd""                     ohne Startbefehl
@rem   cmd.exe /s /k ""<Pfad>\integration.cmd" & <Startbefehl>"     mit Startbefehl
@rem Der Startbefehl steht in der /k-Zeile und nicht in dieser Datei: so laeuft er nicht in einem
@rem Batch-Kontext, und Ctrl+C fuehrt nicht zur Rueckfrage "Batchvorgang abbrechen (J/N)?".
@rem
@rem Kein "echo off": die Datei laeuft im interaktiven cmd, das wuerde den Prompt ausblenden.
@rem Kein setlocal: die Aenderungen an PROMPT sollen bleiben.
@rem
@rem Ordner melden: Der Prompt des Nutzers bleibt und bekommt vorne eine Meldung des aktuellen
@rem Ordners per OSC 9;9 (Ende ESC \, cmd kennt kein BEL im Prompt). Eine schon vorhandene Meldung
@rem (geerbtes PROMPT) wird vorher entfernt, damit sie nicht doppelt erscheint.
@if not defined PROMPT set "PROMPT=$P$G"
@set "PROMPT=%PROMPT:$E]9;9;$P$E\=%"
@set "PROMPT=$E]9;9;$P$E\%PROMPT%"
@rem
@rem claude-Ersatz: doskey-Makro, ruft powershell.exe direkt auf, ohne Batch-Datei. $* ist der rohe
@rem Rest der getippten Zeile; cmd verarbeitet die eingesetzte Zeile genau wie einen direkten Aufruf.
@if defined THUB_STARTER doskey claude="%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%THUB_STARTER%" $*
