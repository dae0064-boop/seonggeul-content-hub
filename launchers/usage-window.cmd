@echo off
chcp 65001 >nul
title 성글벙글 - 클로드 사용량 창
REM 2026-11-02 사용자 "사용량을 클로드 옆에 계속 뜨게" → "채팅창 옆에 고정".
REM 채팅 옆 패널(.claude/skills/usage-meter)은 클라우드 대화에서 켜지지 않아(원인은 그 폴더 README),
REM 평소 크롬으로 사용량 화면을 작은 창으로 띄워 화면 오른쪽 끝에 '항상 위'로 고정한다 (tools\usage-pin.ps1).
REM 자동화용 크롬(9222)과 상관없다. 읽기만 한다. 숫자를 새로 보려면 창에서 F5.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\usage-pin.ps1"
if errorlevel 1 pause
