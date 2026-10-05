@echo off
chcp 65001 >nul
title 성글벙글 - 로그인 확인 (네이버·티스토리)
REM 자동 예약이 쓰는 크롬에서 네이버 글쓰기·티스토리 관리 화면을 실제로 열어 본다 (2026-10-05, login-test 를 합침).
REM 티스토리는 카카오가 계정을 기억하면 버튼만 눌러 스스로 다시 들어간다. 풀린 곳만 로그인 탭을 열어 둔다.
REM 결과와 캡처는 Drive ClaudeWorkspace\run-logs\login-test-* 로 올라가 Claude 가 읽는다.
REM 평소에는 실행할 필요가 없다 — 아침 자동 실행이 크롬을 스스로 켠다.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\login-test.ps1" -OpenLogin
echo.
pause
