@echo off
rem Preview only: shows what INSTALL-GLOBAL.bat would change. Writes nothing.
rem ASCII only on purpose (console code pages). Korean messages are printed by install-global.ps1.
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%install-global.ps1" -Check
set "RC=%ERRORLEVEL%"
echo.
pause
endlocal & exit /b %RC%
