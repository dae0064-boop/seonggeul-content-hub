@echo off
chcp 65001 >nul
title Threads post test
REM Threads insurance post TEST: shows the next approved post and checks the key and banner. Posts nothing.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-post.ps1" -Test
echo.
pause
