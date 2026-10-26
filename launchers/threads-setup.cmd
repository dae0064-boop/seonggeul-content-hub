@echo off
chcp 65001 >nul
title Threads auto post setup
REM Registers the daily Threads insurance post task (10:00 13:00 16:00 19:00 22:00, laptop 5 minutes later). -Remove turns it off.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-setup.ps1" %*
echo.
pause
