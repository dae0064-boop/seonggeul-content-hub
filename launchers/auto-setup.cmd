@echo off
chcp 65001 >nul
title 성글벙글 - 아침 자동 예약발행 등록
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-setup.ps1" %*
echo.
pause
