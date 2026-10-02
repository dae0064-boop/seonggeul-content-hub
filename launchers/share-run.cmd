@echo off
chcp 65001 >nul
title 성글벙글 - 최근 실행 결과를 Google Drive 로 올리기
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0share-run.ps1" %*
echo.
pause
