# 집을 비우기 전에 한 번 (2026-11-05 사용자 "3일간 집에 없는데 집에 없어도 작업 가능하도록").
#   ① 작업 스케줄러 작업이 모두 있는지 확인·등록 (지킴이 SeonggeulHealth 포함)
#   ② 윈도우 업데이트를 7일 멈춘다 — 업데이트로 재부팅되면 로그인 화면에서 모든 작업이 멈춘다 (관리자 확인 창에서 '예')
#   ③ 자동화용 크롬에서 네이버·티스토리 로그인을 확인하고, 풀린 곳만 로그인 탭을 열어 둔다
#   결과는 Drive run-logs\away-check-<시각>.txt 로 → Claude 가 읽는다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
$lines = @("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", '')
function Say($s, $c = 'Gray') { Write-Host $s -ForegroundColor $c; $script:lines += $s }

Say '1/3 자동 작업 등록 확인 중...' 'Cyan'
& (Join-Path $PSScriptRoot 'ensure-retry.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'health-setup.ps1') -IfMissing | Out-Null
foreach ($n in 'SeonggeulDailyReserve', 'SeonggeulMorningStart', 'SeonggeulIssueScan', 'SeonggeulThreadsBlog', 'SeonggeulThreadsPost', 'SeonggeulHealth') {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  Say ("   {0} {1}" -f $(if ($t) { '✅' } else { '❌ 없음' }), $n) $(if ($t) { 'Gray' } else { 'Yellow' })
}

Say '2/3 윈도우 업데이트 7일 멈추기 — 화면에 "이 앱이 디바이스를 변경하도록 허용하시겠어요?" 창이 뜨면 [예] 를 눌러 주세요.' 'Cyan'
$until = (Get-Date).ToUniversalTime().AddDays(7).ToString('yyyy-MM-ddTHH:mm:ssZ')
$start = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$cmd = "`$k='HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'; New-Item -Force `$k | Out-Null; " +
  "foreach (`$n in 'PauseUpdatesExpiryTime','PauseFeatureUpdatesEndTime','PauseQualityUpdatesEndTime') { Set-ItemProperty `$k `$n '$until' }; " +
  "foreach (`$n in 'PauseUpdatesStartTime','PauseFeatureUpdatesStartTime','PauseQualityUpdatesStartTime') { Set-ItemProperty `$k `$n '$start' }"
try {
  Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', $cmd
  $got = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' -ErrorAction SilentlyContinue).PauseUpdatesExpiryTime
  if ($got -eq $until) { Say "   ✅ 윈도우 업데이트 멈춤: $((Get-Date).AddDays(7).ToString('M월 d일 HH:mm')) 까지" 'Green' } else { Say '   ⚠ 업데이트 멈춤을 확인하지 못했어요 (설정 → Windows 업데이트 → "1주 일시 중지" 를 눌러도 같아요)' 'Yellow' }
} catch { Say '   ⚠ [예] 를 누르지 않아 업데이트를 멈추지 못했어요 (설정 → Windows 업데이트 → "1주 일시 중지" 로도 돼요)' 'Yellow' }

Say '3/3 네이버·티스토리 로그인 확인 중 (1분쯤)...' 'Cyan'
& (Join-Path $PSScriptRoot 'login-test.ps1') -OpenLogin
$lr = Get-ChildItem (Join-Path $repo 'dumps') -Directory -Filter 'login-test-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($lr) { $lines += ''; $lines += (Get-Content (Join-Path $lr.FullName 'result.txt') -Encoding UTF8) }

if ($drive) {
  $d = Join-Path $drive 'ClaudeWorkspace\run-logs'
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  $lines | Set-Content -Encoding UTF8 (Join-Path $d "away-check-$(Get-Date -Format 'yyyy-MM-dd_HHmm')-$env:COMPUTERNAME.txt")
}
Write-Host ''
Write-Host '로그인 탭이 새로 열렸다면: 그 탭에서 로그인할 때 "로그인 상태 유지"를 꼭 켜고,' -ForegroundColor Yellow
Write-Host '크롬이 "비밀번호를 저장할까요?" 하고 물으면 [저장] 을 눌러 주세요. 크롬 창은 닫지 말고 두세요.' -ForegroundColor Yellow
Write-Host '그다음 이 창을 닫고 away-check.cmd 를 한 번 더 더블클릭해 "모두 로그인돼 있어요" 가 나오면 끝이에요.' -ForegroundColor Yellow
