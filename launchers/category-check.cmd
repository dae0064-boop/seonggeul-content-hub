@echo off
chcp 65001 >nul
title 성글벙글 - 블로그 카테고리 확인
REM 2026-11-04 사용자: "내 블로그를 들어가서 한번에 확인해야지" — 블로그에 올라간 글 전부와 지금 카테고리를 읽기만 해
REM Drive ClaudeWorkspace\run-logs\category-scan-* 로 올린다. 아무것도 옮기거나 바꾸지 않는다.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\category-scan.ps1"
echo.
pause
