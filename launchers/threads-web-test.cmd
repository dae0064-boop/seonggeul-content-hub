@echo off
chcp 65001 >nul
title 성글벙글 - 스레드 예약 화면 시험 (올리지 않음)
REM 2026-11-01 사용자 — 스레드 하루 글을 아침 10시에 앱 예약으로 넣기 위해, 예약 화면이 어떻게 생겼는지만 찍어 온다. 글은 올리지 않는다.
cd /d "%~dp0.."
echo.
echo [1/3] 최신 내용 받는 중...
set GIT_TERMINAL_PROMPT=0
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
echo [2/3] 자동화용 크롬 확인 중...
powershell -NoProfile -Command "try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null } catch { $c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList '--remote-debugging-port=9222', ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), '--no-first-run', 'about:blank'; Start-Sleep 6 }"
powershell -NoProfile -Command "$c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), 'https://www.threads.com/'"
echo.
echo  ----------------------------------------------------------------
echo   방금 앞에 뜬 크롬 탭(스레드)에서 seongdaeeyo 계정으로 로그인해 주세요.
echo   화면 위쪽에 "새로운 소식이 있나요?" 칸이 보이면 로그인된 것입니다.
echo   이미 로그인돼 있으면 그냥 넘어가도 됩니다.
echo  ----------------------------------------------------------------
echo   로그인을 마쳤으면 이 검은 창을 클릭하고 아무 키나 누르세요.
pause >nul
echo [3/3] 예약 화면 살펴보는 중... (1분쯤, 글은 올리지 않아요)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-web-test.ps1"
echo.
echo 끝났어요. 이 창을 캡처(윈도우 키 + Shift + S)해서 Claude 에게 보여 주세요.
pause
