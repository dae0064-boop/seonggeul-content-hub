@echo off
REM ClaudeWorkspace - connect this PC. Just double-click.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0"
title ClaudeWorkspace - Connect

python --version >nul 2>nul
if errorlevel 1 goto nopython

python "connect.py" %*
echo.
pause
exit /b 0

:nopython
echo.
echo  [!] Python is not installed on this PC.
echo.
echo      1. Open PowerShell and run:
echo           winget install Python.Python.3.12
echo      2. Close this window, then double-click this file again.
echo.
pause
exit /b 1
