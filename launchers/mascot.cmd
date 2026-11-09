@echo off
chcp 65001 >nul
title Card mascot (Kang team leader)
REM 2026-11-09: make the card character now (clay 3D). Candidates first; after the user picks one, poses. Results go to Drive ClaudeWorkspace\mascot.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ". '%~dp0tools\lib-drive.ps1'; $d = Find-MyDrive; if (-not $d) { Write-Host 'Google Drive not found'; exit 1 }; node scripts\cards\make-mascot.mjs --out (Join-Path $d 'ClaudeWorkspace\mascot')"
echo.
pause
