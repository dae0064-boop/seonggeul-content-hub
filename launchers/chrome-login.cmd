@echo off
chcp 65001 >nul
title 성글벙글 - 자동화용 크롬 켜기 (네이버·티스토리 로그인)
REM 자동 예약발행이 쓰는 크롬을 켜고 네이버·티스토리 로그인이 살아 있는지 본다. 풀린 곳만 로그인 화면을 연다. 로그인은 사람이 한다.
REM 평소에는 실행할 필요가 없다 — 아침 자동 실행이 크롬을 스스로 켠다. 로그인이 풀렸다는 알림을 받았을 때만 쓴다.
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo 크롬을 찾지 못했어요. 크롬을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)
REM 2026-10-05: 로그인돼 있으면 로그인 화면을 열지 않는다. 풀린 곳만 연다 (scripts\login-check.mjs).
powershell -NoProfile -Command "try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\seonggeul-chrome" --no-first-run https://www.naver.com
  timeout /t 6 /nobreak >nul
)
cd /d "%~dp0.."
echo.
echo 로그인 상태를 확인하는 중... (30초쯤)
echo.
node scripts\login-check.mjs --open-login
if errorlevel 3 goto needlogin
if errorlevel 1 goto nochrome
echo.
echo 네이버·티스토리 모두 로그인돼 있어요. 할 일이 없어요. 이 창은 닫아도 돼요.
pause
exit /b 0
:needlogin
echo.
echo 크롬에 새로 열린 로그인 탭에서 로그인한 뒤, 크롬 창은 닫지 말고 그대로 두세요.
echo 이 검은 창은 닫아도 돼요.
pause
exit /b 0
:nochrome
echo.
echo 자동화용 크롬을 찾지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요.
pause
exit /b 1
