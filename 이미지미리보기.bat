@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   프롬프트만 확인합니다. 비용이 들지 않습니다.
echo.
node scripts/gen-images.mjs --dry-run
echo.
pause
