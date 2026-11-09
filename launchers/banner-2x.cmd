@echo off
chcp 65001 >nul
title Consult banner 2x (sharp)
REM 2026-11-09: consult banner at 2x (3840x1600) to Google Drive ClaudeWorkspace banner folder
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\banner-2x.ps1"
echo.
pause
