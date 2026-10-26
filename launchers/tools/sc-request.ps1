# 구글 서치 콘솔 '색인 생성 요청' — 색인 안 된 티스토리 글을 하루 10편씩 (2026-10-26 사용자 "90편 색인 생성 요청해줘").
# auto-day.cmd 와 index-request.cmd 가 부른다. 요청한 주소는 Drive ClaudeWorkspace\index-requests\requested.tsv 에 남겨 두 PC 가 나눠 쓴다.
# 하루 한 번만 (같은 날 두 번째는 건너뜀). 다 요청하면 저절로 할 일이 없어진다.
param([switch]$Force)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬을 켜는 중...'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
$date = Get-Date -Format 'yyyy-MM-dd'
$state = if ($drive) { Join-Path $drive 'ClaudeWorkspace\index-requests\requested.tsv' } else { 'dumps\sc-requested.tsv' }
$dayMark = if ($drive) { Join-Path $drive "ClaudeWorkspace\index-requests\$date\sc-request.json" } else { "dumps\sc-request\$date\sc-request.json" }
# 오늘 요청이 들어갔거나(할당량까지) 남은 글이 없으면 건너뛴다. 로그인 풀림·오류로 멈춘 날은 다음 실행이 다시 한다.
if ((Test-Path $dayMark) -and -not $Force) {
  try { $j = Get-Content $dayMark -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $j = $null }
  if ($j -and ($j.requested.Count -gt 0 -or $j.stop -eq 'quota' -or $j.left -eq 0)) { Write-Host '[색인 생성 요청] 오늘은 이미 했어요.'; exit 0 }
}
# 기록은 Drive 에 바로 쓴다 — 글 하나마다 갱신되어, 도중에 창을 닫아도 Claude 가 어디까지 됐는지 본다 (2026-10-26)
$out = if ($drive) { Join-Path $drive "ClaudeWorkspace\index-requests\$date" } else { "dumps\sc-request\$date" }
Write-Host "`n[색인 생성 요청] 구글 서치 콘솔 — 하루 10편까지 (1편에 1~2분)" -ForegroundColor Cyan
& node scripts/sc-request-index.mjs --state $state --out $out --max 10 2>&1 | ForEach-Object { Write-Host $_ }
Write-Host "기록: $out" -ForegroundColor Green
