@echo off
rem One-click: applies general Claude Code development settings to THIS PC (user level, %USERPROFILE%\.claude).
rem ASCII only on purpose (console code pages). Korean messages are printed by install-global.ps1.
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%install-global.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
pause
endlocal & exit /b %RC%
