@echo off
chcp 65001 >nul
title 성글벙글 - 이 PC 에서 스레드·GOMS 준비
REM 노트북(또는 새 PC)에서 스레드 보험글 자동 올리기·GOMS 등록이 돌게 한 번에 준비한다 (2026-10-26 사용자 — "노트북으로 작업 가능하도록").
REM 최신 받기 → 부품 설치 → 스레드 연결 키 → 하루 5번 올리기 등록 → GOMS 로그인 확인. 여러 번 눌러도 괜찮다.
cd /d "%~dp0.."
echo 최신 내용을 받는 중...
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
call npm install --silent --no-audit --no-fund >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-laptop.ps1"
echo.
pause
