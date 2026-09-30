@echo off
rem One-time setup for a new PC: Claude Code global settings, Archify (pinned), Graft, desktop shortcut.
rem (ASCII only on purpose. Messages are printed by setup-claude-dev.ps1.)
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%setup-claude-dev.ps1" %*
echo.
pause
endlocal
