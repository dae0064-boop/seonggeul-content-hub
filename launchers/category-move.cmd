@echo off
chcp 65001 >nul
title 성글벙글 - 블로그 카테고리 옮기기
REM 2026-11-04 사용자: 올라간 글 위치를 카테고리에 맞게. content\archive\category-plan.tsv 대로 하위 카테고리로 옮긴다.
REM 한 편 먼저 옮겨 블로그에서 다시 읽어 맞을 때만 나머지를 옮긴다. 기록은 Drive run-logs\category-move-* 로.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\category-move.ps1"
echo.
pause
