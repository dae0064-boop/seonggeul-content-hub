# 쿠팡 파트너스 링크를 저절로 만든다 (2026-11-01 사용자 — 티스토리 10편, 쿠팡으로 수익화. 링크 목록이 비어 있었다).
# tistory-day.ps1 -Reserve 가 크롬을 켠 뒤, 티스토리 발행 전에 부른다 → 같은 아침 발행이 그 링크를 바로 쓴다.
# 다른 PC 가 만든 링크는 Drive ClaudeWorkspace\coupang\links.tsv 로 나눠 쓴다. 결과는 Drive 로 올리고 아침 확인이 저장소 목록에 옮긴다.
# brandconnect-links.ps1 (네이버 쇼핑 커넥트) 와 같은 방식이다.
param([int]$Max = 8)   # 시험 실행(coupang-test.cmd)은 2개
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$date = Get-Date -Format 'yyyy-MM-dd'
$out = "dumps\coupang\$date"
$local = 'dumps\coupang-links.local.tsv'
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
$shared = if ($drive) { Join-Path $drive 'ClaudeWorkspace\coupang\links.tsv' } else { $null }
New-Item -ItemType Directory -Force -Path dumps | Out-Null
if ($shared -and (Test-Path $shared)) {
  $have = @(if (Test-Path $local) { Get-Content $local -Encoding UTF8 })
  $add = @(Get-Content $shared -Encoding UTF8 | Where-Object { $_ -and ($have -notcontains $_) })
  if ($add.Count) { [IO.File]::AppendAllLines((Join-Path (Get-Location) $local), [string[]]$add, (New-Object Text.UTF8Encoding $false)) }
}
$before = @(if (Test-Path $local) { Get-Content $local -Encoding UTF8 })
# 하루 8개까지 (2026-11-01 — 티스토리 하루 10편)
# 화면에 나온 글자를 그대로 run-<시각>.log 로 남겨 Drive 에 올린다 (2026-11-01 사용자 "기록 남게 고쳐줘" — 쿠팡 단계가 기록 없이 끝난 적이 있다)
New-Item -ItemType Directory -Force -Path $out | Out-Null
$runLog = Join-Path $out ("run-" + (Get-Date -Format 'HHmmss') + ".log")
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $env:COMPUTERNAME 쿠팡 링크 만들기 시작 (최대 $Max)" | Out-File $runLog -Encoding utf8
"git: $(git log -1 --format='%h %cd' --date=format:'%m-%d %H:%M' 2>&1)" | Out-File $runLog -Append -Encoding utf8
& node scripts/coupang-links.mjs --max $Max --out $out 2>&1 | ForEach-Object { Write-Host $_; "$_" | Out-File $runLog -Append -Encoding utf8 }
$code = $LASTEXITCODE
"종료 코드: $code" | Out-File $runLog -Append -Encoding utf8
if ($code -eq 3) { Write-Host '쿠팡 파트너스 로그인이 풀려 있어 링크를 만들지 못했어요. 오늘 쿠팡 글은 쿠팡 부분이 빠진 보통 글로 나갑니다.' -ForegroundColor Yellow }
$after = @(if (Test-Path $local) { Get-Content $local -Encoding UTF8 })
$new = @($after | Where-Object { $_ -and ($before -notcontains $_) })
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\coupang\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  if ($new.Count) { [IO.File]::AppendAllLines($shared, [string[]]$new, (New-Object Text.UTF8Encoding $false)) }
  Write-Host "쿠팡 파트너스 기록을 Drive 로 올렸어요: $dest" -ForegroundColor Green
}
# 실패해도 티스토리 발행은 그대로 간다
exit 0
