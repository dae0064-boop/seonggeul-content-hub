@echo off
REM OpenAI API key setup. Just double-click.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
REM The Korean messages live in openai-key.ps1 (UTF-8 with BOM).
setlocal
cd /d "%~dp0"
title OpenAI key setup

if not exist "openai-key.ps1" goto missing

powershell -NoProfile -ExecutionPolicy Bypass -File "openai-key.ps1"
echo.
pause
exit /b 0

:missing
echo.
echo  [!] openai-key.ps1 is missing. Put it in the same folder as this file.
echo.
pause
exit /b 1
