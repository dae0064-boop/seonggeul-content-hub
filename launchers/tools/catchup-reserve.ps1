# 예약 안 된 글 다시 예약하기 (2026-10-29 사용자 — "원고가 예약되지 않았더라도 너가 예약되도록 했어야지").
#   아침 실행에서 임시저장만 된 글(Drive run-locks\<날짜>\ 에 .done 이 없는 글)을 그날 안에 다시 예약한다.
#   스레드 올리기(threads-post.ps1, 10·13·16·19·22시)가 끝날 때마다 따로 띄운다 — 다음 날 아침까지 기다리지 않는다.
#   오늘·내일·모레 네이버 원고, 오늘 티스토리 원고를 본다. 아래일 때는 조용히 끝낸다:
#     - 21시 이후 (늦은 글은 draft-day 가 23시 전 빈자리로 옮긴다 — 그보다 늦으면 다음 날 아침 실행이 한다)
#     - 아침 실행·다른 예약 작업이 돌고 있음
#     - 남은 글이 없음
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
$now = Get-Date
$today = $now.ToString('yyyy-MM-dd')
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
# 무엇을 했는지·왜 쉬었는지 매번 남긴다 (2026-10-29 16시 — 조용히 쉬어 원인을 알 수 없었다)
$noteFile = if ($drive) { Join-Path $drive "ClaudeWorkspace\run-logs\catchup-$today.txt" } else { Join-Path $repo "dumps\catchup-$today.txt" }
function Note($msg) { New-Item -ItemType Directory -Force -Path (Split-Path $noteFile) | Out-Null; "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $msg" | Add-Content -Encoding UTF8 $noteFile }
Note "시작 (코드 $(git rev-parse --short HEAD 2>$null))"
if ($now.Hour -lt 5 -or $now.Hour -ge 21) { Note '21시 이후라 쉼'; exit 0 }
# 실제로 글을 만들거나 예약하는 일이 돌 때만 쉰다. 기다리기만 하는 auto-day.cmd·wait-turn 은 세지 않는다
# (16시 첫 실행이 아무것도 남기지 않고 끝났다 — 아침 실행 창이 남아 있던 것으로 본다)
$busy = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'draft-day\.ps1|tistory-day\.ps1|publish-naver\.mjs|publish-tistory\.mjs|post-images\.mjs|catchup-reserve\.ps1' })
if ($busy.Count) { Note ("다른 예약 작업이 돌고 있어 쉼: " + (($busy | ForEach-Object { ($_.CommandLine -replace '\s+', ' ').Substring(0, [Math]::Min(90, ($_.CommandLine -replace '\s+', ' ').Length)) }) -join ' | ')); exit 0 }
if (-not $drive) { Note 'Drive 를 못 찾아 쉼 (.done 을 볼 수 없어 두 번 예약할 수 있다)'; exit 0 }
$pendingFor = {
  param($date, $folder, $prefix)
  $lockDir = Join-Path $drive "ClaudeWorkspace\run-locks\$date"
  @(Get-ChildItem (Join-Path $repo "$folder\$date-*.md") | Where-Object {
    -not (Test-Path (Join-Path $lockDir ("{0}{1}.done" -f $prefix, $_.BaseName)))
  }).Count
}

$did = @()
foreach ($i in 0..2) {
  $d = $now.AddDays($i).ToString('yyyy-MM-dd')
  $n = & $pendingFor $d 'content\posts' ''
  if ($n -gt 0) {
    Note "네이버 $d 남은 글 $n편 → 다시 예약 시작"
    & (Join-Path $PSScriptRoot 'draft-day.ps1') -Reserve -Date $d
    $did += "네이버 $d $n편"
  }
}
$t = & $pendingFor $today 'content\tistory' 'tistory-'
if ($t -gt 0) {
  Note "티스토리 $today 남은 글 $t편 → 다시 예약 시작"
  & (Join-Path $PSScriptRoot 'tistory-day.ps1') -Reserve -RetryDrafts
  $did += "티스토리 $today $t편"
}
if ($did.Count) { Note "다시 예약 시도 끝: $($did -join ' · ') (결과는 run-logs 의 day-<날짜>.log)" } else { Note '남은 글 없음' }
exit 0
