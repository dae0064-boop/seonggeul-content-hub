@echo off
REM Test images for the flu vaccine post (3 images per style). Just double-click.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
REM The Korean messages live in flu-test.ps1 (UTF-8 with BOM).
setlocal
cd /d "%~dp0"
title Flu post test images

if not exist "flu-test.ps1" goto missing

powershell -NoProfile -ExecutionPolicy Bypass -File "flu-test.ps1"
echo.
pause
exit /b 0

:missing
echo.
echo  [!] flu-test.ps1 is missing. Put it in the same folder as this file.
echo.
pause
exit /b 1
