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
