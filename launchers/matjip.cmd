@echo off
chcp 65001 >nul
title 성글벙글 - 맛집 글 임시저장
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\matjip-draft.ps1"
echo.
pause
