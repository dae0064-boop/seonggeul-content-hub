# 매일 아침 예약발행 작업을 Windows 작업 스케줄러에 등록한다 (한 번만 실행하면 된다).
#   launchers\auto-setup.cmd              등록 (매일 09:00)
#   launchers\auto-setup.cmd -At 09:15    시각 바꾸기 (노트북)
#   launchers\auto-setup.cmd -Remove      끄기
# 작업은 launchers\auto-day.cmd 를 부른다: 최신 원고 받기 → 이미지 → 원고의 publish_at 시각으로 예약발행.
# 원고는 클라우드 Claude 가 전날 21시에 써서 main 에 올린다.
param(
  [string]$At = '09:00',
  # 다시 한 번 도는 시각 (기본: 첫 실행 70분 뒤). 첫 실행에서 저장 못 한 글만 다시 한다 — 이미 한 글은 표시(.done)로 건너뛴다.
  # 사람이 손대지 않아도 되게 (2026-10-02 사용자 목표). 11시 글은 20분 전까지 눌러야 하므로 10:40 을 넘기지 않는다.
  [string]$RetryAt = '',
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$name = 'SeonggeulDailyReserve'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host '아침 자동 예약발행을 껐어요.' -ForegroundColor Green
  exit 0
}

$cmd = Join-Path $PSScriptRoot 'auto-day.cmd'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`"" -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
if (-not $RetryAt) { $RetryAt = ([datetime]::ParseExact($At, 'HH:mm', $null)).AddMinutes(70).ToString('HH:mm') }
$trigger = @((New-ScheduledTaskTrigger -Daily -At $At), (New-ScheduledTaskTrigger -Daily -At $RetryAt))
# 절전 중이면 깨워서 돌리고, 그 시각에 꺼져 있었으면 켜진 뒤 바로 돌린다. 3시간 넘게 걸리면 멈춘다.
# 배터리로 켜져 있어도 돈다 (2026-10-05 — 기본값은 '전원 연결 시에만'이라 노트북 09:15 실행이 뜨지 않았다).
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
# 로그인한 사용자 화면에서 돈다 (네이버에 로그인된 자동화용 크롬을 써야 하므로)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description '성글벙글: 오늘 원고 이미지 생성 + 네이버 예약발행 (원고의 publish_at 시각)' -Force | Out-Null

Write-Host "`n등록했어요. 매일 $At 에 오늘 원고를 예약발행하고, $RetryAt 에 못 한 글만 한 번 더 시도합니다." -ForegroundColor Green
Write-Host '  · 그 시각에 PC 가 켜져 있거나 절전 상태여야 해요 (완전히 꺼져 있으면 켠 뒤에 돌아요).' -ForegroundColor Gray
Write-Host '  · 자동화용 크롬에 네이버 로그인이 유지돼 있어야 해요.' -ForegroundColor Gray
Write-Host '  · 끝나면 결과가 Google Drive run-logs 로 올라가요.' -ForegroundColor Gray
Write-Host '  · 끄려면: launchers\auto-setup.cmd -Remove' -ForegroundColor Gray
