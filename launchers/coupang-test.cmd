@echo off
chcp 65001 >nul
title 성글벙글 - 쿠팡 링크 만들기 시험
REM 2026-11-01 사용자 — 쿠팡 파트너스 링크가 자동으로 만들어지는지 시험. 링크 2개만 만든다. 결과·화면 기록은 Drive ClaudeWorkspace\coupang\<날짜> 로 올라가 Claude 가 읽는다.
cd /d "%~dp0.."
echo.
echo [1/3] 최신 내용 받는 중...
set GIT_TERMINAL_PROMPT=0
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
echo [2/3] 자동화용 크롬 확인 중...
powershell -NoProfile -Command "try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null } catch { $c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList '--remote-debugging-port=9222', ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), '--no-first-run', 'about:blank'; Start-Sleep 6 }"
echo.
echo 자동화용 크롬에 쿠팡 파트너스 화면을 띄웁니다.
powershell -NoProfile -Command "$c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), 'https://partners.coupang.com/'"
echo.
echo  ----------------------------------------------------------------
echo   방금 앞에 뜬 크롬 탭(쿠팡 파트너스)에서 오른쪽 위 [로그인] 을 누르고
echo   [자동 로그인] 에 체크한 뒤 로그인해 주세요.
echo   위쪽에 리포트·링크 생성 같은 메뉴가 보이면 로그인된 것입니다.
echo   이미 로그인돼 있으면 그냥 넘어가도 됩니다.
echo  ----------------------------------------------------------------
echo   로그인을 마쳤으면 이 검은 창을 클릭하고 아무 키나 누르세요.
pause >nul
echo [3/3] 쿠팡 파트너스에서 링크 2개 만드는 중... (2~5분)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\coupang-links.ps1" -Max 2
echo.
echo 끝났어요. 이 창을 캡처(윈도우 키 + Shift + S)해서 Claude 에게 보여 주세요.
pause
