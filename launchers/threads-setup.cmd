@echo off
chcp 65001 >nul
title Threads auto post setup
REM Registers the daily Threads insurance post task (08:30 12:30 18:30 21:30, laptop 5 minutes later). -Remove turns it off.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-setup.ps1" %*
echo.
pause
