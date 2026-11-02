# 스레드 블로그 유입 글 작업(SeonggeulThreadsBlog)을 작업 스케줄러에 등록한다.
#   2026-11-02 사용자 고정: 출근길 07:30·08:30, 퇴근 뒤 20:00·21:00·22:30 (+ 놓친 글 다시 09:15·23:15). 무엇을 올릴지는 묶음의 '시각:'.
#   catchup-reserve.ps1·ensure-retry.ps1 이 -IfMissing 으로 부른다 (사람이 따로 할 일 없음). -Remove 로 끈다.
param([switch]$Remove, [switch]$IfMissing)
$name = 'SeonggeulThreadsBlog'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '스레드 블로그 유입 글 작업을 껐어요.'; exit 0 }
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ps1 = Join-Path $PSScriptRoot 'threads-blog.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$ps1`"" -WorkingDirectory $repo
# 노트북(아침 실행이 09:15 인 PC)은 3분 뒤 — 먼저 올린 PC 가 있으면 스레드를 되읽어 보고 쉰다
$offset = 0
$day = Get-ScheduledTask -TaskName 'SeonggeulDailyReserve' -ErrorAction SilentlyContinue
if ($day -and $day.Triggers.Count) { try { if (([datetime]$day.Triggers[0].StartBoundary).Minute -ne 0) { $offset = 3 } } catch {} }
$times = @('07:30', '08:30', '09:15', '20:00', '21:00', '22:30', '23:15') | ForEach-Object { ([datetime]::ParseExact($_, 'HH:mm', $null)).AddMinutes($offset) }
$want = ($times | ForEach-Object { $_.ToString('HH:mm') }) -join ','
$old = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
$have = @($old.Triggers | ForEach-Object { try { ([datetime]$_.StartBoundary).ToString('HH:mm') } catch { '' } }) -join ','
if ($IfMissing -and $old -and $have -eq $want) { exit 0 }  # 시각이 다르면(예전 매시간 등록) 다시 등록한다
$trigger = @($times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글: 스레드 블로그 유입 글 한 편 (content\threads\blog\<날짜>.md 의 시각대로)' -Force | Out-Null
Write-Host "스레드 블로그 유입 글 작업을 등록했어요: 매일 $($want -replace ',', ' · ')"
