@echo off
chcp 65001 >nul
title 성글벙글 - 지난 파일 정리
REM 2026-11-02 사용자 "사용하지 않거나 오래된 파일 모두 삭제". 아침 실행 끝에도 저절로 돈다 — 지금 바로 지우고 싶을 때만 더블클릭.
cd /d "%~dp0.."
echo.
echo 지난 그림·화면 기록·Drive 날짜 폴더를 지우는 중... (1~2분)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\cleanup.ps1"
echo.
echo 끝났어요. 이 창은 닫아도 돼요.
pause
