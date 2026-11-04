# 맛집 글 예약 지킴이(SeonggeulMatjipWatch)를 작업 스케줄러에 등록한다 — 07:00~23:00 15분마다, 절전이면 깨워서 (2026-11-04 사용자 "15분마다 깨워 확인").
#   catchup-reserve.ps1·ensure-retry.ps1·matjip.cmd 가 -IfMissing 으로 부른다 (사람이 따로 할 일 없음). -Remove 로 끈다.
param([switch]$Remove, [switch]$IfMissing)
$name = 'SeonggeulMatjipWatch'
# ⏸ 2026-11-04 사용자: 맛집 자동 예약을 쓰지 않는다 → 부르면 작업을 지운다 (catchup-reserve·ensure-retry·matjip.cmd 가 -IfMissing 으로 부른다)
$Remove = $true
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '맛집 예약 지킴이를 껐어요.'; exit 0 }
if ($IfMissing -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { exit 0 }
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'matjip-watch.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At '07:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '07:00' -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 16)).Repetition
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글: 새 맛집 원고를 사진·지도까지 넣어 예약발행 (content\matjip\posts 의 publish_at)' -Force | Out-Null
Write-Host '맛집 예약 지킴이를 등록했어요: 매일 07:00~23:00, 15분마다'
