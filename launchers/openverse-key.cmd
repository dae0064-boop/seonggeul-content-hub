@echo off
REM Openverse (free CC photo search) sign-up + key save. Just double-click. Korean messages live in tools\openverse-key.ps1.
title Openverse key setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\openverse-key.ps1"
echo.
pause
