# 하루치 원고를 이미지 생성 → 네이버 임시저장까지 한 번에 돌린다. 발행은 하지 않는다.
#   powershell -ExecutionPolicy Bypass -File launchers\draft-day.ps1 -Date 2026-10-01
#   -Only dokgam-75,daeha-jecheol   일부 글만
#   -SkipImages                     이미지 단계 건너뛰기
#   -ImagesOnly                     이미지만 만들고 네이버는 건드리지 않기 (다른 글 임시저장과 동시에 돌려도 됨)

#   -Reserve                        임시저장 대신 원고의 publish_at 시각으로 예약발행 (확인 안 되면 임시저장만)
#   -NoShare                        끝나고 결과를 Google Drive 로 올리지 않기
#
# 두 PC 겹침 막기 (-Reserve 일 때, 2026-10-02 사용자 결정: 노트북·사무실 PC 어느 쪽에서든 발행):
#   Google Drive 의 ClaudeWorkspace\run-locks\<날짜>\ 에 표시를 남긴다.
#   running-<PC>.lock  지금 이 날짜를 돌리는 중 (3시간 지나면 무시)
#   <글>.done          이미 예약했거나 임시저장한 글 → 다른 PC 는 건너뛴다
#   먼저 시작한 PC 가 이어서 하고, 늦게 온 PC 는 쉰다. 첫 PC 가 실패해 남긴 글만 다음 PC 가 한다.
# 한 편이 실패하면 그 글은 저장하지 않는다. 첫 글부터 실패하면 나머지는 돌리지 않는다(같은 이유로 또 실패하기 때문).
param(
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [string[]]$Only = @(),
  [switch]$SkipImages,
  [switch]$ImagesOnly,
  [switch]$Reserve,
  [switch]$NoShare
)
$started = Get-Date
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..')
New-Item -ItemType Directory -Force -Path dumps | Out-Null
$log = "dumps\day-$Date$(if ($ImagesOnly) { '-images' }).log"
"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 시작" | Out-File $log -Encoding utf8

function Say($s, $c = 'Gray') { Write-Host $s -ForegroundColor $c; $s | Out-File $log -Append -Encoding utf8 }
# 끝나면 결과를 Google Drive 로 올려 Claude 가 읽게 한다 (-NoShare 로 끈다)
function Share {
  if ($NoShare) { return }
  & (Join-Path $PSScriptRoot 'share-run.ps1') -Date $Date -Since $started
}
function Run($argsList) {
  & node @argsList 2>&1 | ForEach-Object { $l = $_.ToString(); Write-Host $l; $l | Out-File $log -Append -Encoding utf8 }
  return $LASTEXITCODE
}

# ---- 두 PC 겹침 막기
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$me = $env:COMPUTERNAME
$lockDir = $null
function Release { if ($lockDir) { Remove-Item (Join-Path $lockDir "running-$me.lock") -ErrorAction SilentlyContinue } }
function OtherRunning {
  if (-not $lockDir) { return $null }
  Get-ChildItem $lockDir -Filter 'running-*.lock' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "running-$me.lock" -and ((Get-Date) - $_.LastWriteTime).TotalHours -lt 3 } |
    Sort-Object LastWriteTime | Select-Object -First 1
}
if ($Reserve) {
  $drive = Find-MyDrive
  if ($drive) {
    $lockDir = Join-Path $drive "ClaudeWorkspace\run-locks\$Date"
    New-Item -ItemType Directory -Force -Path $lockDir | Out-Null
    $other = OtherRunning
    if ($other) {
      Say "다른 PC($($other.BaseName -replace '^running-','')) 가 $($other.LastWriteTime.ToString('HH:mm')) 부터 이 날짜를 진행 중이에요. 이 PC 는 쉽니다." 'Yellow'
      exit 0
    }
    "$me $(Get-Date -Format s)" | Out-File (Join-Path $lockDir "running-$me.lock") -Encoding utf8
    # 두 PC 가 거의 같이 시작했을 수 있다. Drive 동기화를 잠깐 기다린 뒤, 먼저 표시한 쪽만 계속한다
    Say "다른 PC 와 겹치지 않는지 확인하는 중 (90초)..." 'Gray'
    Start-Sleep 90
    $other = OtherRunning
    $mine = Get-Item (Join-Path $lockDir "running-$me.lock")
    if ($other -and ($other.LastWriteTime -lt $mine.LastWriteTime -or ($other.LastWriteTime -eq $mine.LastWriteTime -and $other.Name -lt $mine.Name))) {
      Say "다른 PC($($other.BaseName -replace '^running-','')) 가 먼저 시작했어요. 이 PC 는 쉽니다." 'Yellow'
      Release; exit 0
    }
  } else {
    Say 'Google Drive(내 드라이브\ClaudeWorkspace)를 찾지 못해 다른 PC 와 겹치는지 확인할 수 없어요. 이 PC 안에만 표시를 남기고 진행합니다.' 'Yellow'
    # 같은 PC 의 두 번째 실행(다시 시도)이 이미 한 글을 또 올리지 않게, 이 PC 안에 표시를 남긴다
    $lockDir = Join-Path (Get-Location) "dumps\run-locks\$Date"
    New-Item -ItemType Directory -Force -Path $lockDir | Out-Null
  }
}

$posts = Get-ChildItem "content\posts\$Date-*.json" | Sort-Object @{ Expression = { (Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).publishAt } }, Name
$Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($Only.Count) { $posts = $posts | Where-Object { $s = $_.BaseName.Substring(11); $Only -contains $s } }
if ($lockDir) {
  $posts = @($posts | Where-Object {
    $done = Join-Path $lockDir "$($_.BaseName).done"
    if (Test-Path $done) { Say "  건너뜀 (이미 처리됨: $((Get-Content $done -Raw).Trim())): $($_.BaseName)" 'Yellow'; $false } else { $true }
  })
}
if (-not $posts) {
  if ($lockDir) { Say "오늘 할 글이 남아 있지 않아요 (다른 PC 가 모두 처리했거나 원고가 없음)." 'Green'; Release; exit 0 }
  Say "원고가 없어요: content\posts\$Date-*.json" 'Red'; Share; exit 1
}
Say "원고 $($posts.Count)편: $(( $posts | ForEach-Object { $_.BaseName.Substring(11) }) -join ', ')" 'Cyan'

# 1) 이미지
if (-not $SkipImages) {
  foreach ($p in $posts) {
    $plan = "content\image-plans\$($p.BaseName).json"
    if (-not (Test-Path $plan)) { Say "  이미지 계획서 없음 — 건너뜀: $($p.BaseName)" 'Yellow'; continue }
    Say "`n[이미지] $($p.BaseName)" 'Cyan'
    $code = Run @('scripts/post-images.mjs', $plan)
    if ($code -ne 0) { Say "  이미지 일부 실패 — 이 글은 빈 자리를 표시 줄로 남깁니다" 'Yellow' }
  }
}

if ($ImagesOnly) { Say "`n이미지만 만들었어요. 네이버는 건드리지 않았어요." 'Green'; Share; exit 0 }

# 2) 자동화용 크롬
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Say "`n자동화용 크롬을 켜는 중..." 'Cyan'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  Start-Sleep 6
}
if (-not (CdpUp)) { Say '자동화용 크롬을 켜지 못했어요. launchers\chrome-login.cmd 를 먼저 실행해 주세요.' 'Red'; Release; Share; exit 1 }

# 3) 네이버 임시저장 (한 편씩)
$result = @()
$i = 0
# PC 가 늦게 켜진 날 (2026-10-02 사용자: 사무실 PC 는 밤에 끄고 아침에 아무 PC 나 켠다):
# 예약 시각이 이미 지났거나 곧인 글은 **지금 이후 가장 이른 빈 자리에 끼워 넣는다**.
# 2026-10-03 밤 사용자 지시: "오전 3개, 오후 2개로 빠르게 끝내자, 저녁 늦게 올리면 노출이 잘 안 된다"
# (그 전엔 12~19시 사이, 다른 글과 60분 떨어진 자리부터 찾았다).
# 제때 갈 수 있는 글은 원래 시각 그대로 두고, 늦은 글만 다른 글과 30분 이상 떨어진 가장 이른 10분 단위 자리에 넣는다.
# 19시 안에 자리가 없으면 23시 전까지, 그래도 없으면 예약하지 않는다.
$planned = @{}
function Ceil10([datetime]$t) { $t.Date.AddHours($t.Hour).AddMinutes([math]::Ceiling(($t.Minute + ($t.Second -gt 0)) / 10) * 10) }
if ($Reserve) {
  $now = Get-Date
  $items = @()
  $k = 0
  foreach ($p in $posts) {
    $w = (Get-Content $p.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).publishAt
    if (-not $w) { continue }
    $want = [datetime]::ParseExact($w, 'yyyy-MM-dd HH:mm', $null)
    # 앞 글들을 처리하는 동안(한 편 3분쯤) 시간이 가므로 차례만큼 여유를 더 둔다
    $earliest = Ceil10 ($now.AddMinutes(30 + 4 * $k))
    $items += [pscustomobject]@{ Slug = $p.BaseName; Want = $want; Earliest = $earliest; Late = ($want -lt $earliest) }
    $k++
  }
  $taken = New-Object System.Collections.ArrayList
  foreach ($it in $items) { if (-not $it.Late) { [void]$taken.Add($it.Want); $planned[$it.Slug] = $it.Want } }
  foreach ($it in ($items | Where-Object Late)) {
    $day = $it.Want.Date
    $best = $null
    foreach ($win in @(@(0, 19), @(0, 23))) {
      $from = $day.AddHours($win[0]); if ($from -lt $it.Earliest) { $from = $it.Earliest }
      $to = $day.AddHours($win[1])
      # 가장 이른 자리부터: 다른 글과 30분 이상 떨어진 첫 자리
      foreach ($need in @(30)) {
        for ($t = $from; $t -le $to; $t = $t.AddMinutes(10)) {
          if ($t.Hour -ge 23) { break }
          $gap = 9999
          foreach ($x in $taken) { $g = [math]::Abs(($t - $x).TotalMinutes); if ($g -lt $gap) { $gap = $g } }
          if ($gap -ge $need) { $best = $t; break }
        }
        if ($best) { break }
      }
      if ($best) { break }
    }
    if ($best -and $best.Date -eq $day) { [void]$taken.Add($best); $planned[$it.Slug] = $best }
    else { $planned[$it.Slug] = $it.Want }   # 자리가 없으면 원래 시각 — 이미 지났으므로 예약 대신 임시저장으로 남는다
  }
}
foreach ($p in $posts) {
  $i++
  $slug = $p.BaseName
  Say "`n[네이버 $i/$($posts.Count)] $slug" 'Cyan'
  $mode = '--save-draft'; $when = ''
  if ($Reserve) {
    $when = (Get-Content $p.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).publishAt
    if ($when) { $mode = '--reserve' } else { Say '  publish_at 이 없어 임시저장만 합니다' 'Yellow' }
  }
  $atArgs = @()
  if ($mode -eq '--reserve') {
    $want = [datetime]::ParseExact($when, 'yyyy-MM-dd HH:mm', $null)
    $slot = if ($planned.ContainsKey($slug)) { $planned[$slug] } else { $want }
    # 앞 글 처리가 길어져 계획한 시각이 25분 안쪽이 됐으면 10분 단위로 조금 더 민다 (19시를 넘기지 않게, 넘으면 23시 전까지)
    $minNow = Ceil10 ((Get-Date).AddMinutes(25))
    if ($slot -lt $minNow -and $minNow.Date -eq $want.Date -and $minNow.Hour -lt 23) { $slot = $minNow }
    if ($slot -ne $want) {
      Say "  PC 가 늦게 켜져서 예약 시각을 $($want.ToString('HH:mm')) → $($slot.ToString('HH:mm')) 로 옮깁니다 (가장 이른 빈 자리)" 'Yellow'
      $when = $slot.ToString('yyyy-MM-dd HH:mm')
      $atArgs = @('--at', $when)
    }
  }
  $code = Run (@('scripts/publish-naver.mjs', '--post', $p.FullName, '--images', "content\images\$slug", '--color', $mode, '--dump') + $atArgs)
  $ok = ($code -eq 0 -or $code -eq 2)
  $msg = if ($code -eq 0 -and $mode -eq '--reserve') { "예약발행 $when" } elseif ($code -eq 0) { '임시저장 완료' } elseif ($code -eq 2) { '임시저장만 (예약 확인 실패)' } else { '실패 — 저장 안 함' }
  $result += [pscustomobject]@{ 글 = $slug; 결과 = $msg }
  # 저장까지 된 글(예약·임시저장)은 표시를 남겨 다른 PC 가 다시 올리지 않게 한다. 저장 안 된 실패는 남기지 않는다
  # 다음 날 글을 전날 밤에 돌린 경우(reserve-tomorrow), 예약이 안 되고 임시저장만 됐으면 표시를 남기지 않는다 —
  # 그날 아침 실행이 다시 예약하도록 (2026-10-03)
  $markOk = $ok -and -not ($code -eq 2 -and $Date -ne (Get-Date -Format 'yyyy-MM-dd'))
  if ($lockDir -and $markOk) { "$me $(Get-Date -Format 'HH:mm') $msg" | Out-File (Join-Path $lockDir "$slug.done") -Encoding utf8 }
  if ($lockDir) { "$me $(Get-Date -Format s)" | Out-File (Join-Path $lockDir "running-$me.lock") -Encoding utf8 }
  if (-not $ok -and $i -eq 1 -and $posts.Count -gt 1) {
    Say '첫 글이 실패해서 나머지는 돌리지 않았어요 (같은 이유로 또 실패할 가능성이 커요).' 'Yellow'
    break
  }
  Start-Sleep 3
}

Say "`n==================== 결과 ====================" 'Cyan'
$result | Format-Table -AutoSize | Out-String | ForEach-Object { Say $_ }
if ($Reserve) { Say '예약된 글은 블로그 글 관리의 예약 목록에서, 나머지는 임시저장 목록에서 확인하세요.' 'Green' }
else { Say '발행은 하지 않았어요. 네이버 글쓰기 화면의 "저장" 옆 숫자 → 임시저장 목록에서 확인하세요.' 'Green' }
Share
Release
