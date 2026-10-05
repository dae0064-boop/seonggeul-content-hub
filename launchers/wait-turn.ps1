# 같은 PC 에서 아침 작업이 두 개 겹쳐 돌지 않게 한다 (2026-10-05 사용자 지시).
# 손으로 더블클릭한 auto-day.cmd 가 아직 도는 중에 작업 스케줄러의 "다시 시도" 시각이 오면,
# 두 실행이 동시에 그림을 만들어 그림 API 1분 5장 제한에 걸리고 그림이 빠진다 (10/3 티스토리에서 실제로 생긴 일).
# 다른 실행이 끝날 때까지 기다렸다가 이어서 한다. 이어서 하는 쪽은 .done 이 없는 글만 다시 한다.
# 순서는 auto-day.cmd 안에서 늘 네이버(draft-day) 전부 → 티스토리(tistory-day) 다.
$pat = 'auto-day\.cmd|draft-day\.ps1|tistory-day\.ps1|reserve-tomorrow|post-images\.mjs|publish-naver\.mjs|publish-tistory\.mjs'
# 나를 부른 auto-day.cmd(부모) 는 빼고 센다
$parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).ParentProcessId
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
