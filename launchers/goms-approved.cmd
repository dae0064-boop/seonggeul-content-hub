@echo off
chcp 65001 >nul
title GOMS approved
REM Read GOMS approval results (review number, period) for every approved thread post. Read only - nothing is changed in GOMS.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\goms-approved.ps1"
echo.
pause
