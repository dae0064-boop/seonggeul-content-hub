@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   이미지 생성을 시작합니다.
echo.
node scripts/gen-images.mjs --yes
echo.
echo   끝났습니다. 창을 닫으셔도 됩니다.
pause
