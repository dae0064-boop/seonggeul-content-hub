@echo off
chcp 65001 >nul
title 성글벙글 - 집 비우기 전 확인
REM 2026-11-05: 집을 며칠 비우기 전에 한 번 더블클릭한다. 작업 등록 확인 · 윈도우 업데이트 7일 멈춤 · 네이버·티스토리 로그인 확인.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\away-check.ps1"
echo.
pause
