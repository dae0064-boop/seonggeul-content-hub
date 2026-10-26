@echo off
chcp 65001 >nul
title Threads post now
REM Threads insurance post NOW: posts the next approved post (1/2 text + 2/2 text with the approval banner). Same checks as the scheduled run.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-post.ps1"
echo.
pause
