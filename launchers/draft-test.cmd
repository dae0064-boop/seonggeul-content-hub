@echo off
chcp 65001 >nul
title Seonggeul draft test - images + Naver draft only (no publish)
REM Saves the posts listed in content\calendar\draft-test.txt as Naver drafts with images. Never publishes or reserves.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\draft-test.ps1"
echo.
echo Done. NOT published. Check the Naver blog draft list.
pause
