@echo off
chcp 65001 >nul
title 다와이철거 - 철거 블로그 로그인 (처음 한 번)
REM 2026-10-26: 다와이철거 홍보 블로그는 성글벙글과 다른 네이버 계정이라 자동화용 크롬을 따로 쓴다 (포트 9223).
REM 이 창에서 연 크롬에 철거 블로그 계정으로 로그인해 두면, 아침 자동 실행(auto-day.cmd)이 그 크롬으로 예약발행한다.
REM 로그인이 풀렸을 때도 이것을 다시 실행한다.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" "content/chulgeo/posts/*.json" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList '--remote-debugging-port=9223', ('--user-data-dir=' + (Join-Path $env:LOCALAPPDATA 'chulgeo-chrome')), '--no-first-run', 'https://nid.naver.com/nidlogin.login?url=https%%3A%%2F%%2Fblog.naver.com%%2FGoBlogWrite.naver'"
echo.
echo  새로 열린 크롬 창에서 철거 블로그용 네이버 아이디로 로그인해 주세요.
echo  "로그인 상태 유지" 를 꼭 체크해 주세요.
echo  로그인 후 글쓰기 화면이 보이면 끝입니다. 크롬 창은 닫아도 됩니다.
echo.
pause
