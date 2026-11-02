@echo off
chcp 65001 >nul
title Instagram post now
REM Instagram card news (2026-11-02): post one approved card news NOW (ignores the 18-22h window). While content\instagram\PAUSE-POST exists, only numbers in content\instagram\post-allow.txt are posted.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\insta-post.ps1" -Now
echo.
pause
