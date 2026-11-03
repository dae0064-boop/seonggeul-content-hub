# 스레드 심의필 배너 새 시안 3장 — 왼쪽 칸 그림을 GPT(low)로 만들어 넣고 Drive ClaudeWorkspace\banner-styles 로 (2026-11-03 사용자, 약 30원)
$ErrorActionPreference = 'Continue'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
$out = if ($drive) { Join-Path $drive 'ClaudeWorkspace\banner-styles' } else { Join-Path $repo 'dumps\banner-styles' }
New-Item -ItemType Directory -Force -Path $out | Out-Null
Set-Location $repo
node scripts/threads/banner-styles.mjs --art --out "$out"
Write-Host ""
Write-Host "결과 폴더: $out"
