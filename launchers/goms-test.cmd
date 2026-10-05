@echo off
chcp 65001 >nul
title GOMS test
REM GOMS ad-review registration TEST: fills the form for "thread 11" and the checklist, then stops (never presses register).
REM Screenshots and result go to Drive ClaudeWorkspace\run-logs\goms-test-* for Claude to read.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\goms-test.ps1"
echo.
pause
