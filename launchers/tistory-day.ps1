# 하루치 티스토리 원고를 임시저장한다. 발행은 하지 않는다.
#   powershell -ExecutionPolicy Bypass -File launchers\tistory-day.ps1 -Date 2026-10-02
#   -DryRun     임시저장 + 발행 패널을 열어 화면을 기록만 하고 닫는다 (예약발행을 만들 자료)
#   -Only hasan-mureup   일부 글만
#   -NoShare    끝나고 결과를 Google Drive 로 올리지 않기
#   -SkipImages 그림을 만들지 않고, 이미 만들어 둔 그림만 넣는다
#   -Reserve    원고 publish_at 시각으로 예약발행 (확인 안 되면 임시저장만). auto-day.cmd 가 네이버 다음에 부른다.
#               네이버(11·13·15·17·19시)와 30분 텀 — 티스토리 원고는 11:30·13:30·15:30·17:30·19:30 (2026-10-03 사용자 지시)
#   -RetryDrafts  예약 확인에 실패해 임시저장만 된 글은 다시 예약해 본다 (tistory-reserve.cmd 가 붙인다)
#               두 PC 겹침은 네이버와 같은 Drive run-locks\<날짜>\ 에 tistory-<글>.done 표시로 막는다
#
# 그림: 글마다 content\image-plans\<글>.json 으로 content\images\<글>\ 에 그림을 만들고(이미 있으면 건너뜀, 돈 두 번 안 나감)
# 발행 스크립트가 [이미지 N] 자리에 올려 넣는다. 네이버와 같은 그림 도구·같은 OpenAI 키를 쓴다.
#
# 블로그 주소(<이름>.tistory.com)는 처음 한 번 물어보고 사용자 환경 변수 TISTORY_BLOG 에 저장한다.
# 자동화용 크롬(9222)에 티스토리(카카오) 로그인이 되어 있어야 한다 — launchers\chrome-login.cmd
param(
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [string[]]$Only = @(),
  [switch]$DryRun,
  [switch]$NoShare,
  [switch]$SkipImages,
  [switch]$Reserve,
  [switch]$RetryDrafts
)
$started = Get-Date
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..')
New-Item -ItemType Directory -Force -Path dumps | Out-Null
# share-run.ps1 이 dumps\day-<날짜>*.log 를 올리므로 이름을 맞춘다
$log = "dumps\day-$Date-tistory.log"
"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 티스토리 시작" | Out-File $log -Encoding utf8

function Say($s, $c = 'Gray') { Write-Host $s -ForegroundColor $c; $s | Out-File $log -Append -Encoding utf8 }
function Share { if (-not $NoShare) { & (Join-Path $PSScriptRoot 'share-run.ps1') -Date $Date -Since $started } }
function Run($argsList) {
  & node @argsList 2>&1 | ForEach-Object { $l = $_.ToString(); Write-Host $l; $l | Out-File $log -Append -Encoding utf8 }
  return $LASTEXITCODE
}

# 블로그 이름
$blog = $env:TISTORY_BLOG
if (-not $blog) { $blog = [Environment]::GetEnvironmentVariable('TISTORY_BLOG', 'User') }
# 아침 자동 실행(-Reserve)에서는 사람이 답할 수 없으니 묻지 않는다. 블로그 주소는 공개 정보라 기본값으로 둔다 (2026-10-03 첫 테스트에서 확인)
if (-not $blog -and $Reserve) { $blog = 'seongdaeeyo' }
if (-not $blog) {
  Write-Host ''
  Write-Host '  티스토리 블로그 주소의 앞부분을 적어 주세요.' -ForegroundColor Cyan
  Write-Host '  예: 주소가 https://seonggeul.tistory.com 이면  seonggeul'
  $blog = (Read-Host '  블로그 이름').Trim()
  if ($blog -notmatch '^[A-Za-z0-9-]+$') { Say "블로그 이름이 이상해요: '$blog'" 'Red'; exit 1 }
  [Environment]::SetEnvironmentVariable('TISTORY_BLOG', $blog, 'User')
  Say "저장했어요. 다음부터는 묻지 않아요: $blog.tistory.com" 'Green'
}
$env:TISTORY_BLOG = $blog

# 원고: .md 가 정본이므로 먼저 검사하고 .json 을 다시 만든다
Say '티스토리 준비 중...' 'Cyan'
$mds = Get-ChildItem "content\tistory\$Date-*.md" -ErrorAction SilentlyContinue | Sort-Object Name
if (-not $mds -and -not $Reserve -and -not $PSBoundParameters.ContainsKey('Date')) {
  # 날짜를 지정하지 않았고 오늘 원고가 없으면 가장 최근 날짜 원고로 한다 (처음 시험할 때)
  $latest = Get-ChildItem 'content\tistory\*.md' -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
  if ($latest) {
    $Date = $latest.BaseName.Substring(0, 10)
    Say "오늘 원고가 없어 가장 최근 날짜($Date) 원고로 합니다." 'Yellow'
    $mds = Get-ChildItem "content\tistory\$Date-*.md" | Sort-Object Name
  }
}
$Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($Only.Count) { $mds = $mds | Where-Object { $Only -contains $_.BaseName.Substring(11) } }
if (-not $mds) { Say "티스토리 원고가 없어요: content\tistory\$Date-*.md" 'Yellow'; if (-not $Reserve) { Share }; exit 0 }

# ---- 두 PC 겹침 막기 (예약할 때만). draft-day.ps1 과 같은 방식, 표시 이름만 tistory-
$me = $env:COMPUTERNAME
$lockDir = $null
function Release { if ($lockDir) { Remove-Item (Join-Path $lockDir "running-tistory-$me.lock") -ErrorAction SilentlyContinue } }
function OtherRunning {
  if (-not $lockDir) { return $null }
  Get-ChildItem $lockDir -Filter 'running-tistory-*.lock' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "running-tistory-$me.lock" -and ((Get-Date) - $_.LastWriteTime).TotalHours -lt 3 } |
    Sort-Object LastWriteTime | Select-Object -First 1
}
if ($Reserve) {
  . (Join-Path $PSScriptRoot 'lib-drive.ps1')
  $drive = Find-MyDrive
  if ($drive) { $lockDir = Join-Path $drive "ClaudeWorkspace\run-locks\$Date" }
  else { Say 'Google Drive 를 찾지 못해 다른 PC 와 겹치는지 확인할 수 없어요. 이 PC 안에만 표시를 남기고 진행합니다.' 'Yellow'; $lockDir = Join-Path (Get-Location) "dumps\run-locks\$Date" }
  New-Item -ItemType Directory -Force -Path $lockDir | Out-Null
  $other = OtherRunning
  if ($other) { Say "다른 PC 가 티스토리를 진행 중이에요. 이 PC 는 쉽니다." 'Yellow'; exit 0 }
  "$me $(Get-Date -Format s)" | Out-File (Join-Path $lockDir "running-tistory-$me.lock") -Encoding utf8
  if ($drive) {
    Say '다른 PC 와 겹치지 않게 1분 기다리는 중... (창이 멈춘 게 아니에요)' 'Cyan'
    Start-Sleep 60
    $other = OtherRunning
    $mine = Get-Item (Join-Path $lockDir "running-tistory-$me.lock")
    if ($other -and ($other.LastWriteTime -lt $mine.LastWriteTime -or ($other.LastWriteTime -eq $mine.LastWriteTime -and $other.Name -lt $mine.Name))) {
      Say "다른 PC 가 먼저 티스토리를 시작했어요. 이 PC 는 쉽니다." 'Yellow'; Release; exit 0
    }
  }
  $mds = @($mds | Where-Object {
    $done = Join-Path $lockDir "tistory-$($_.BaseName).done"
    if (-not (Test-Path $done)) { $true }
    elseif ($RetryDrafts -and ((Get-Content $done -Raw -Encoding UTF8) -match '예약 확인 실패')) { Say "  다시 예약해 봅니다 (지난번엔 임시저장만 됨): $($_.BaseName)" 'Yellow'; $true }
    else { Say "  건너뜀 (이미 처리됨): $($_.BaseName)" 'Yellow'; $false }
  })
  if (-not $mds) { Say '오늘 티스토리 글은 모두 처리됐어요.' 'Green'; Release; exit 0 }
  # publish_at 순서대로
  $mds = @($mds | Sort-Object @{ Expression = { ((Get-Content $_.FullName -Raw -Encoding UTF8) -split "`n" | Where-Object { $_ -match '^publish_at:' } | Select-Object -First 1) } }, Name)
}
Say "티스토리 원고 $(@($mds).Count)편 → $blog.tistory.com" 'Cyan'

# 2) 자동화용 크롬 (draft-day.ps1 과 같은 크롬·프로필)
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Say "`n자동화용 크롬을 켜는 중..." 'Cyan'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  Start-Sleep 6
}
if (-not (CdpUp)) { Say '자동화용 크롬을 켜지 못했어요. launchers\chrome-login.cmd 를 먼저 실행해 주세요.' 'Red'; Share; exit 1 }

$mode = if ($DryRun) { '--dry-run' } else { '--save-draft' }
$result = @()
$i = 0
# PC 가 늦게 켜진 날: 예약 시각이 지났거나 30분 안쪽이면 오늘 안에서 뒤로 미룬다 (앞 글과 60분 이상, 23시 전까지) — draft-day 와 같은 규칙
$lastAt = $null
function NextSlot([datetime]$want) {
  $earliest = (Get-Date).AddMinutes(30)
  $earliest = $earliest.Date.AddHours($earliest.Hour).AddMinutes([math]::Ceiling($earliest.Minute / 10) * 10)
  $t = $want
  if ($t -lt $earliest) { $t = $earliest }
  if ($script:lastAt -and $t -lt $script:lastAt.AddMinutes(60)) { $t = $script:lastAt.AddMinutes(60) }
  if ($t.Date -ne $want.Date -or $t.Hour -ge 23) { return $want }
  return $t
}
foreach ($m in $mds) {
  $i++
  $slug = $m.BaseName
  Say "`n[티스토리 $i/$(@($mds).Count)] $slug" 'Cyan'
  if ((Run @('scripts/lint-tistory.mjs', $m.FullName)) -ne 0) {
    $result += [pscustomobject]@{ 글 = $slug; 결과 = '검사 불통과 — 넣지 않음' }
    continue
  }
  Run @('scripts/build-tistory.mjs', $m.FullName) | Out-Null
  $plan = "content\image-plans\$slug.json"
  if (-not $SkipImages -and (Test-Path $plan)) {
    Say "  그림 만들기: $plan" 'Cyan'
    if ((Run @('scripts/post-images.mjs', $plan)) -ne 0) {
      # 예약하면 '[이미지 N] 설명' 글자가 그대로 발행된다 (2026-10-03). 넣지 않고 .done 도 남기지 않아 다음 실행이 다시 한다
      if ($Reserve) {
        Say '  그림 일부를 만들지 못해 이 글은 넣지 않아요 — 다음 실행(다시 시도 시각)에서 남은 그림부터 다시 합니다' 'Yellow'
        $result += [pscustomobject]@{ 글 = $slug; 결과 = '그림 실패 — 넣지 않음 (다음 실행에서 다시)' }
        continue
      }
      Say '  그림 일부 실패 — 못 만든 자리는 표시 글자로 남깁니다' 'Yellow'
    }
  } elseif (-not (Test-Path $plan)) { Say "  이미지 계획서 없음 — 그림 없이 넣습니다: $plan" 'Yellow' }
  $postMode = $mode; $atArgs = @(); $when = ''
  if ($Reserve) {
    $when = (Get-Content ($m.FullName -replace '\.md$', '.json') -Raw -Encoding UTF8 | ConvertFrom-Json).publishAt
    if ($when) {
      $postMode = '--reserve'
      $want = [datetime]::ParseExact($when, 'yyyy-MM-dd HH:mm', $null)
      $slot = NextSlot $want
      if ($slot -ne $want) { Say "  PC 가 늦게 켜져서 예약 시각을 $($want.ToString('HH:mm')) → $($slot.ToString('HH:mm')) 로 미룹니다" 'Yellow'; $when = $slot.ToString('yyyy-MM-dd HH:mm') }
      $atArgs = @('--at', $when)
      $script:lastAt = $slot
    } else { Say '  publish_at 이 없어 임시저장만 합니다' 'Yellow' }
  }
  $pubArgs = @('scripts/publish-tistory.mjs', '--post', ($m.FullName -replace '\.md$', '.json'), $postMode, '--dump') + $atArgs
  if (Test-Path "content\images\$slug") { $pubArgs += @('--images', "content\images\$slug") }
  $code = Run $pubArgs
  $msg = if ($code -eq 0 -and $postMode -eq '--reserve') { "예약발행 $when" } elseif ($code -eq 0) { if ($DryRun) { '임시저장 + 발행 패널 기록' } else { '임시저장 완료' } } elseif ($code -eq 2) { '임시저장만 (예약 확인 실패)' } else { '실패 — 저장 안 함' }
  $result += [pscustomobject]@{ 글 = $slug; 결과 = $msg }
  if ($lockDir -and ($code -eq 0 -or $code -eq 2)) { "$me $(Get-Date -Format 'HH:mm') $msg" | Out-File (Join-Path $lockDir "tistory-$slug.done") -Encoding utf8 }
  if ($lockDir) { "$me $(Get-Date -Format s)" | Out-File (Join-Path $lockDir "running-tistory-$me.lock") -Encoding utf8 }
  if ($code -ne 0 -and $i -eq 1 -and @($mds).Count -gt 1) {
    Say '첫 글이 실패해서 나머지는 돌리지 않았어요 (같은 이유로 또 실패할 가능성이 커요).' 'Yellow'
    break
  }
  Start-Sleep 3
}

Say "`n==================== 결과 ====================" 'Cyan'
$result | Format-Table -AutoSize | Out-String | ForEach-Object { Say $_ }
if ($Reserve) { Say '예약된 글은 티스토리 관리 > 글 관리에서, 나머지는 글쓰기 화면 아래 "임시저장" 옆 숫자에서 확인하세요.' 'Green' }
else { Say '발행은 하지 않았어요. 티스토리 글쓰기 화면 아래 "임시저장" 옆 숫자에서 확인하세요.' 'Green' }
Release
Share
