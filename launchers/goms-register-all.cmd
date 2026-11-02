@echo off
chcp 65001 >nul
title 성글벙글 - GOMS 광고심의 등록 (하루 30편까지)
REM 2026-11-02 사용자: "이번 달 하루 3편 스레드에 필요한 심의글을 오늘 중으로 다 심의 올리자" — 아직 등록 안 한 31편~ 을 차례로 모두 등록한다.
REM 2026-11-02 사용자: "한 번에 너무 많이 올리면 잘 안 나니 하루 30개만" — 한 번 실행에 아직 안 올린 편 30편까지. 다음 날 다시 더블클릭하면 다음 30편.
REM 원고(sets)로 Word 를 새로 만들고 약관 참조 문구를 넣은 뒤 올린다. 등록한 편은 Drive goms-done 에 표시돼 다시 하지 않는다 (중간에 끊겨도 다시 더블클릭하면 이어서).
cd /d "%~dp0.."
echo.
echo [1/3] 최신 내용 받는 중...
set GIT_TERMINAL_PROMPT=0
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
echo [2/3] 자동화용 크롬 확인 중...
powershell -NoProfile -Command "try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null } catch { $c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList '--remote-debugging-port=9222', ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), '--no-first-run', 'about:blank'; Start-Sleep 6 }"
powershell -NoProfile -Command "$c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), 'https://www.globalgoms.co.kr/#/'"
echo.
echo  ----------------------------------------------------------------
echo   방금 앞에 뜬 크롬 탭에서 GOMS 에 로그인해 주세요 (휴대폰 인증까지).
echo   GOMS 첫 화면(왼쪽에 "업무" 메뉴)이 보이면 로그인된 것입니다.
echo  ----------------------------------------------------------------
echo   로그인을 마쳤으면 이 검은 창을 클릭하고 아무 키나 누르세요.
pause >nul
echo [3/3] GOMS 에 차례로 등록하는 중... (30편까지, 한 편에 1~2분이라 1시간쯤. 창을 닫지 마세요)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\goms-register-auto.ps1" -Count 30 -IgnorePause
echo.
echo 끝났어요. Claude 에게 "GOMS 끝" 이라고 알려 주세요.
pause
