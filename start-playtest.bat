@echo off
rem Starts the playtest server for the phone (Tailscale). Double-click to run; close this window to stop it.
title Blessed Company playtest server
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm was not found. Install Node 20 or newer, then try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing packages...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

set "TS=tailscale"
if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
set "TSIP="
for /f "delims=" %%i in ('"%TS%" ip -4 2^>nul') do if not defined TSIP set "TSIP=%%i"
echo.
if defined TSIP (
  echo Phone link: http://%TSIP%:5173/
) else (
  echo Tailscale was not found or is not running; the phone link will not work until it is.
)
echo PC link:    http://localhost:5173/
echo Close this window to stop the server.
echo.

rem Fixed port: if 5173 is taken, stop instead of quietly moving to another port the phone link doesn't use.
call npm run dev:lan -- --port 5173 --strictPort
echo.
echo The server stopped. If it said port 5173 is in use, a server is already running and the phone link should work.
pause
