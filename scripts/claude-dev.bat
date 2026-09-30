@echo off
rem Double-click launcher: prepares the ka-hgis dev environment, then starts Claude Code in the repo root.
rem (ASCII only on purpose: Korean text in .bat files breaks on some console code pages. Messages are printed by claude-dev.ps1.)
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%claude-dev.ps1" %*
if errorlevel 1 pause
endlocal
