@echo off
REM Tistory: save today's posts as drafts. Just double-click.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
REM The Korean messages live in tistory-day.ps1 (UTF-8 with BOM).
REM   tistory-day.cmd -DryRun      first run: also opens the publish panel and records it (no publish)
setlocal
cd /d "%~dp0"
title Tistory drafts
if not exist "tistory-day.ps1" goto missing
powershell -NoProfile -ExecutionPolicy Bypass -File "tistory-day.ps1" %*
echo.
pause
exit /b 0
:missing
echo.
echo  [!] tistory-day.ps1 is missing. Put it in the same folder as this file.
echo.
pause
exit /b 1
