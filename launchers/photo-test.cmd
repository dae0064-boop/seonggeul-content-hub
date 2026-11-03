@echo off
REM Photo search test (Openverse / Pixabay / Wikimedia). Uploads the result to Drive run-logs. Just double-click.
title Photo search test
cd /d "%~dp0.."
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\photo-test.ps1"
echo.
pause
