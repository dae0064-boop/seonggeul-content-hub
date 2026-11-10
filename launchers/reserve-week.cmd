@echo off
REM Naver + Tistory: reserve-publish the NEXT 6 DAYS of posts now (2026-11-10 user: "write ahead to next Sunday and reserve").
REM Same as reserve-tomorrow.cmd, repeated for tomorrow ... +6 days (Naver allows reservations up to 7 days ahead).
REM Posts already done are marked in Drive run-locks\<date>\, so later runs (morning, catchup) skip them. Safe to run again.
REM Dawai-cheolgeo (breakandbuild) posts are not reserved ahead: the PC posts them on their own day.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0.."
title Naver + Tistory reserve next 6 days
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main
git pull -q
for /L %%i in (1,1,6) do (
  echo.
  echo ===== day +%%i =====
  powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\draft-day.ps1' -Reserve -Date (Get-Date).AddDays(%%i).ToString('yyyy-MM-dd')"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\tistory-day.ps1' -Reserve -RetryDrafts -Date (Get-Date).AddDays(%%i).ToString('yyyy-MM-dd')"
)
echo.
echo  Done. Tell Claude: "done" (results are uploaded to Google Drive run-logs).
echo.
pause
