# 스레드 보험글 자동 올리기를 Windows 작업 스케줄러에 등록한다 (2026-10-26 사용자: 하루 4편, 사무실 PC·노트북 둘 다).
#   매일 08:30 · 12:30 · 18:30 · 21:30 에 threads-post.ps1 을 부른다. 노트북(아침 실행이 09:15 인 PC)은 5분 뒤에 —
#   먼저 올린 PC 가 있으면 늦게 온 PC 는 스레드를 되읽어 보고 쉰다.
#   launchers\threads-setup.cmd            등록 (아침 auto-day 도 -IfMissing 으로 부른다 — 사람이 따로 할 일 없음)
#   launchers\threads-setup.cmd -Remove    끄기
param([switch]$Remove, [switch]$IfMissing, [int]$Offset = -1)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$name = 'SeonggeulThreadsPost'
if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host '스레드 자동 올리기를 껐어요.' -ForegroundColor Green
  exit 0
}
if ($IfMissing -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { exit 0 }
if ($Offset -lt 0) {
  # 아침 실행이 09:15 로 등록된 PC = 노트북 → 5분 뒤
  $Offset = 0
  $day = Get-ScheduledTask -TaskName 'SeonggeulDailyReserve' -ErrorAction SilentlyContinue
  if ($day -and $day.Triggers.Count) { try { if (([datetime]$day.Triggers[0].StartBoundary).Minute -ne 0) { $Offset = 5 } } catch {} }
}
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'threads-post.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$ps1`"" -WorkingDirectory $repo
$times = @('08:30', '12:30', '18:30', '21:30') | ForEach-Object { ([datetime]::ParseExact($_, 'HH:mm', $null)).AddMinutes($Offset) }
$trigger = @($times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })
# 절전이면 깨워서 올린다. 놓친 시각은 켜진 뒤 한 번만 (같은 날 4편 상한·40분 간격은 스크립트가 지킨다).
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글: 스레드 보험 심의글 한 편 올리기 (심의 적격 편, 1편부터 차례로)' -Force | Out-Null
Write-Host "스레드 자동 올리기를 등록했어요: 매일 $(($times | ForEach-Object { $_.ToString('HH:mm') }) -join ' · ')" -ForegroundColor Green
