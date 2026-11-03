@echo off
chcp 65001 >nul
title Banner styles
REM Threads ad-review banner: 3 new design drafts with GPT (low) background, about 30 KRW. Result goes to Drive ClaudeWorkspace\banner-styles.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\banner-styles.ps1"
echo.
pause
