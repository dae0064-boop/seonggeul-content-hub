@echo off
chcp 65001 >nul
title 성글벙글 - 맛집 예약 바로 확인
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\matjip-watch-setup.ps1" -IfMissing
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\matjip-watch.ps1"
echo.
echo 끝났어요. 결과는 Claude 에게 "예약됐어?" 라고 물어보세요.
pause
