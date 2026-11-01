@echo off
chcp 65001 >nul
title 성글벙글 - 제휴 링크 만들기 시험 (쇼핑 커넥트 + 쿠팡)
REM 2026-11-01 사용자 "테스트해보자" — 앞으로 나갈 원고에 적힌 상품 말(brandconnect: / coupang:)로 링크를 만든다. 아침 자동 실행과 같은 부품을 그대로 쓴다.
REM 결과·화면 기록은 Drive ClaudeWorkspace\brandconnect\<날짜>, ClaudeWorkspace\coupang\<날짜> 로 올라가 Claude 가 읽는다.
cd /d "%~dp0.."
echo.
echo [1/4] 최신 내용 받는 중...
set GIT_TERMINAL_PROMPT=0
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
echo [2/4] 자동화용 크롬 확인 중...
powershell -NoProfile -Command "try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null } catch { $c='C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList '--remote-debugging-port=9222', ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), '--no-first-run', 'about:blank'; Start-Sleep 6 }"
echo [3/4] 네이버 쇼핑 커넥트 링크 만드는 중... (개당 30초쯤)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\brandconnect-links.ps1"
echo.
echo [4/4] 쿠팡 파트너스 링크 만드는 중... (개당 20초쯤)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\coupang-links.ps1"
echo.
echo 끝났어요. 이 창을 캡처(윈도우 키 + Shift + S)해서 Claude 에게 보여 주세요.
pause
