@echo off
chcp 65001 >nul
title Style test
REM Style tests (not for publishing). Runs every plan in content\style-test\*.json, low quality.
REM 2026-10-23 demolition blog 5 styles (about $0.03), 2026-10-24 care photo 2 + life photo 2 images (about $0.02).
REM Images already made are skipped (no double cost). Result is copied to Drive ClaudeWorkspace\style-test\ and opened.
cd /d "%~dp0.."
git fetch -q origin 2>nul
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git pull -q --ff-only 2>nul
for %%F in (content\style-test\*.json) do node scripts\post-images.mjs "%%F"
powershell -NoProfile -ExecutionPolicy Bypass -Command ". '%~dp0tools\lib-drive.ps1'; $d = Find-MyDrive; $srcs = Get-ChildItem 'content\images' -Directory -Filter 'style-test-*' -ErrorAction SilentlyContinue; if ($d -and $srcs) { $to = Join-Path $d 'ClaudeWorkspace\style-test'; New-Item -ItemType Directory -Force -Path $to | Out-Null; foreach ($s in $srcs) { Copy-Item (Join-Path $s.FullName '*.png') $to -Force }; Start-Process explorer.exe $to } elseif ($srcs) { Start-Process explorer.exe (Resolve-Path 'content\images') }"
echo.
pause
