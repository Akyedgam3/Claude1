@echo off
rem Wazn admin panel launcher: double-click to start. Close this window to stop.
title Wazn Admin
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed.
  echo     Install the LTS version from nodejs.org, then run this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist "keys\license-private.pem" (
  echo [X] keys\license-private.pem not found.
  echo     Copy the original "keys" folder into:
  echo     %~dp0
  echo     Do NOT generate a new key: it would break every license already sold.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\tsx.cmd" (
  echo First run: installing packages, please wait a few minutes...
  set ELECTRON_SKIP_BINARY_DOWNLOAD=1
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [X] Package install failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo   Wazn Admin: http://127.0.0.1:4100
echo   Keep this window open while you work. Close it to stop.
echo.
set MIZAN_ADMIN_OPEN=1
call node_modules\.bin\tsx.cmd admin\server.ts
pause
