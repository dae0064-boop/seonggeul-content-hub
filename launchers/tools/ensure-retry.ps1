# 작업 스케줄러에 "다시 시도" 시각이 없으면 넣는다 (2026-10-02 이전에 등록한 PC 용).
# auto-day.cmd 가 하루 작업을 마친 뒤 부른다. 사람이 auto-setup 을 다시 돌리지 않아도 되게.
$ErrorActionPreference = 'SilentlyContinue'
$t = Get-ScheduledTask -TaskName 'SeonggeulDailyReserve'
if (-not $t) { exit 0 }
# 2026-10-05: 절전에서 깨우는 타이머가 꺼져 있으면 09:00 에 깨어나지 못한다 — 매번 켜 둔다
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 2>$null | Out-Null
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 2>$null | Out-Null
powercfg /SETACTIVE SCHEME_CURRENT 2>$null | Out-Null
# 2026-10-05: 배터리일 때도 돌게 (예전 등록은 '전원 연결 시에만' 이라 노트북 실행이 뜨지 않았다)
$battery = $t.Settings.DisallowStartIfOnBatteries -or $t.Settings.StopIfGoingOnBatteries
if (@($t.Triggers).Count -ge 2 -and -not $battery) { exit 0 }
$at = ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm')
& (Join-Path $PSScriptRoot 'auto-setup.ps1') -At $at | Out-Null
Write-Host "작업 스케줄러를 다시 등록했어요 (첫 실행 $at, 다시 시도 시각·배터리에서도 실행)."
