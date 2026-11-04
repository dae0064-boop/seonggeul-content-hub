@echo off
chcp 65001 >nul
title 성글벙글 - 맛집 글 임시저장
REM 2026-11-04 사용자: 사진을 보내면 Claude 가 원고를 쓰고, 이 PC 가 네이버에 사진·지도까지 넣어 임시저장한다. 발행은 사용자가 확인하고 직접.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\matjip-draft.ps1"
echo.
pause
