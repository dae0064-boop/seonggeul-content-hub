@echo off
chcp 65001 >nul
title Neighbor list
REM Neighbor list now: 15 new posts on the same topic for you to visit with your own ID (read only, presses nothing).
REM The list opens in Notepad and is also copied to Drive blog-stats.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\blog-stats.ps1"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%d
if exist "dumps\blog-stats\%TODAY%\neighbors.txt" (
  start "" notepad "dumps\blog-stats\%TODAY%\neighbors.txt"
) else (
  echo The list was not made. Please take a screenshot of this window and send it to Claude.
)
echo.
pause
