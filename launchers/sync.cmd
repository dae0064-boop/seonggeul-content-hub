@echo off
chcp 65001 >nul
title 성글벙글 - 최신 상태로 맞추기
REM 작업을 시작하기 전에 더블클릭한다. 어느 PC 에서든 GitHub main 과 같은 상태가 된다.
cd /d "%~dp0.."
echo.
echo [1/4] 최신 내용 받는 중... (보통 30초 안쪽)
REM 2026-10-08: 사무실 PC 에서 여기서 멈췄다. 숨은 GitHub 로그인 창을 기다리지 않게 하고, 느리면 30초 뒤 끊는다 (공개 저장소라 로그인 필요 없음).
set GIT_TERMINAL_PROMPT=0
set GCM_INTERACTIVE=never
git -c credential.helper= -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch origin || (echo   받아오지 못했어요. 인터넷이 되는지 확인하고, 이 창을 캡처해서 Claude 에게 보여주세요. & pause & exit /b 1)
REM Generated .json/.html are rebuilt on this PC. Drop local copies so pull never stops (2026-10-03).
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main || (echo   이 PC 에서 고친 파일이 있어 main 으로 바꾸지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요. & pause & exit /b 1)
git -c credential.helper= -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 pull -q --ff-only || (echo   받아오지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요. & pause & exit /b 1)
echo   완료
echo.
echo [2/4] 도구 확인 중...
call npm install --no-audit --no-fund >nul 2>&1
echo   완료
echo.
echo [3/4] 이 PC 의 자동 예약발행
schtasks /query /tn SeonggeulDailyReserve >nul 2>&1 && (echo   켜져 있어요 ^(발행 담당 PC^)) || (echo   꺼져 있어요 ^(확인·수정용 PC^))
echo.
echo ============================================================
powershell -NoProfile -Command "Get-Content -Encoding UTF8 docs\STATUS.md | Select-Object -First 40"
echo ============================================================
echo.
REM Insurance Word step runs last so its result line stays visible at the bottom
echo [4/4] 보험글 Word 를 Drive 보험글 폴더에 저장
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\insurance-word.ps1"
echo.
echo 최신 상태예요. 이제 Claude 에게 "이어서 진행해줘" 라고 하면 됩니다.
pause
