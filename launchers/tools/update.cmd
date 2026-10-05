@echo off
REM ClaudeWorkspace - update the sync tool from GitHub, then reconnect.
REM Double-click this after Claude tells you the tool was fixed.
setlocal
cd /d "%~dp0"
title ClaudeWorkspace - Update

python --version >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Python is not installed. Run connect.cmd first.
  echo.
  pause
  exit /b 1
)

echo Updating the sync tool from GitHub...
echo.
python "connect.py" --update
echo.
pause
exit /b 0
