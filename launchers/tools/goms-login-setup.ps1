# GOMS 로그인 + 휴대폰 인증 작업(SeonggeulGomsLogin, goms-login.ps1)을 매일 08:30 에 등록한다 (2026-11-05 사용자 — "곰스는 하루마다 리셋되어 인증번호를 보내야 한다").
#   08:30 에 PC 가 [인증번호받기] 를 누르면 사용자 휴대폰으로 문자가 온다 → 사용자가 아무 Claude 대화에 "GOMS 인증번호 123456" → Claude 가 Drive goms-otp\code.txt → PC 가 넣고 [확인] (최대 6분).
#   이미 로그인돼 있으면 문자를 보내지 않고 끝난다. ensure-retry.ps1 이 -IfMissing 으로 부른다. -Remove 로 끈다. 시각을 바꾸려면 -At 07:50.
param([switch]$Remove, [switch]$IfMissing, [string]$At = '08:30')
$name = 'SeonggeulGomsLogin'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'GOMS 로그인 작업을 껐어요.'; exit 0 }
if ($IfMissing -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { exit 0 }
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'goms-login.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$ps1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글: GOMS 로그인 + 휴대폰 인증 (문자 번호는 사용자가 Claude 에게)' -Force | Out-Null
Write-Host "GOMS 로그인 작업을 등록했어요: 매일 $At"
