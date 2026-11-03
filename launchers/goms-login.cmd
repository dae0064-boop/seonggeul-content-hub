@echo off
chcp 65001 >nul
title GOMS login
REM GOMS login now. If the phone check appears, it presses [send code] and waits up to 6 minutes for the code you tell Claude.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\goms-login.ps1"
echo.
pause
