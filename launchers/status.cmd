@echo off
REM ClaudeWorkspace - show status and diagnose problems.
setlocal
cd /d "%~dp0"
title ClaudeWorkspace - Status

python --version >nul 2>nul
if errorlevel 1 (
  echo [!] Python is not installed. Run connect.cmd first.
  pause
  exit /b 1
)

python ".workspace\bin\workspace.py" status
echo.
echo -----------------------------------------------
echo.
python ".workspace\bin\workspace.py" doctor
echo.
pause
exit /b 0
