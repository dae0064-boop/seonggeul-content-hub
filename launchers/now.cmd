@echo off
chcp 65001 >nul
title Seonggeul now - images + reserve + homefeed
REM Run the 13/16/19/22 catch-up NOW: makes images (official photos first), reserves today posts not yet reserved, reads Naver homefeed, collects today issues. Results go to Google Drive.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\catchup-reserve.ps1"
echo.
echo Done. You can close this window.
pause
