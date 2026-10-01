@echo off
chcp 65001 >nul
title 성글벙글 - 오늘 원고 전부 임시저장 (발행 안 함)
cd /d "%~dp0.."
git pull
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0draft-day.ps1" %*
echo.
echo 끝났어요. Claude 에게 "끝났어" 라고 알려주세요.
pause
