@echo off
chcp 65001 >nul
title Instagram card news now
REM Instagram card news (2026-11-02): GOMS approval read + register new Word now, then show which post goes up next (test only, posts nothing).
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
REM 2026-11-03: make missing background photos (make-bg) + copy Word/images to Drive first
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\instagram-to-drive.ps1"
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\insta-goms.ps1"
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\insta-post.ps1" -Test
echo.
pause
