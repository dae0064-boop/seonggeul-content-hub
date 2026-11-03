@echo off
chcp 65001 >nul
title Threads post now
REM Post the next insurance thread (1/2 + 2/2 with banner) right now. Daily limit (3), 40-minute gap and order are still checked.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-post.ps1" -Now
echo.
pause
