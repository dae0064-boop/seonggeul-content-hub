@echo off
chcp 65001 >nul
title Banner swap
REM Replace the banner picture in every Drive insurance Word file with the new banner (2026-11-03).
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\banner-swap.ps1"
echo.
pause
