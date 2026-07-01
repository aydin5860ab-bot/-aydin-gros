@echo off
cd /d "%~dp0"
:loop
echo [Watchdog] Starting store node POS lane server on port 3000...
call npx next start -p 3000
echo [Watchdog] POS server crashed. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
