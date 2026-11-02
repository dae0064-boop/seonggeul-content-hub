@echo off
chcp 65001 >nul
title 성글벙글 - 클로드 사용량 창
REM 2026-11-02 사용자 "사용량을 클로드 옆에 계속 뜨게". 채팅 옆 패널(.claude/skills/usage-meter)은
REM 클라우드 대화에서 켜지지 않아(원인은 그 폴더 README), 평소 쓰는 크롬으로 사용량 화면만 작은 창으로 띄운다.
REM 자동화용 크롬(9222)과 상관없다. 읽기만 한다. 숫자를 새로 보려면 창에서 F5.
set URL=https://claude.ai/settings/usage
start "" chrome --app=%URL% --window-size=460,640 2>nul && exit /b 0
start "" msedge --app=%URL% --window-size=460,640 2>nul && exit /b 0
echo 크롬도 엣지도 찾지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요.
pause
