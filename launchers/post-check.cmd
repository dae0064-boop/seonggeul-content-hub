@echo off
chcp 65001 >nul
title 성글벙글 - 목록에 안 나오는 글 찾기
REM 2026-11-04 사용자: "연예·방송 글 안 보여" — 전체보기에 안 나오는 발행 글을 찾아 카테고리·상태를 읽기만 해 Drive run-logs\post-check-* 로.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\post-check.ps1"
echo.
pause
