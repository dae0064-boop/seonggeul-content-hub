# 작업 스케줄러에 "다시 시도" 시각이 없으면 넣는다 (2026-10-02 이전에 등록한 PC 용).
# auto-day.cmd 가 하루 작업을 마친 뒤 부른다. 사람이 auto-setup 을 다시 돌리지 않아도 되게.
$ErrorActionPreference = 'SilentlyContinue'
# 2026-11-02: 사용량 막대를 PC 를 켤 때마다 띄우는 바로가기 (사용자 "pc 켤 때마다 자동으로")
& (Join-Path $PSScriptRoot 'usage-autostart.ps1') | Out-Null
$t = Get-ScheduledTask -TaskName 'SeonggeulDailyReserve'
if (-not $t) { exit 0 }
# 2026-10-05: 절전에서 깨우는 타이머가 꺼져 있으면 09:00 에 깨어나지 못한다 — 매번 켜 둔다
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 2>$null | Out-Null
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 2>$null | Out-Null
powercfg /SETACTIVE SCHEME_CURRENT 2>$null | Out-Null
# 2026-10-05: 배터리일 때도 돌게 (예전 등록은 '전원 연결 시에만' 이라 노트북 실행이 뜨지 않았다)
$battery = $t.Settings.DisallowStartIfOnBatteries -or $t.Settings.StopIfGoingOnBatteries
# 2026-11-02: 아침 이슈 모으기(06:50) 작업이 없으면 등록한다 — 사용자 "오전 7~8시 기사로 이슈 글"
# 2026-11-02 저녁: 이슈 글을 출근길(08:20~)에 내려고 06:50 으로 당김 — 예전 07:50 으로 등록돼 있으면 다시 등록한다
$scanTask = Get-ScheduledTask -TaskName 'SeonggeulIssueScan'
if ($scanTask -and ([datetime]$scanTask.Triggers[0].StartBoundary).ToString('HH:mm') -ne '06:50') { Unregister-ScheduledTask -TaskName 'SeonggeulIssueScan' -Confirm:$false; $scanTask = $null }
if (-not $scanTask) {
  $scanAt = '06:50'
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$(Join-Path $PSScriptRoot 'issue-scan.ps1')`""
  $set = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'SeonggeulIssueScan' -Action $act -Trigger (New-ScheduledTaskTrigger -Daily -At $scanAt) -Settings $set -Principal $t.Principal `
    -Description '성글벙글 아침 이슈 모으기 (구글 트렌드·네이버 랭킹 → Drive issues)' -Force | Out-Null
  Write-Host "아침 이슈 모으기 작업을 등록했어요 (매일 $scanAt)."
}
# 2026-11-02: 스레드 블로그 유입 글 작업(매시간 10~23시)
& (Join-Path $PSScriptRoot 'threads-blog-setup.ps1') -IfMissing | Out-Null
# 2026-10-05: 켜거나 잠금을 풀면 바로 시작하는 작업(SeonggeulMorningStart)이 없으면 다시 등록한다
$wake = Get-ScheduledTask -TaskName 'SeonggeulMorningStart'
if (@($t.Triggers).Count -ge 2 -and -not $battery -and $wake) { exit 0 }
$at = ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm')
& (Join-Path $PSScriptRoot 'auto-setup.ps1') -At $at | Out-Null
Write-Host "작업 스케줄러를 다시 등록했어요 (첫 실행 $at, 다시 시도 시각·배터리에서도 실행·켜면 바로 시작)."
