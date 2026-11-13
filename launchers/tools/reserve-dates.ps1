# 날짜 지정 예약 — 2026-11-14 사용자 "20일까지 원고 모두 만들어서 예약발행 진행해줘".
#   클라우드가 Drive ClaudeWorkspace\reserve-request.txt (첫 줄 = 날짜들, 쉼표) 를 남기면 2분 지킴이(goms-request.ps1)가 띄운다.
#   최신 원고를 받고, 날짜마다 네이버(draft-day -Reserve) → 티스토리(tistory-day -Reserve -RetryDrafts) → 철거(chulgeo-day) 순서로 예약한다.
#   이미 예약된 글(.done)은 건너뛴다. 도는 동안 절전을 막는다. 기록은 Drive run-logs\reserve-dates-*. 크롬은 끄지 않는다.
param([string]$Dates = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>$null
git checkout -q main 2>$null
git pull -q --ff-only 2>$null
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
. (Join-Path $PSScriptRoot 'lib-detach.ps1')
$drive = Find-MyDrive
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\reserve-dates-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$logf = Join-Path $out 'reserve.log'
function Say($s) { $l = "$(Get-Date -Format 'HH:mm:ss') $s"; Write-Host $l; Add-Content -Path $logf -Value $l -Encoding UTF8 }
function Share { if ($drive) { $dest = Join-Path $drive "ClaudeWorkspace\run-logs\reserve-dates-$stamp-$env:COMPUTERNAME"; New-Item -ItemType Directory -Force -Path $dest | Out-Null; Copy-Item (Join-Path $out '*') $dest -Force } }
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) { Start-AutoChrome -Repo $repo; for ($i = 0; $i -lt 25 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 } }
Add-Type -Namespace SgResv -Name Awake -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[SgResv.Awake]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null
# 아침 실행·다시 예약과 같은 크롬을 동시에 쓰지 않게 — 10:30 전이면 기다리고, 다른 발행 작업이 돌면 끝날 때까지 기다린다 (2026-11-14)
function Wait-Quiet {
  for ($k = 0; $k -lt 240; $k++) {
    $busy = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'auto-day\.cmd|catchup-reserve\.ps1|draft-day\.ps1|tistory-day\.ps1|chulgeo-day\.ps1|blog-stats|sc-request|matjip-draft' })
    $early = (Get-Date).TimeOfDay -lt [TimeSpan]'10:30:00' -and (Get-Date).TimeOfDay -gt [TimeSpan]'06:00:00'
    if (-not $busy.Count -and -not $early) { return }
    if ($k % 10 -eq 0) { Say "다른 작업이 돌거나 아침 시간이라 기다려요 ($($busy.Count)개)" }
    Start-Sleep -Seconds 60
  }
}
$list = @($Dates -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}$' } | Sort-Object -Unique)
Say "날짜 지정 예약 시작 — $($list -join ', ') (코드 $(git rev-parse --short HEAD 2>$null))"
Share
foreach ($d in $list) {
  Wait-Quiet
  Say "$d 네이버"
  & (Join-Path $PSScriptRoot 'draft-day.ps1') -Reserve -Date $d 2>&1 | Select-Object -Last 8 | ForEach-Object { Say "  $_" }
  Say "$d 티스토리"
  & (Join-Path $PSScriptRoot 'tistory-day.ps1') -Reserve -RetryDrafts -Date $d 2>&1 | Select-Object -Last 5 | ForEach-Object { Say "  $_" }
  Say "$d 철거"
  & (Join-Path $PSScriptRoot 'chulgeo-day.ps1') -Date $d 2>&1 | Select-Object -Last 5 | ForEach-Object { Say "  $_" }
  if ($drive) {
    $lk = Join-Path $drive "ClaudeWorkspace\run-locks\$d"
    $nN = @(Get-ChildItem (Join-Path $repo "content\posts\$d-*.md")).Count; $nD = @(Get-ChildItem (Join-Path $repo "content\posts\$d-*.md") | Where-Object { Test-Path (Join-Path $lk "$($_.BaseName).done") }).Count
    $tN = @(Get-ChildItem (Join-Path $repo "content\tistory\$d-*.md") -ErrorAction SilentlyContinue).Count; $tD = @(Get-ChildItem (Join-Path $repo "content\tistory\$d-*.md") -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $lk "tistory-$($_.BaseName).done") }).Count
    Say "$d 결과: 네이버 $nD/$nN · 티스토리 $tD/$tN (철거는 run-logs 의 chulgeo 기록)"
  }
  Share
}
Say '끝 — 남은 글은 그날 아침 실행·catchup 이 다시 해요'
Share
