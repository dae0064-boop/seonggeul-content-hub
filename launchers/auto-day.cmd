@echo off
chcp 65001 >nul
REM 작업 스케줄러가 매일 아침 부르는 실행기. 사람이 누를 키가 없으므로 pause 를 두지 않는다.
REM 최신 원고를 받고, 오늘 원고 전부 이미지 → 예약발행(publish_at 시각)까지 한다.
cd /d "%~dp0.."
git checkout -q main
git pull -q
REM Threads insurance posts: save new Word files to Drive (fast, before the blog run)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0insurance-word.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0draft-day.ps1" -Reserve %*
REM 예전에 등록한 PC 라도 "다시 시도" 시각이 생기게 한다 (한 번만 바뀐다)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-retry.ps1"
