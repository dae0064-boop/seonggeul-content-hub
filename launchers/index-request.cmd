@echo off
chcp 65001 >nul
title 성글벙글 - 구글 색인 생성 요청 (티스토리)
REM 2026-10-26 사용자 "90편 색인 생성 요청해줘". 색인 안 된 글만 하루 10편까지 요청한다 (구글 하루 한도).
REM 아침 자동 실행도 매일 10편씩 이어서 한다 — 평소에는 누를 필요 없다.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\sc-request.ps1"
echo.
echo 끝났으면 Claude 에게 "색인 요청 했어" 라고 말해 주세요.
pause
