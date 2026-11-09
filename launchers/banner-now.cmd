@echo off
chcp 65001 >nul
title Blog banner GPT images
REM 2026-11-09: blog banner GPT images (soft-*) to Google Drive ClaudeWorkspace banner folder
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\banner-now.ps1"
echo.
pause
