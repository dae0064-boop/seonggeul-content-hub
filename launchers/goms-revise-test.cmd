@echo off
chcp 65001 >nul
title GOMS revise test
REM GOMS rejected-ad TEST: reads the review comments, rebuilds Word with the required phrase, ticks the file box of the first one, then stops (never deletes or presses edit).
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\goms-revise.ps1"
echo.
pause
