@echo off
chcp 65001 >nul
title Instagram key setup
REM Instagram access token setup (2026-11-02). Saves INSTAGRAM_ACCESS_TOKEN as a Windows user variable. Just double-click.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\insta-key.ps1"
echo.
pause
