# 다른 블로그 살펴보기 요청이 있으면 아침 작업 끝에 한 번 돌리고 결과를 Drive 로 올린다.
# 요청 목록: content/research/blog-snapshot.txt (한 줄에 블로그 아이디 하나, # 은 설명).
# Claude 가 목록을 채우고, 결과를 읽은 뒤 목록을 비운다. 사용자는 아무것도 하지 않아도 된다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..')
$list = 'content\research\blog-snapshot.txt'
if (-not (Test-Path $list)) { exit 0 }
$ids = @(Get-Content $list -Encoding UTF8 | ForEach-Object { ($_ -replace '#.*$', '').Trim() } | Where-Object { $_ })
if (-not $ids.Count) { exit 0 }
$date = Get-Date -Format 'yyyy-MM-dd'
$out = "dumps\blog-snapshot\$date"
if (Test-Path (Join-Path $out "$($ids[0])\summary.md")) { exit 0 }  # 오늘 이미 했음
Write-Host "`n[다른 블로그 살펴보기] $($ids -join ', ')" -ForegroundColor Cyan
& node scripts/blog-snapshot.mjs @ids --out $out 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\research\blog-snapshot\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  Write-Host "Drive 로 올렸어요: $dest" -ForegroundColor Green
}
