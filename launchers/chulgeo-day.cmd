@echo off
chcp 65001 >nul
title 다와이철거 - 오늘 글 지금 올리기
REM 2026-10-26: 아침 자동 실행을 기다리지 않고 철거 블로그 글을 지금 예약발행한다 (같은 글을 두 번 올리지 않는다).
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" "content/chulgeo/posts/*.json" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\chulgeo-day.ps1"
echo.
pause
