@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22.13 or newer first.
 pause
 exit /b 1
)
echo Open http://127.0.0.1:3000
node server.js
pause
