# 맛집 글 예약 지킴이(SeonggeulMatjipWatch)를 작업 스케줄러에 등록한다 — 07:00~22:00 3시간마다(07·10·13·16·19·22시), 절전이면 깨워서.
#   2026-11-05 사용자 "맛집 예약 확인 작업은 3시간마다 깨워줘" (그 전 11/4: 15분마다 — PC 가 켜졌다 꺼졌다 했다).
#   catchup-reserve.ps1·ensure-retry.ps1·matjip.cmd 가 -IfMissing 으로 부른다 (사람이 따로 할 일 없음). -Remove 로 끈다.
param([switch]$Remove, [switch]$IfMissing)
$name = 'SeonggeulMatjipWatch'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '맛집 예약 지킴이를 껐어요.'; exit 0 }
$old = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($IfMissing -and $old -and ($old.Triggers[0].Repetition.Interval -eq 'PT3H')) { exit 0 }  # 예전 15분 등록이면 다시 등록한다
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'matjip-watch.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At '07:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '07:00' -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration (New-TimeSpan -Hours 16)).Repetition
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글: 새 맛집 원고를 사진·지도까지 넣어 예약발행 (content\matjip\posts 의 publish_at)' -Force | Out-Null
Write-Host '맛집 예약 지킴이를 등록했어요: 매일 07:00~22:00, 3시간마다'
