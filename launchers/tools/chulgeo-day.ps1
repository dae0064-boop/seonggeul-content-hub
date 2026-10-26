# 다와이철거 홍보 블로그 (2026-10-26) — 원고 그림 만들기 → 철거 블로그 전용 크롬(9223)으로 예약발행.
# 성글벙글과 다른 네이버 계정이라 크롬도 따로 쓴다: 포트 9223, 프로필 %LOCALAPPDATA%\chulgeo-chrome.
# 규칙 정본: content\chulgeo\README.md
#
#   powershell -ExecutionPolicy Bypass -File launchers\tools\chulgeo-day.ps1          (auto-day.cmd 가 부른다)
#   -DraftOnly   예약 대신 임시저장만
#
# - 로그인 전(프로필 폴더 없음)이면 조용히 건너뛴다. launchers\chulgeo-login.cmd 로 처음 한 번 로그인한다.
# - 오늘까지 날짜의 원고 중 아직 처리 표시(.done)가 없는 것을 오래된 것부터 하루 5편까지 한다
#   (PC 가 안 켜진 날 원고는 다음 날 먼저 나간다).
# - 처리 표시: Drive ClaudeWorkspace\run-locks\chulgeo\<슬러그>.done (두 PC 가 같은 글을 두 번 올리지 않게)
# - 예약 시각: 오늘 11:00·13:00·16:00·18:00·20:00 중 지금부터 30분 넘게 남은 빈 자리. 없으면 22:30 전까지 10분 단위로.
param([switch]$DraftOnly, [switch]$NoShare)
$started = Get-Date
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
New-Item -ItemType Directory -Force -Path dumps | Out-Null
$Date = Get-Date -Format 'yyyy-MM-dd'
$log = "dumps\day-$Date-chulgeo.log"
"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 다와이철거 시작" | Out-File $log -Append -Encoding utf8
function Say($s, $c = 'Gray') { Write-Host $s -ForegroundColor $c; $s | Out-File $log -Append -Encoding utf8 }
function Run($argsList) {
  & node @argsList 2>&1 | ForEach-Object { $l = $_.ToString(); Write-Host $l; $l | Out-File $log -Append -Encoding utf8 }
  return $LASTEXITCODE
}

$Port = 9223
$ChromeProfile = Join-Path $env:LOCALAPPDATA 'chulgeo-chrome'
if (-not (Test-Path $ChromeProfile)) {
  Say '다와이철거: 이 PC 에는 철거 블로그 로그인이 아직 없어요 (launchers\chulgeo-login.cmd 를 처음 한 번 실행). 건너뜁니다.' 'Yellow'
  exit 0
}

# ---- 처리 표시 (두 PC 겹침 막기)
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$me = $env:COMPUTERNAME
$drive = Find-MyDrive
$lockDir = if ($drive) { Join-Path $drive 'ClaudeWorkspace\run-locks\chulgeo' } else { Join-Path (Get-Location) 'dumps\run-locks\chulgeo' }
New-Item -ItemType Directory -Force -Path $lockDir | Out-Null
$running = Join-Path $lockDir "running-$me.lock"
$other = Get-ChildItem $lockDir -Filter 'running-*.lock' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne "running-$me.lock" -and ((Get-Date) - $_.LastWriteTime).TotalHours -lt 2 } | Select-Object -First 1
if ($other) { Say "다와이철거: 다른 PC($($other.BaseName -replace '^running-','')) 가 진행 중이에요. 이 PC 는 쉽니다." 'Yellow'; exit 0 }
"$me $(Get-Date -Format s)" | Out-File $running -Encoding utf8
function Release { Remove-Item $running -ErrorAction SilentlyContinue }

# ---- 오늘 할 원고: 날짜 <= 오늘, .done 없음, 오래된 것부터 5편
$posts = @(Get-ChildItem 'content\chulgeo\posts\*.json' -ErrorAction SilentlyContinue |
  Where-Object { $_.BaseName.Substring(0, 10) -le $Date -and -not (Test-Path (Join-Path $lockDir "$($_.BaseName).done")) } |
  Sort-Object @{ Expression = { (Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).publishAt } }, Name |
  Select-Object -First 5)
if (-not $posts.Count) { Say '다와이철거: 오늘 올릴 원고가 없어요 (모두 처리했거나 원고가 아직 없음).' 'Green'; Release; exit 0 }
Say "다와이철거 원고 $($posts.Count)편: $(($posts | ForEach-Object { $_.BaseName }) -join ', ')" 'Cyan'

# ---- 1) 그림 (실사풍, low). 이미 만든 그림은 건너뛴다
foreach ($p in $posts) {
  $plan = "content\chulgeo\image-plans\$($p.BaseName).json"
  if (-not (Test-Path $plan)) { Say "  그림 계획서 없음: $($p.BaseName)" 'Yellow'; continue }
  Say "`n[그림] $($p.BaseName)" 'Cyan'
  $null = Run @('scripts/post-images.mjs', $plan)
}

# ---- 2) 철거 블로그 전용 크롬
function CdpUp { try { Invoke-RestMethod "http://localhost:$Port/json/version" -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  Start-Process $chrome -ArgumentList "--remote-debugging-port=$Port", "--user-data-dir=$ChromeProfile", '--no-first-run', 'about:blank'
  Start-Sleep 6
}
if (-not (CdpUp)) {
  Say '다와이철거: 철거 블로그용 크롬을 켜지 못했어요.' 'Red'
  & (Join-Path $PSScriptRoot 'alert.ps1') -Title '다와이철거 - 예약 안 됨' -Message "철거 블로그용 크롬을 켜지 못했어요.`n launchers 폴더의 chulgeo-login.cmd 를 더블클릭한 뒤 다시 해 주세요."
  Release; exit 1
}

# ---- 3) 예약 시각 고르기 + 발행
$slots = @('11:00', '13:00', '16:00', '18:00', '20:00') | ForEach-Object { [datetime]::ParseExact("$Date $_", 'yyyy-MM-dd HH:mm', $null) }
$taken = New-Object System.Collections.ArrayList
function NextSlot {
  $earliest = (Get-Date).AddMinutes(30)
  foreach ($t in $slots) { if ($t -ge $earliest -and -not ($taken -contains $t)) { return $t } }
  # 정해진 자리가 모두 지났으면 다른 글과 30분 넘게 떨어진 10분 단위 자리 (22:30 전까지)
  $t = $earliest.Date.AddHours($earliest.Hour).AddMinutes([math]::Ceiling($earliest.Minute / 10) * 10)
  $last = $earliest.Date.AddHours(22).AddMinutes(30)
  while ($t -le $last) {
    $near = $taken | Where-Object { [math]::Abs(($t - $_).TotalMinutes) -lt 30 }
    if (-not $near) { return $t }
    $t = $t.AddMinutes(10)
  }
  return $null
}
$result = @()
foreach ($p in $posts) {
  $slug = $p.BaseName
  Say "`n[철거 블로그] $slug" 'Cyan'
  $base = @('scripts/publish-naver.mjs', '--post', $p.FullName, '--images', "content\images\$slug", '--color', '--cdp', "http://localhost:$Port", '--no-related', '--no-source-link', '--dump')
  if ($DraftOnly) { $code = Run ($base + @('--save-draft')); $msg = if ($code -eq 0) { '임시저장' } else { '실패' } }
  else {
    $slot = NextSlot
    if (-not $slot) { Say '  오늘 남은 예약 자리가 없어 내일로 넘깁니다' 'Yellow'; $result += [pscustomobject]@{ 글 = $slug; 결과 = '내일로' }; continue }
    $when = $slot.ToString('yyyy-MM-dd HH:mm')
    $code = Run ($base + @('--reserve', '--at', $when))
    $msg = if ($code -eq 0) { "예약발행 $when" } elseif ($code -eq 2) { '임시저장만 (예약 확인 실패)' } else { '실패 — 저장 안 함' }
    if ($code -eq 0) { [void]$taken.Add($slot) }
  }
  $result += [pscustomobject]@{ 글 = $slug; 결과 = $msg }
  if ($code -eq 0 -or $code -eq 2) { "$me $(Get-Date -Format 'yyyy-MM-dd HH:mm') $msg" | Out-File (Join-Path $lockDir "$slug.done") -Encoding utf8 }
  "$me $(Get-Date -Format s)" | Out-File $running -Encoding utf8
  if ($code -ne 0 -and $code -ne 2 -and $result.Count -eq 1 -and $posts.Count -gt 1) { Say '첫 글이 실패해서 나머지는 돌리지 않았어요.' 'Yellow'; break }
  Start-Sleep 3
}

Say "`n==================== 다와이철거 결과 ====================" 'Cyan'
$result | Format-Table -AutoSize | Out-String | ForEach-Object { Say $_ }
$bad = @($result | Where-Object { $_.결과 -notlike '예약발행*' })
if ($bad.Count -and -not $DraftOnly) {
  $why = if (Select-String -Path $log -Pattern '로그인 페이지로 이동' -Quiet) { "철거 블로그 네이버 로그인이 풀렸어요.`n launchers 폴더의 chulgeo-login.cmd 를 더블클릭해 로그인해 주세요." } else { '내일 아침 실행이 남은 글을 먼저 다시 올려요.' }
  & (Join-Path $PSScriptRoot 'alert.ps1') -Title '다와이철거 - 예약 안 된 글 있음' -Message "철거 블로그 글 $($bad.Count)편이 예약되지 않았어요.`n`n$why"
}
if (-not $NoShare) { & (Join-Path $PSScriptRoot 'share-run.ps1') -Date $Date -Since $started }
Release
