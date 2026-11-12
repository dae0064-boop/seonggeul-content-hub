# PC 를 껐다 켠 직후(부팅·로그인 10분 안)에는 작업 스케줄러의 놓친 실행으로 창을 띄우지 않는다.
# 2026-11-12 사용자: "PC 가 항상 절전으로 진행될 거라 컴퓨터를 껐다 켰을 때 뜨는 창들은 모두 제외".
# 절전에서 깨어날 때는 부팅·로그인 시각이 그대로라 평소처럼 돈다. 놓친 글은 다음 시각 실행이 이어서 한다.
# 빠른 시작(Fast Startup)을 켠 PC 는 끄고 켜도 부팅 시각이 안 바뀌어서, 로그인 때 새로 뜨는 explorer 시작 시각도 본다.
function Test-JustBooted([int]$Minutes = 10) {
  try {
    $t = @((Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime)
    $t += @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -ErrorAction SilentlyContinue | ForEach-Object { $_.CreationDate })
    $last = ($t | Where-Object { $_ } | Sort-Object -Descending | Select-Object -First 1)
    return ($last -and ((Get-Date) - $last).TotalMinutes -lt $Minutes)
  } catch { return $false }
}
function Exit-IfJustBooted([string]$What, [int]$Code = 0) {
  if (Test-JustBooted) {
    try {
      . (Join-Path $PSScriptRoot 'lib-drive.ps1'); $d = Find-MyDrive
      if ($d) { $dir = Join-Path $d 'ClaudeWorkspace\run-logs'; "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 켠 직후라 건너뜀: $What" | Add-Content -Encoding UTF8 (Join-Path $dir "boot-skip-$(Get-Date -Format 'yyyy-MM-dd').txt") }
    } catch { }
    exit $Code
  }
}
