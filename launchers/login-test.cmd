@echo off
REM Login test: the automation itself opens Naver blog write page and Tistory manage page, then uploads result + screenshots to Drive.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0"
title Login test
pushd ..
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
popd
powershell -NoProfile -ExecutionPolicy Bypass -File "login-test.ps1"
echo.
pause
