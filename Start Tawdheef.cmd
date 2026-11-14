@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" scripts/start.mjs %*
  if errorlevel 1 pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 26 LTS from https://nodejs.org/en/download
  echo Then open this file again.
  pause
  exit /b 1
)
node scripts/start.mjs %*
if errorlevel 1 pause
