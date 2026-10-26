# 네이버 쇼핑 커넥트 링크를 저절로 만든다 (2026-10-26 사용자 — "링크를 너가 직접 만들어, 나에게 만들라고 하지 말아줘").
# draft-day.ps1 -Reserve 가 크롬을 켠 뒤, 발행 전에 부른다 → 같은 아침 발행이 그 링크를 바로 쓴다.
# 다른 PC 가 만든 링크는 Drive ClaudeWorkspace\brandconnect\links.tsv 로 나눠 쓴다. 결과는 Drive 로 올리고 아침 확인이 저장소 목록에 옮긴다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$date = Get-Date -Format 'yyyy-MM-dd'
$out = "dumps\brandconnect\$date"
$local = 'dumps\brandconnect-links.local.tsv'
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
$shared = if ($drive) { Join-Path $drive 'ClaudeWorkspace\brandconnect\links.tsv' } else { $null }
New-Item -ItemType Directory -Force -Path dumps | Out-Null
if ($shared -and (Test-Path $shared)) {
  $have = @(if (Test-Path $local) { Get-Content $local -Encoding UTF8 })
  $add = @(Get-Content $shared -Encoding UTF8 | Where-Object { $_ -and ($have -notcontains $_) })
  if ($add.Count) { [IO.File]::AppendAllLines((Join-Path (Get-Location) $local), [string[]]$add, (New-Object Text.UTF8Encoding $false)) }
}
$before = @(if (Test-Path $local) { Get-Content $local -Encoding UTF8 })
& node scripts/brandconnect-links.mjs --out $out 2>&1 | ForEach-Object { Write-Host $_ }
$after = @(if (Test-Path $local) { Get-Content $local -Encoding UTF8 })
$new = @($after | Where-Object { $_ -and ($before -notcontains $_) })
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\brandconnect\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  if ($new.Count) { [IO.File]::AppendAllLines($shared, [string[]]$new, (New-Object Text.UTF8Encoding $false)) }
  Write-Host "쇼핑 커넥트 기록을 Drive 로 올렸어요: $dest" -ForegroundColor Green
}
exit 0
