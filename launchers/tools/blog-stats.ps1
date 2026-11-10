# 내 블로그 통계를 하루 한 번 읽어 Drive 로 올린다 (읽기만 한다). 2026-10-02 사용자 승인.
# 블로그 아이디: content/research/my-blog.txt 첫 줄 (# 은 설명). Claude 가 Drive 에서 읽고 글감·제목에 반영한다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$f = 'content\research\my-blog.txt'
if (-not (Test-Path $f)) { exit 0 }
$id = @(Get-Content $f -Encoding UTF8 | ForEach-Object { ($_ -replace '#.*$', '').Trim() } | Where-Object { $_ })[0]
if (-not $id) { exit 0 }
$date = Get-Date -Format 'yyyy-MM-dd'
$out = "dumps\blog-stats\$date"
# 오늘 통계를 이미 읽었어도, 누락 검사가 예전 방식(1페이지 밖을 나누지 않음)이면 누락 검사만 다시 한다 (2026-11-09 — 바뀐 검사를 그날 낮 catchup 이 바로 돌리게)
$nurak = Join-Path $out 'nurak.txt'
$statsDone = Test-Path (Join-Path $out 'index.json')
$nurakNew = (Test-Path $nurak) -and ((Get-Content $nurak -Raw -Encoding UTF8) -match '1페이지 밖')
if ($statsDone -and $nurakNew) { exit 0 }  # 오늘 이미 했음
if (-not $statsDone) {
  Write-Host "`n[내 블로그 통계] $id" -ForegroundColor Cyan
  & node scripts/blog-stats.mjs $id --out $out 2>&1 | ForEach-Object { Write-Host $_ }
}
# 검색 누락 검사 (2026-11-03 사용자 승인) — 어제·그제 글이 네이버 블로그 검색에 나오는지. 결과 nurak.txt 가 같은 폴더로 Drive 에 올라간다. 실패해도 넘어간다
& node scripts/nurak-check.mjs $id --out $out 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\blog-stats\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  Write-Host "Drive 로 올렸어요: $dest" -ForegroundColor Green
}
