@echo off
REM Naver + Tistory: reserve-publish the NEXT 7 DAYS of posts now (2026-11-10 user: "write ahead to next Sunday and reserve").
REM Same as reserve-tomorrow.cmd, repeated for tomorrow ... +7 days (Naver and Tistory allow reservations up to 7 days ahead).
REM 2026-11-11 fix: the start date is fixed once at the beginning. Before, each step re-read today's date, so a run that
REM crossed midnight skipped a day (11/10 run: Tistory 11/16 was skipped and 11/17 done instead).
REM Posts already done are marked in Drive run-locks\<date>\, so later runs (morning, catchup) skip them. Safe to run again.
REM 2026-11-11: Dawai-cheolgeo (breakandbuild, chrome 9223) posts are also reserved ahead, 10 a day (chulgeo-day.ps1 -Date).
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949.
setlocal
cd /d "%~dp0.."
title Naver + Tistory + Cheolgeo reserve next 7 days
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main
git pull -q
for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set BASE=%%d
echo Start date: %BASE%
for /L %%i in (1,1,7) do (
  echo.
  echo ===== day +%%i =====
  powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\draft-day.ps1' -Reserve -Date ([datetime]'%BASE%').AddDays(%%i).ToString('yyyy-MM-dd')"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\tistory-day.ps1' -Reserve -RetryDrafts -Date ([datetime]'%BASE%').AddDays(%%i).ToString('yyyy-MM-dd')"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\chulgeo-day.ps1' -Date ([datetime]'%BASE%').AddDays(%%i).ToString('yyyy-MM-dd')"
)
echo.
echo  Done. Tell Claude: "done" (results are uploaded to Google Drive run-logs).
echo.
pause
