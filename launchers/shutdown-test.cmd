@echo off
chcp 65001 >nul
REM 아침 작업 끝 "PC 끄기" 창 시험 (2026-10-09). 창과 버튼만 확인하고 실제로 끄지 않는다.
cd /d "%~dp0.."
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main
git pull -q
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\auto-shutdown.ps1" -Test
echo.
echo 시험이 끝났어요. 이 창은 닫아도 됩니다.
pause
