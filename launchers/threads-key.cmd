@echo off
chcp 65001 >nul
title Threads key setup
REM Threads access token setup (2026-10-26). Saves THREADS_ACCESS_TOKEN as a Windows user variable. Just double-click.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-key.ps1"
echo.
pause
