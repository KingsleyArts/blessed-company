@echo off
rem Builds the game and opens it in the default browser, on this PC only. Double-click to run; close this window to stop it.
rem For the phone over Tailscale, use start-playtest.bat instead.
title Blessed Company browser build
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

echo Building the game...
call npm run build
if errorlevel 1 (
  echo.
  echo The build failed, so the game was not opened. The error is above.
  pause
  exit /b 1
)

rem test=1 keeps the debug menu (pause the game to open it).
set "URL=http://localhost:4173/?test=1"

rem Already running from an earlier double-click: it serves the new build, so just open the page.
netstat -ano | findstr /r /c:":4173 .*LISTENING" >nul
if not errorlevel 1 (
  start "" "%URL%"
  exit /b 0
)

echo.
echo Game link: %URL%
echo Close this window to stop the game server.
echo.
call npx vite preview --port 4173 --strictPort --open "/?test=1"
echo.
echo The server stopped.
pause
