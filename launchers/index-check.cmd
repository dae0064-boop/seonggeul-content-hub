@echo off
chcp 65001 >nul
title 성글벙글 - 구글 색인 확인 (티스토리)
REM 2026-10-26 사용자: 구글 메일 "새로운 이유로 인해 seongdaeeyo.com 사이트맵 페이지의 색인이 생성되지 않습니다" — "너가 들어가서 확인해봐".
REM 자동화용 크롬으로 서치 콘솔 '페이지' 보고서와 사이트맵·글 주소 상태를 읽기만 해 Drive ClaudeWorkspace\run-logs\index-check-* 로 올린다.
REM 아무것도 누르거나 바꾸지 않는다. 내일부터는 아침 자동 실행(tistory-stats)이 매일 같은 것을 읽는다.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\index-check.ps1"
echo.
pause
