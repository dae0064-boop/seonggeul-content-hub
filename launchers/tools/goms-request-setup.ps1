# '심의 올려줘' 요청 지킴이(SeonggeulGomsRequest)를 작업 스케줄러에 등록한다 — 07:00~23:00 10분마다 goms-request.ps1 (2026-11-11 사용자).
#   PC 를 깨우지 않는다(사용자 — 자꾸 켜졌다 꺼지는 걸 싫어함). 절전 중이면 다음에 깰 때(다른 작업 시각) 놓친 실행을 바로 한다.
#   요청 파일이 없으면 몇 초 만에 끝난다. ensure-retry.ps1·catchup-reserve.ps1 이 -IfMissing 으로 부른다. -Remove 로 끈다.
#   같이: 예전 매일 08:30 GOMS 자동 로그인(SeonggeulGomsLogin)을 지운다 — 요청할 때만 로그인한다.
param([switch]$Remove, [switch]$IfMissing)
$name = 'SeonggeulGomsRequest'
Unregister-ScheduledTask -TaskName 'SeonggeulGomsLogin' -Confirm:$false -ErrorAction SilentlyContinue
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '심의 요청 지킴이를 껐어요.'; exit 0 }
if ($IfMissing -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { exit 0 }
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'goms-request.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At '07:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '07:00' -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Hours 16)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 60) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글: 사용자가 요청하면 GOMS 광고심의 등록 (Drive goms-request.txt)' -Force | Out-Null
Write-Host '심의 요청 지킴이를 등록했어요: 매일 07:00~23:00, 10분마다 (PC 를 깨우지는 않음)'
