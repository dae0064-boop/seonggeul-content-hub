@echo off
chcp 65001 >nul
title 성글벙글 - 예약 글 찾기 (읽기만)
REM 2026-11-13 사용자 "16일부터 다시 진행, 모두 수정해" - 11/16~18 예약 글을 다시 예약하기 전에, 예약 글이 블로그 어디에 보이는지 읽기만 해 Drive run-logs\reserved-look-* 로.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\reserved-look.ps1"
echo.
pause
