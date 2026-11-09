@echo off
chcp 65001 >nul
title 성글벙글 - 블로그 2개 이어서 작업 시험
REM 블로그 1(지금 자동화 크롬) 작업 → 블로그 2(따로 켜는 크롬) 작업 → 블로그 1 다시, 로그인이 서로 풀리지 않는지 본다 (2026-11-09).
REM 글을 쓰거나 저장하지 않는다. 결과는 Drive ClaudeWorkspace\run-logs\two-blog-test-* 로 올라간다.
cd /d "%~dp0.."
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\two-blog-test.ps1"
echo.
pause
