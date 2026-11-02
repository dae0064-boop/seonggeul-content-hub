@echo off
chcp 65001 >nul
title 성글벙글 - 클로드 사용량 위젯
REM 2026-11-02 사용자 "채팅창 옆에 이런 식으로(둥근 막대)". 화면 오른쪽 위에 항상 떠 있는 위젯을 띄운다.
REM 숫자는 자동화용 크롬(9222)의 claude.ai 로그인으로 5분마다 읽는다 (scripts/claude-usage.mjs). 읽기만 한다.
cd /d "%~dp0.."
echo.
echo [1/3] 자동화용 크롬 확인 중...
powershell -NoProfile -Command "try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null } catch { $c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList '--remote-debugging-port=9222', ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), '--no-first-run', 'about:blank'; Start-Sleep 6 }"
echo [2/3] 사용량 읽는 중... (10~20초)
node scripts\claude-usage.mjs
if errorlevel 3 goto login
if errorlevel 1 goto fail
goto widget

:login
powershell -NoProfile -Command "$c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), 'https://claude.ai/login'"
echo.
echo  ----------------------------------------------------------------
echo   방금 앞에 뜬 크롬 탭(claude.ai)에서 평소 Claude 계정으로 로그인해 주세요.
echo   왼쪽에 대화 목록이 보이면 로그인된 것입니다.
echo  ----------------------------------------------------------------
echo   로그인을 마쳤으면 이 검은 창을 클릭하고 아무 키나 누르세요.
pause >nul
node scripts\claude-usage.mjs
if errorlevel 1 goto fail
goto widget

:fail
echo.
echo   사용량을 읽지 못했어요. 이 창을 캡처(윈도우 키 + Shift + S)해서 Claude 에게 보여 주세요.
echo   (기록: dumps\claude-usage-raw.json)
pause
exit /b 1

:widget
echo [3/3] 위젯 띄우는 중... 이 검은 창은 저절로 닫혀요.
start "" powershell -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0tools\usage-widget.ps1"
exit /b 0
