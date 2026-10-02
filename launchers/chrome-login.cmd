@echo off
chcp 65001 >nul
title 성글벙글 - 자동화용 크롬 켜기 (네이버·티스토리 로그인)
REM 자동 예약발행이 쓰는 크롬을 켜고 네이버·티스토리 로그인 화면을 연다. 로그인은 사람이 한다.
REM "로그인 상태 유지"에 체크하면 다음부터는 다시 로그인하지 않아도 된다. 이 창은 닫지 않고 둔다.
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo 크롬을 찾지 못했어요. 크롬을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)
start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\seonggeul-chrome" --no-first-run https://nid.naver.com/nidlogin.login https://www.tistory.com/auth/login
echo.
echo 크롬이 열렸어요. 탭 두 개에서 네이버와 티스토리(카카오)에 각각 로그인해 주세요.
echo 두 곳 모두 "로그인 상태 유지"에 체크하면 다음부터 다시 안 해도 돼요.
echo 로그인한 크롬 창은 닫지 말고 그대로 두세요. 이 검은 창은 닫아도 돼요.
pause
