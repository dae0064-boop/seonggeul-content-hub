# 티스토리 상태(방문 통계·유입·애드센스 연동·구글 색인)를 하루 한 번 읽어 Drive 로 올린다 (읽기만 한다).
# 2026-10-14 사용자 요청 — 티스토리 조회수가 안 나오는 이유와 애드센스 등록 여부 확인.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$blog = $env:TISTORY_BLOG
if (-not $blog) { $blog = [Environment]::GetEnvironmentVariable('TISTORY_BLOG', 'User') }
if (-not $blog) { $blog = 'seongdaeeyo' }
$date = Get-Date -Format 'yyyy-MM-dd'
$out = "dumps\tistory-stats\$date"
if (Test-Path (Join-Path $out 'index.json')) { exit 0 }  # 오늘 이미 했음
Write-Host "`n[티스토리 상태] $blog.tistory.com" -ForegroundColor Cyan
& node scripts/tistory-stats.mjs $blog --out $out 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\tistory-stats\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  Write-Host "Drive 로 올렸어요: $dest" -ForegroundColor Green
}
