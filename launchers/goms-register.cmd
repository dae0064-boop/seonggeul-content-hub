@echo off
chcp 65001 >nul
title GOMS register
REM GOMS ad-review REAL registration: asks from/to numbers, registers each "thread N" and marks it done in Drive ClaudeWorkspace\goms-done.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\goms-test.ps1" -Submit
echo.
pause
