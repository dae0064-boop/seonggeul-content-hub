# 같은 PC 에서 아침 작업이 두 개 겹쳐 돌지 않게 한다 (2026-10-05 사용자 지시).
# 손으로 더블클릭한 auto-day.cmd 가 아직 도는 중에 작업 스케줄러의 "다시 시도" 시각이 오면,
# 두 실행이 동시에 그림을 만들어 그림 API 1분 5장 제한에 걸리고 그림이 빠진다 (10/3 티스토리에서 실제로 생긴 일).
# 다른 실행이 끝날 때까지 기다렸다가 이어서 한다. 이어서 하는 쪽은 .done 이 없는 글만 다시 한다.
# 순서는 auto-day.cmd 안에서 늘 네이버(draft-day) 전부 → 티스토리(tistory-day) 다.
$pat = 'auto-day\.cmd|draft-day\.ps1|tistory-day\.ps1|reserve-tomorrow|post-images\.mjs|publish-naver\.mjs|publish-tistory\.mjs'
# 나를 부른 auto-day.cmd(부모) 는 빼고 센다
$parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).ParentProcessId
# 2026-11-12 사용자 "껐다 켰을 때 뜨는 창 모두 제외": 작업 스케줄러가 켠 직후 놓친 아침 실행을 띄운 것이면 끝낸다(손으로 더블클릭한 것은 그대로 돈다)
$gp = (Get-CimInstance Win32_Process -Filter "ProcessId=$parent" -ErrorAction SilentlyContinue).ParentProcessId
$gpName = (Get-CimInstance Win32_Process -Filter "ProcessId=$gp" -ErrorAction SilentlyContinue).Name
# 2026-11-25 사용자 "하루에 한 번만 진행하고 그 이후 컴터를 켰을 때는 진행되지 않도록": 작업 스케줄러가 띄운 아침 실행은 하루 한 번만.
#   그날 처음 뜬 것(09:00 이든, 꺼져 있다 켠 뒤의 놓친 실행이든)만 돌고, 10:10 다시 시도·다시 켠 뒤의 놓친 실행은 조용히 끝낸다.
#   남은 글은 스레드 작업 끝의 catchup-reserve(13·16·19·22시)가 잡는다. 손으로 더블클릭한 것은 그대로 돈다.
if ($gpName -ne 'explorer.exe') {
  $ranStamp = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) ("dumps\auto-day-ran-{0}.txt" -f (Get-Date -Format 'yyyy-MM-dd'))
  if (Test-Path $ranStamp) {
    try { . (Join-Path $PSScriptRoot 'lib-drive.ps1'); $d = Find-MyDrive; if ($d) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 오늘 이미 한 번 돌아 건너뜀: 아침 실행(auto-day)" | Add-Content -Encoding UTF8 (Join-Path $d "ClaudeWorkspace\run-logs\boot-skip-$(Get-Date -Format 'yyyy-MM-dd').txt") } } catch { }
    exit 1
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $ranStamp) | Out-Null
  "$(Get-Date -Format 's') 시작" | Out-File $ranStamp -Encoding utf8
}
function Busy {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.ProcessId -ne $parent -and $_.CommandLine -and $_.CommandLine -match $pat }
}
$limit = (Get-Date).AddMinutes(150)
$said = $false
while (Busy) {
  if (-not $said) { Write-Host '이 PC 에서 다른 발행 작업이 아직 돌고 있어요. 끝날 때까지 기다렸다가 이어서 합니다.' -ForegroundColor Yellow; $said = $true }
  if ((Get-Date) -gt $limit) { Write-Host '2시간 30분을 기다려도 끝나지 않아 이번 실행은 쉽니다.' -ForegroundColor Yellow; exit 1 }
  Start-Sleep -Seconds 60
}
if ($said) { Write-Host '앞 작업이 끝났어요. 남은 글만 이어서 합니다.' -ForegroundColor Green }
exit 0
