# 검색량 조회: content/calendar/keyword-queue.txt 의 키워드 후보를 네이버 검색광고 API 로 조회해 Drive 로 올린다.
# 2026-10-03 사용자 승인 — 키워드를 짐작이 아니라 실제 월간 검색량으로 고르려고. 사용자는 아무것도 하지 않아도 된다.
# .env 의 NAVER_AD_* 키가 있어야 검색량이 나온다 (없으면 자동완성만). 하루 한 번만 돈다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$q = 'content\calendar\keyword-queue.txt'
if (-not (Test-Path $q)) { exit 0 }
$ids = @(Get-Content $q -Encoding UTF8 | ForEach-Object { ($_ -replace '#.*$', '').Trim() } | Where-Object { $_ })
if (-not $ids.Count) { exit 0 }
$date = Get-Date -Format 'yyyy-MM-dd'
$label = "$date-queue"
$base = "dumps\title-keywords-$label"
if (Test-Path "$base.txt") { exit 0 }  # 오늘 이미 했음
Write-Host "`n[키워드 검색량 조회] 후보 $($ids.Count)개" -ForegroundColor Cyan
& node scripts/title-keywords.mjs --file $q --out $label --max 15 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path "$base.txt")) {
  $dest = Join-Path $drive "ClaudeWorkspace\keyword-volume\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item "$base.txt", "$base.json" -Destination $dest -Force
  Write-Host "Drive 로 올렸어요: $dest" -ForegroundColor Green
}
