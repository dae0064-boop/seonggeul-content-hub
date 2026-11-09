@echo off
chcp 65001 >nul
title 다와이철거 - 예시 원고 임시저장 (발행 안 함)
REM content\chulgeo\draft.txt 의 원고 하나를 그림까지 만들어 breakandbuild 블로그에 '임시저장'만 한다 (2026-11-09). 발행·예약하지 않는다.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git pull -q --ff-only 2>nul
REM 2026-11-09: draft.txt 의 원고를 모두 차례로 (이미 임시저장한 글은 .done 이 있어 저절로 건너뜀)
set FOUND=
for /f "usebackq eol=# delims=" %%a in ("content\chulgeo\draft.txt") do (
  set FOUND=1
  echo.
  echo === %%a
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\chulgeo-day.ps1" -DraftOnly -Force -Only %%a
)
if not defined FOUND ( echo 임시저장할 원고가 없어요. & pause & exit /b )
echo.
echo 끝났어요. 발행하지 않았어요. breakandbuild 블로그 글쓰기 화면의 '임시저장' 목록에서 확인하세요.
pause
