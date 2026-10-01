@echo off
REM Make a blog image with OpenAI (gpt-image-2, low). Just double-click.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
REM The Korean messages live in image.ps1 (UTF-8 with BOM).
setlocal
cd /d "%~dp0"
title Blog image maker

if not exist "image.ps1" goto missing

powershell -NoProfile -ExecutionPolicy Bypass -File "image.ps1"
echo.
pause
exit /b 0

:missing
echo.
echo  [!] image.ps1 is missing. Put it in the same folder as this file.
echo.
pause
exit /b 1
