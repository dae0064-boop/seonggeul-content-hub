# 지킴이 작업(SeonggeulHealth, health.ps1)을 작업 스케줄러에 등록한다 — 07:40·08:40 하루 2번 (2026-11-05 사용자 "매시간은 꼭 필요해?" → 줄임. 처음엔 06:40~22:40 매시간).
#   아침 이슈 글(클라우드가 07:3x 에 넣음)을 09시 전에 예약하는 게 핵심이고, 08:40 에 09시 발행 전 로그인을 확인한다.
#   ensure-retry.ps1(아침 실행 끝·catchup)이 -IfMissing 으로 부른다. -Remove 로 끈다.
param([switch]$Remove, [switch]$IfMissing)
$name = 'SeonggeulHealth'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '지킴이 작업을 껐어요.'; exit 0 }
$old = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($IfMissing -and $old -and @($old.Triggers).Count -eq 2) { exit 0 }  # 예전 매시간 등록이면 다시 등록한다
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'health.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$ps1`"" -WorkingDirectory $repo
$trigger = @('07:40', '08:40' | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 50) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글 지킴이: 크롬·최신 원고·로그인 확인, 아침 이슈 글 늦으면 바로 다시 예약 (07:40·08:40)' -Force | Out-Null
Write-Host '지킴이 작업을 등록했어요: 매일 07:40·08:40'
