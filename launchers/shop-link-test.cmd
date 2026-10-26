@echo off
chcp 65001 >nul
title 쇼핑 커넥트 링크 시험
REM 2026-10-26: run the morning shopping-connect link step now (scripts\brandconnect-links.mjs). No purchase, no settings.
REM Result: dumps\brandconnect\<date>\ and Drive ClaudeWorkspace\brandconnect\<date>\ (Claude reads it there).
cd /d "%~dp0.."
set GIT_TERMINAL_PROMPT=0
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git -c credential.helper= pull -q --ff-only 2>nul
echo.
echo [1/2] 자동화용 크롬 켜는 중...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null } catch { $c = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $c)) { $c = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; Start-Process $c -ArgumentList '--remote-debugging-port=9222', ('--user-data-dir=' + $env:LOCALAPPDATA + '\seonggeul-chrome'), '--no-first-run', 'about:blank'; Start-Sleep 6 }"
echo.
echo [2/2] 쇼핑 커넥트에서 링크 만드는 중... (1~3분, 크롬 창이 저절로 움직여요. 손대지 마세요)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\brandconnect-links.ps1"
echo.
echo 끝났어요. 이 창을 캡처하지 않아도 Claude 가 Drive 에서 결과를 읽어요. 아무 키나 누르면 닫혀요.
pause >nul
