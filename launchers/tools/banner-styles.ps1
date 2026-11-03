# 스레드 심의필 배너 새 시안 3장 — 왼쪽 칸 그림을 GPT(low)로 만들어 넣고 Drive ClaudeWorkspace\banner-styles 로 (2026-11-03 사용자, 약 30원)
$ErrorActionPreference = 'Continue'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
$out = if ($drive) { Join-Path $drive 'ClaudeWorkspace\banner-styles' } else { Join-Path $repo 'dumps\banner-styles' }
New-Item -ItemType Directory -Force -Path $out | Out-Null
Set-Location $repo
$k = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User'); if ($k) { $env:OPENAI_API_KEY = $k }
# 무엇이 안 됐는지 클라우드가 볼 수 있게 화면 내용을 Drive run-logs 에도 남긴다
$log = @("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "코드: $(git rev-parse --short HEAD 2>$null)", "node: $(node --version 2>&1)", '')
$log += @(& node scripts/threads/banner-styles.mjs --art --out "$out" 2>&1 | ForEach-Object { Write-Host "$_"; "$_" })
Write-Host ""
Write-Host "결과 폴더: $out"
$logDir = if ($drive) { Join-Path $drive 'ClaudeWorkspace\run-logs' } else { Join-Path $repo 'dumps' }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log | Set-Content -Encoding UTF8 (Join-Path $logDir "banner-styles-$(Get-Date -Format 'yyyy-MM-dd_HHmm').txt")
