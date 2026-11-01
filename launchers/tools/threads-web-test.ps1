# 스레드 웹 '예약' 화면 살펴보기 (글을 올리지 않음) — 2026-11-01 사용자: 스레드는 아침 10시에 하루 글을 앱 예약으로.
# scripts/threads/web-probe.mjs 를 돌리고 화면 기록을 Drive ClaudeWorkspace\threads-web\<날짜> 로 올린다 → Claude 가 보고 예약 스크립트를 만든다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$date = Get-Date -Format 'yyyy-MM-dd'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = "dumps\threads-web\$stamp"
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
& node scripts/threads/web-probe.mjs --out $out 2>&1 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
if ($code -eq 3) { Write-Host '스레드 로그인이 안 돼 있어요. 크롬 탭에서 로그인한 뒤 이 실행기를 다시 더블클릭해 주세요.' -ForegroundColor Yellow }
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\threads-web\$stamp"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  Write-Host "화면 기록을 Drive 로 올렸어요: $dest" -ForegroundColor Green
} else { Write-Host 'Google Drive 를 찾지 못해 기록을 올리지 못했어요. 이 창을 캡처해서 보여 주세요.' -ForegroundColor Yellow }
exit 0
