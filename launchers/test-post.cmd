@echo off
chcp 65001 >nul
title 시험 글 1편 예약
REM 2026-10-26: reserve ONE extra test post (shopping-connect link test). Other posts of today are not touched (-Only).
cd /d "%~dp0.."
set GIT_TERMINAL_PROMPT=0
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git -c credential.helper= pull -q --ff-only 2>nul
call npm install --no-audit --no-fund >nul 2>&1
echo.
echo 시험 글 1편(저온화상 · 핫팩 쇼핑 링크)을 그림 만들고 오늘 19:00 으로 예약해요. (5~10분, 크롬이 저절로 움직여요. 손대지 마세요)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\draft-day.ps1" -Reserve -Only jeoon-hwasang-hatpaek
echo.
echo 끝났어요. 결과는 Drive 로 올라가서 Claude 가 읽어요. 아무 키나 누르면 닫혀요.
pause >nul
