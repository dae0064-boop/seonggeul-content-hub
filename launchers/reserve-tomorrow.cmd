@echo off
REM Naver + Tistory: reserve-publish TOMORROW's posts tonight (images -> reserve at publish_at). Just double-click.
REM Tistory added 2026-11-02 (user request). Its date is picked on a calendar; if the date does not read back right, the post stays a draft and tomorrow morning's run reserves it.
REM For days the PC will not be turned on in the morning (2026-10-03 user request: Sunday).
REM Posts already done are marked in Drive run-locks\<tomorrow>\, so tomorrow's morning run skips them.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0.."
title Naver + Tistory reserve tomorrow
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main
git pull -q
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\draft-day.ps1' -Reserve -Date (Get-Date).AddDays(1).ToString('yyyy-MM-dd') %*"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\tistory-day.ps1' -Reserve -RetryDrafts -Date (Get-Date).AddDays(1).ToString('yyyy-MM-dd')"
echo.
echo  Done. Tell Claude: "done" (results are uploaded to Google Drive run-logs).
echo.
pause
