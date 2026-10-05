@echo off
REM GOMS ad-review registration TEST: fills the form for "thread 11" and the checklist, then stops (never presses register).
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0"
title GOMS test
pushd ..
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
popd
powershell -NoProfile -ExecutionPolicy Bypass -File "goms-test.ps1"
echo.
pause
