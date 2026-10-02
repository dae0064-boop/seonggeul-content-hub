# 내 블로그 통계를 하루 한 번 읽어 Drive 로 올린다 (읽기만 한다). 2026-10-02 사용자 승인.
# 블로그 아이디: content/research/my-blog.txt 첫 줄 (# 은 설명). Claude 가 Drive 에서 읽고 글감·제목에 반영한다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..')
$f = 'content\research\my-blog.txt'
if (-not (Test-Path $f)) { exit 0 }
$id = @(Get-Content $f -Encoding UTF8 | ForEach-Object { ($_ -replace '#.*$', '').Trim() } | Where-Object { $_ })[0]
if (-not $id) { exit 0 }
$date = Get-Date -Format 'yyyy-MM-dd'
$out = "dumps\blog-stats\$date"
if (Test-Path (Join-Path $out 'index.json')) { exit 0 }  # 오늘 이미 했음
Write-Host "`n[내 블로그 통계] $id" -ForegroundColor Cyan
& node scripts/blog-stats.mjs $id --out $out 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\blog-stats\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  Write-Host "Drive 로 올렸어요: $dest" -ForegroundColor Green
}
