@echo off
chcp 65001 >nul
title 성글벙글 - PC 끄기 창 시험
REM 아침 작업 끝 "PC 끄기" 창 시험 (2026-10-09). 1분짜리 창을 띄우고, [지금 끄기]나 1분 무응답이면 실제로 끈다.
REM 최신 내용은 sync.cmd 로 먼저 받는다 (여기서 git pull 하면 숨은 로그인 창을 기다리며 멈출 수 있다 — 10/9 시험에서 창이 안 떴다)
cd /d "%~dp0.."
echo.
echo PC 끄기 창을 띄웁니다. 몇 초 기다려 주세요...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\auto-shutdown.ps1" -Test
echo.
echo 위 글자를 캡처해서 Claude 에게 보여 주세요. [끄지 않기] 를 눌렀으면 PC 는 켜져 있어요.
pause
