@echo off
chcp 65001 >nul
title 성글벙글 - 최신 상태로 맞추기
REM 작업을 시작하기 전에 더블클릭한다. 어느 PC 에서든 GitHub main 과 같은 상태가 된다.
cd /d "%~dp0.."
echo.
echo [1/4] 최신 내용 받는 중...
git fetch -q origin || (echo   인터넷이나 GitHub 연결을 확인해 주세요. & pause & exit /b 1)
git checkout -q main || (echo   이 PC 에서 고친 파일이 있어 main 으로 바꾸지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요. & pause & exit /b 1)
git pull -q --ff-only || (echo   받아오지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요. & pause & exit /b 1)
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
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0insurance-word.ps1"
echo.
echo 최신 상태예요. 이제 Claude 에게 "이어서 진행해줘" 라고 하면 됩니다.
pause
