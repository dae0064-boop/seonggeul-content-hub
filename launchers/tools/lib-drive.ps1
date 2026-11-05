# Google Drive 의 "내 드라이브" 위치를 찾는다. share-run.ps1 과 draft-day.ps1 이 같이 쓴다.
function Find-MyDrive {
  if ($env:CLAUDE_DRIVE_ROOT -and (Test-Path $env:CLAUDE_DRIVE_ROOT)) { return $env:CLAUDE_DRIVE_ROOT }
  $names = @('내 드라이브', 'My Drive')
  $bases = @([char[]]'GHIJKLMNOPQRSTUVWXYZDEF' | ForEach-Object { "$($_):\" }) + @($env:USERPROFILE, (Join-Path $env:USERPROFILE 'Google Drive'))
  foreach ($b in $bases) {
    foreach ($n in $names) {
      $p = Join-Path $b $n
      if (Test-Path (Join-Path $p 'ClaudeWorkspace')) { return $p }
    }
  }
  return $null
}

# 2026-10-06: 노트북을 06:16 에 켜자마자 실행이 시작돼 Google Drive 가 아직 뜨기 전이었다 — 네이버 처리 표시(.done)가
# 이 PC 안에만 남아 다른 PC 가 볼 수 없었다. 켜진 직후엔 Drive 가 뜰 때까지 기다린다 (기본 최대 5분).
function Wait-MyDrive([int]$Seconds = 300) {
  $d = Find-MyDrive
  if ($d) { return $d }
  Write-Host 'Google Drive 가 켜지기를 기다리는 중 (최대 5분, 창이 멈춘 게 아니에요)...' -ForegroundColor Cyan
  $until = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $until) {
    Start-Sleep 10
    $d = Find-MyDrive
    if ($d) { return $d }
  }
  return $null
}

# Drive 없이 이 PC 안(dumps\run-locks)에만 남긴 처리 표시를 Drive 로 옮긴다 — 다른 PC 가 같은 글을 다시 올리지 않게.
# 반대로 Drive 를 찾았을 때도 이 PC 안의 표시를 먼저 옮겨 두면, 같은 PC 의 다시 시도가 그 글을 건너뛴다.
function Sync-LocalLocks([string]$Date) {
  $local = Join-Path (Get-Location) "dumps\run-locks\$Date"
  if (-not (Test-Path $local)) { return 0 }
  $d = Find-MyDrive
  if (-not $d) { return 0 }
  $remote = Join-Path $d "ClaudeWorkspace\run-locks\$Date"
  New-Item -ItemType Directory -Force -Path $remote | Out-Null
  $n = 0
  foreach ($f in Get-ChildItem $local -Filter '*.done' -ErrorAction SilentlyContinue) {
    $to = Join-Path $remote $f.Name
    if (-not (Test-Path $to)) { Copy-Item $f.FullName $to; $n++ }
  }
  return $n
}

# 집 비움 모드 (2026-11-05 사용자 — "절전이 켜졌다 꺼졌다 한다", 원격으로 들어가야 하는데 절전이면 못 들어간다).
#   저장소 content\away.txt 의 'until: YYYY-MM-DD' 날까지(그날 포함) 아침 작업 뒤 자동 절전을 하지 않고, 지킴이(health.ps1)가 윈도우 절전을 '안 함'으로 둔다.
#   날이 지나면 지킴이가 원래 절전 시간으로 되돌린다. 클라우드 Claude 가 이 파일만 고치면 PC 가 따른다.
function Get-AwayUntil {
  $f = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'content\away.txt'
  if (-not (Test-Path $f)) { return $null }
  $m = Select-String -Path $f -Pattern '^\s*until:\s*(\d{4}-\d{2}-\d{2})' | Select-Object -First 1
  if (-not $m) { return $null }
  $d = [datetime]::ParseExact($m.Matches[0].Groups[1].Value, 'yyyy-MM-dd', $null)
  if ((Get-Date).Date -le $d) { return $d } else { return $null }
}

# 작업 뒤 바로 절전 (2026-11-05 사용자 — "11/6~일요일: 작업할 때는 켜고, 안 하면 바로 절전. 집에 없어서 바로 절전해도 상관없어").
#   content\away.txt 의 'sleep_after_work: 시작일 끝일' 사이(양끝 포함)면 $true. 절전 담당(sleeper.ps1, 5분마다)이 본다.
function Test-SleepAfterWork {
  $f = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'content\away.txt'
  if (-not (Test-Path $f)) { return $false }
  $m = Select-String -Path $f -Pattern '^\s*sleep_after_work:\s*(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})' | Select-Object -First 1
  if (-not $m) { return $false }
  $a = [datetime]::ParseExact($m.Matches[0].Groups[1].Value, 'yyyy-MM-dd', $null)
  $b = [datetime]::ParseExact($m.Matches[0].Groups[2].Value, 'yyyy-MM-dd', $null)
  $t = (Get-Date).Date
  return ($t -ge $a -and $t -le $b)
}

# 잠시 깨어 있기 요청 (2026-11-05 사용자 — "절전 중에 원격이 안 되면 Claude 앱으로 잠시 절전 풀어 달라고 하면 되잖아").
#   사용자가 아무 Claude 대화에 "PC 깨워 줘 / 절전 풀어 줘" → Claude 가 Drive ClaudeWorkspace\stay-awake.txt 에 'until: YYYY-MM-DD HH:mm' (기본 지금 + 2시간).
#   절전 중인 PC 는 바깥 신호를 못 받으므로 다음에 깨어날 때(지킴이 07:40·08:40, 그 밖의 작업 시각) 읽는다 → 그 시각까지 잠들지 않게 붙잡는 창 없는 프로그램(stay-awake.ps1)을 띄운다.
function Invoke-StayAwakeRequest([int]$Wait = 0) {
  # $Wait: PC 를 깨우는 작업(지킴이·맛집 확인)은 45 — 깨어난 직후 Drive 가 바뀐 파일을 아직 못 받았을 수 있어 한 번 더 본다
  $drive = Find-MyDrive
  if (-not $drive) { return }
  $f = Join-Path $drive 'ClaudeWorkspace\stay-awake.txt'
  $read = {
    if (-not (Test-Path $f)) { return $null }
    $m = Select-String -Path $f -Pattern '^\s*until:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})' | Select-Object -First 1
    if (-not $m) { return $null }
    $u = [datetime]::ParseExact($m.Matches[0].Groups[1].Value, 'yyyy-MM-dd HH:mm', $null)
    if ($u -gt (Get-Date)) { return $u } else { return $null }
  }
  $until = & $read
  if (-not $until -and $Wait -gt 0) { Start-Sleep $Wait; $until = & $read }
  if (-not $until) { return }
  if (@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'stay-awake\.ps1' }).Count) { return }
  $ps1 = Join-Path $PSScriptRoot 'stay-awake.ps1'
  . (Join-Path $PSScriptRoot 'lib-detach.ps1')   # 작업 묶음 밖으로 — 띄운 작업의 제한 시간에 같이 꺼지지 않게 (2026-11-05)
  Start-Detached powershell.exe -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$ps1`"", '-Until', $until.ToString('yyyy-MM-dd HH:mm')
}
