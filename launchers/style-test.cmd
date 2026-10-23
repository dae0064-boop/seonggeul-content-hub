@echo off
chcp 65001 >nul
title Style test
REM 2026-10-23 user request: same scene in 5 art styles for a demolition blog. low quality, about $0.03.
REM Images already made are skipped (no double cost). Result is copied to Drive ClaudeWorkspace\style-test\ and opened.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
node scripts\post-images.mjs content\style-test\chulgeo-style.json
powershell -NoProfile -ExecutionPolicy Bypass -Command ". '%~dp0tools\lib-drive.ps1'; $d = Find-MyDrive; $src = 'content\images\style-test-chulgeo-5styles'; if ($d -and (Test-Path $src)) { $to = Join-Path $d 'ClaudeWorkspace\style-test'; New-Item -ItemType Directory -Force -Path $to | Out-Null; Copy-Item \"$src\*.png\" $to -Force; Start-Process explorer.exe $to } elseif (Test-Path $src) { Start-Process explorer.exe (Resolve-Path $src) }"
echo.
pause
