@echo off
chcp 65001 >nul
title 성글벙글 - 오늘 원고 전부 임시저장 (발행 안 함)
cd /d "%~dp0.."
REM Generated .json/.html are rebuilt on this PC. Drop local copies so pull never stops (2026-10-03).
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0draft-day.ps1" %*
echo.
echo 끝났어요. Claude 에게 "끝났어" 라고 알려주세요.
pause
