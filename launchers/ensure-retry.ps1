# 작업 스케줄러에 "다시 시도" 시각이 없으면 넣는다 (2026-10-02 이전에 등록한 PC 용).
# auto-day.cmd 가 하루 작업을 마친 뒤 부른다. 사람이 auto-setup 을 다시 돌리지 않아도 되게.
$ErrorActionPreference = 'SilentlyContinue'
$t = Get-ScheduledTask -TaskName 'SeonggeulDailyReserve'
if (-not $t) { exit 0 }
if (@($t.Triggers).Count -ge 2) { exit 0 }
$at = ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm')
& (Join-Path $PSScriptRoot 'auto-setup.ps1') -At $at | Out-Null
Write-Host "작업 스케줄러에 다시 시도 시각을 더했어요 (첫 실행 $at)."
