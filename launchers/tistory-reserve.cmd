@echo off
REM Tistory: reserve-publish today's posts at their publish_at times (30 min after Naver). Just double-click.
REM Same as what auto-day.cmd runs every morning. Use it when the morning run was missed.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0"
title Tistory reserve
if not exist "tistory-day.ps1" goto missing
REM Get the latest scripts first, so a fix made in the cloud is used right away (2026-10-05).
pushd ..
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul || echo  [!] Could not get the latest files. Continuing with what is on this PC.
popd
powershell -NoProfile -ExecutionPolicy Bypass -File "tistory-day.ps1" -Reserve -RetryDrafts %*
echo.
pause
exit /b 0
:missing
echo.
echo  [!] tistory-day.ps1 is missing. Put it in the same folder as this file.
echo.
pause
exit /b 1
