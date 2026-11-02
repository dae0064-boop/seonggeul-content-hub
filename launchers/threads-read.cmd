@echo off
chcp 65001 >nul
title 성글벙글 - 스레드 참고 계정 글 읽기 (읽기만)
REM 2026-11-02 사용자 — 참고할 스레드 계정(yj_baeksbook, jei_7942, bohum.onepick) 글을 읽어 Drive 로 올린다. 누르거나 올리지 않는다.
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
echo [3/3] 세 계정 글 읽는 중... (3~5분, 화면이 저절로 내려가요. 손대지 마세요)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\threads-read.ps1"
echo.
echo 끝났어요. Claude 에게 "다 읽었어" 라고 알려 주세요.
pause
