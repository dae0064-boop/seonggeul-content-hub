@echo off
REM Tistory: reserve-publish today's posts at their publish_at times (30 min after Naver). Just double-click.
REM Same as what auto-day.cmd runs every morning. Use it when the morning run was missed.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0"
title Tistory reserve
if not exist "tistory-day.ps1" goto missing
powershell -NoProfile -ExecutionPolicy Bypass -File "tistory-day.ps1" -Reserve %*
echo.
pause
exit /b 0
:missing
echo.
echo  [!] tistory-day.ps1 is missing. Put it in the same folder as this file.
echo.
pause
exit /b 1
