@echo off
chcp 65001 >nul
title GOMS revise
REM GOMS rejected-ad RESUBMIT: reads the review comments, rebuilds Word with the required phrase, deletes the old file, adds the new Word and presses edit for every rejected thread post.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\goms-revise.ps1" -Submit
echo.
pause
