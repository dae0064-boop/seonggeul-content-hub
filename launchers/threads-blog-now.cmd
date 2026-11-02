@echo off
chcp 65001 >nul
title Threads blog post now
REM Threads blog post NOW: registers the hourly task if missing, then posts one due blog summary (same checks as the scheduled run).
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-blog-setup.ps1" -IfMissing
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-blog.ps1"
echo.
pause
