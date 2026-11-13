@echo off
chcp 65001 >nul
title 성글벙글 - 예약 글 다시 하기 (11/16~18)
REM 2026-11-13 사용자 "모두 수정해, 16일부터 다시" - 예약 글을 지우고 새 그림으로 다시 예약한다. 기록은 Drive run-logs\reserved-redo-*.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\reserved-redo.ps1"
echo.
pause
