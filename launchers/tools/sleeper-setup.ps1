# 절전 담당(SeonggeulSleeper, sleeper.ps1)을 5분마다 등록한다 — PC 를 깨우지 않는다 (2026-11-05). ensure-retry 가 -IfMissing 으로 부른다. -Remove 로 끈다.
#   실제로 재우는 것은 content\away.txt 의 sleep_after_work 기간뿐이다 (그 밖에는 바로 끝난다).
param([switch]$Remove, [switch]$IfMissing)
$name = 'SeonggeulSleeper'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '절전 담당을 껐어요.'; exit 0 }
if ($IfMissing -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { exit 0 }
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'sleeper.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At '00:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '00:00' -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 24)).Repetition
# WakeToRun 없음 — 깨어 있을 때만 돈다
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글 절전 담당: content\away.txt sleep_after_work 기간에 작업이 없으면 바로 절전 (5분마다, 깨우지 않음)' -Force | Out-Null
Write-Host '절전 담당을 등록했어요: 5분마다'
