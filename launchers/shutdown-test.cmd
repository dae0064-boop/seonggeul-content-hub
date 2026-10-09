@echo off
chcp 65001 >nul
REM 아침 작업 끝 "PC 끄기" 창 시험 (2026-10-09). 1분짜리 창을 띄우고, [지금 끄기]나 1분 무응답이면 실제로 끈다.
cd /d "%~dp0.."
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main
git pull -q
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\auto-shutdown.ps1" -Test
echo.
echo [끄지 않기] 를 눌렀으면 PC 는 켜져 있어요. 끄는 중이면 30초 안에 꺼져요.
pause
