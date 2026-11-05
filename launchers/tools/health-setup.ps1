# 지킴이 작업(SeonggeulHealth, health.ps1)을 작업 스케줄러에 등록한다 — 06:40~22:40 매시간 (2026-11-05).
#   ensure-retry.ps1(아침 실행 끝·catchup)이 -IfMissing 으로 부른다. -Remove 로 끈다.
param([switch]$Remove, [switch]$IfMissing)
$name = 'SeonggeulHealth'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '지킴이 작업을 껐어요.'; exit 0 }
if ($IfMissing -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { exit 0 }
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'health.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$ps1`"" -WorkingDirectory $repo
$trigger = @(6..22 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($_).AddMinutes(40)) })
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 50) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글 지킴이: 크롬·최신 원고·로그인 확인, 아침 이슈 글 늦으면 바로 다시 예약 (매시간 40분)' -Force | Out-Null
Write-Host '지킴이 작업을 등록했어요: 매일 06:40~22:40 매시간'
