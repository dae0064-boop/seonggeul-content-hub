@echo off
chcp 65001 >nul
title 성글벙글 - 블로그 카테고리 옮기기
REM 2026-11-04 사용자: 올라간 글 위치를 카테고리에 맞게. content\archive\category-plan.tsv 대로 하위 카테고리로 옮긴다.
REM 2026-11-09 사용자: 맛집·카페, 여행·나들이 카테고리를 지울 거라 그 안의 글을 모두 위 카테고리 강팀장·일상으로 (-Daily).
REM 같은 날 사용자: 생활·보장도 지울 거라 그 안(하위 칸 포함)의 글을 보험금·실비 / 병원비·돌봄 / 지원금·제도 로 주제에 맞게 (-Care). 둘을 차례로 한다.
REM 한 편 먼저 옮겨 블로그에서 다시 읽어 맞을 때만 나머지를 옮긴다. 기록은 Drive run-logs\category-move-* 로.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\category-move.ps1" -Daily -Care
echo.
pause
