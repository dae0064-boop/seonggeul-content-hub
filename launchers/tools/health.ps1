# 지킴이 (2026-11-05 사용자 "3일간 집에 없는데 오류가 나거나 진행이 안 될 때가 있다 — 집에 없어도 작업 가능하도록").
#   작업 스케줄러 SeonggeulHealth 가 07:40·08:40 에 부른다 (2026-11-05 사용자 — 매시간에서 줄임) (health-setup.ps1, ensure-retry 가 저절로 등록).
#   사람 손이 필요해지기 전에 아래를 스스로 고친다. 무엇을 했는지 Drive run-logs\health-<날짜>.txt 에 한 줄씩 남긴다 → 아침 확인이 읽는다.
#   ① 자동화용 크롬(9222)이 꺼져 있으면 다시 켠다 (--restore-last-session — 카카오·네이버 로그인을 되살린다)
#   ② 최신 원고를 못 받았으면(git pull 실패·밀림) 다시 받는다
#   ③ 네이버·티스토리 로그인을 확인하고, 티스토리가 풀렸으면 혼자 다시 로그인한다 (login-check.mjs → tistoryRelogin, 비밀번호는 넣지 않음)
#   ④ 07~09시에 아침 이슈 글이 아직 예약 안 됐으면 바로 '그날 다시 예약'(catchup-reserve)을 띄운다 — 09시까지 기다리지 않게 (11/5 09:20 글이 09:40 으로 밀림)
#   ①-2 크롬이 켜져는 있는데 대답하지 않으면(멈춤) 자동화용 크롬만 끄고 다시 켠다 (2026-11-07 고장 — 그날 25편이 하나도 예약 안 됨, lib-detach.ps1 Repair-HungChrome)
#   예약·그림 작업이 도는 중이면 ①만 하고 쉰다. 글을 쓰거나 지우지 않는다. 멈춘 자동화 크롬 말고는 크롬을 끄지 않는다.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Wait-MyDrive 120
Invoke-StayAwakeRequest 45   # 사용자가 Claude 에게 '잠시 깨워 줘' 했으면 그 시각까지 안 잠 (2026-11-05)
$now = Get-Date
$today = $now.ToString('yyyy-MM-dd')
$noteFile = if ($drive) { Join-Path $drive "ClaudeWorkspace\run-logs\health-$today.txt" } else { Join-Path $repo "dumps\health-$today.txt" }
function Note($msg) { New-Item -ItemType Directory -Force -Path (Split-Path $noteFile) | Out-Null; "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $msg" | Add-Content -Encoding UTF8 $noteFile }

# ① 크롬
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
$chromeNote = '크롬 켜져 있음'
# ①-2 멈춘 크롬 먼저 (켜져는 있는데 대답 없음 — 새로 켜도 멈춘 창으로 넘어가 버린다)
. (Join-Path $PSScriptRoot 'lib-detach.ps1')
$hung = Repair-HungChrome $repo
if (-not (CdpUp)) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  . (Join-Path $PSScriptRoot 'lib-detach.ps1'); Start-Detached $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', '--restore-last-session', 'about:blank'
  for ($i = 0; $i -lt 30 -and -not (CdpUp); $i++) { Start-Sleep 1 }
  $chromeNote = if (CdpUp) { '⚠ 크롬이 꺼져 있어 다시 켬' } else { '❌ 크롬을 다시 켜지 못함' }
}
if ($hung) { $chromeNote = $hung }

# ⓪ 집 비움 모드 — 윈도우 절전·최대 절전을 '안 함'으로, 끝나면 원래대로 (원래 값은 dumps\away-power-backup.txt)
$awayNote = ''
$backup = Join-Path $repo 'dumps\away-power-backup.txt'
function AcIndex($sub, $set) { $o = powercfg /q SCHEME_CURRENT $sub $set 2>$null; $l = $o | Where-Object { $_ -match 'AC' -and $_ -match '0x[0-9a-fA-F]+' } | Select-Object -Last 1; if ($l -match '(0x[0-9a-fA-F]+)') { [Convert]::ToInt32($Matches[1], 16) } else { $null } }
$awayUntil = Get-AwayUntil
if ($awayUntil) {
  if (-not (Test-Path $backup)) {
    $sb = AcIndex 'SUB_SLEEP' 'STANDBYIDLE'; $hb = AcIndex 'SUB_SLEEP' 'HIBERNATEIDLE'; $ub = AcIndex 'SUB_SLEEP' 'UNATTENDSLEEP'
    New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
    "standby=$sb`nhibernate=$hb`nunattend=$ub" | Set-Content -Encoding UTF8 $backup
  }
  powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 0 2>$null | Out-Null
  powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE 0 2>$null | Out-Null
  # 작업이 깨운 PC 를 2분 뒤 다시 재우는 '무인 절전 시간'도 끈다 — 켜졌다 꺼졌다의 원인
  powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP 0 2>$null | Out-Null
  powercfg /SETACTIVE SCHEME_CURRENT 2>$null | Out-Null
  $now0 = AcIndex 'SUB_SLEEP' 'STANDBYIDLE'
  $awayNote = if ($now0 -eq 0) { " · 집 비움 모드($($awayUntil.ToString('M/d'))까지): 절전 안 함" } else { " · ⚠ 집 비움 모드인데 절전 '안 함'으로 못 바꿈 (지금 $now0 초)" }
} elseif (Test-Path $backup) {
  $b = @{}; Get-Content $backup -Encoding UTF8 | ForEach-Object { if ($_ -match '^(\w+)=(\d+)$') { $b[$Matches[1]] = $Matches[2] } }
  if ($b.standby) { powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP STANDBYIDLE $b.standby 2>$null | Out-Null }
  if ($b.hibernate) { powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE $b.hibernate 2>$null | Out-Null }
  if ($b.unattend) { powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP $b.unattend 2>$null | Out-Null }
  powercfg /SETACTIVE SCHEME_CURRENT 2>$null | Out-Null
  Remove-Item $backup -Force
  $awayNote = " · 집 비움 모드 끝 — 절전 시간을 원래대로 (절전 $($b.standby)초)"
}
# ⓪-2 맛집 예약 확인 쉬기 (content\away.txt matjip_pause_until — 그날까지 작업을 꺼서 PC 를 깨우지 않는다)
$mjf = Join-Path $repo 'content\away.txt'
$mjm = if (Test-Path $mjf) { Select-String -Path $mjf -Pattern '^\s*matjip_pause_until:\s*(\d{4}-\d{2}-\d{2})' | Select-Object -First 1 } else { $null }
$mjPause = $mjm -and ((Get-Date).Date -le [datetime]::ParseExact($mjm.Matches[0].Groups[1].Value, 'yyyy-MM-dd', $null))
$mjTask = Get-ScheduledTask -TaskName 'SeonggeulMatjipWatch' -ErrorAction SilentlyContinue
if ($mjTask) {
  if ($mjPause -and $mjTask.State -ne 'Disabled') { Disable-ScheduledTask -TaskName 'SeonggeulMatjipWatch' | Out-Null; $awayNote += ' · 맛집 예약 확인 쉼(깨우지 않음)' }
  elseif (-not $mjPause -and $mjTask.State -eq 'Disabled') { Enable-ScheduledTask -TaskName 'SeonggeulMatjipWatch' | Out-Null; $awayNote += ' · 맛집 예약 확인 다시 켬' }
}
$chromeNote += $awayNote

$busy = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'auto-day\.cmd|draft-day\.ps1|tistory-day\.ps1|publish-naver\.mjs|publish-tistory\.mjs|post-images\.mjs|catchup-reserve\.ps1|matjip|category-move|goms-ad\.mjs|insta-post' })
if ($busy.Count) { Note "$chromeNote · 다른 작업이 돌고 있어 나머지는 쉼"; exit 0 }

# ② 최신 원고
$gitNote = ''
git fetch -q origin main 2>$null
$behind = [int](git rev-list --count HEAD..origin/main 2>$null)
if ($behind -gt 0) {
  git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>$null
  if ((git rev-parse --abbrev-ref HEAD 2>$null) -ne 'main') { git checkout -q main 2>$null }
  git pull -q --ff-only origin main 2>$null
  if ($LASTEXITCODE -ne 0) {
    # 이 PC 에서 바뀐 파일 때문에 못 받으면 옆으로 치워 두고 받는다 (지우지 않음 — git stash 에 남는다)
    git stash push -q -u -m "health $today $($now.ToString('HHmm'))" 2>$null
    git pull -q --ff-only origin main 2>$null
  }
  $left = [int](git rev-list --count HEAD..origin/main 2>$null)
  $gitNote = if ($left -eq 0) { " · 최신 원고 받음 (밀려 있던 변경 $behind개)" } else { " · ❌ 최신 원고를 못 받음 (밀림 $left개)" }
}

# ③ 로그인 — 08:40 (09시 발행 전) 실행에서만
$loginNote = ''
if ($now.Hour -eq 8) {
  $out = Join-Path $repo "dumps\health-login-$today-$($now.ToString('HHmm'))"
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  $log = @(& node scripts\login-check.mjs --shots $out 2>&1 | ForEach-Object { "$_" })
  $code = $LASTEXITCODE
  $loginNote = switch ($code) { 0 { ' · 로그인 모두 됨' } 3 { ' · ❌ 로그인 필요: ' + (($log | Where-Object { $_ -match '로그인' } | Select-Object -Last 2) -join ' / ') } default { " · 로그인 확인 못 함 (코드 $code)" } }
  if ($log -match '다시 로그인됨') { $loginNote += ' (티스토리 혼자 다시 로그인함)' }
  if ($code -ne 0 -and $drive) { $d = Join-Path $drive "ClaudeWorkspace\run-logs\health-login-$today-$($now.ToString('HHmm'))"; New-Item -ItemType Directory -Force -Path $d | Out-Null; Copy-Item (Join-Path $out '*') $d -Force; $log | Set-Content -Encoding UTF8 (Join-Path $d 'result.txt') }
}
Note "$chromeNote$gitNote$loginNote"

# ④ 아침 이슈 글
if ($drive -and $now.Hour -ge 7 -and $now.Hour -lt 9) {
  $lockDir = Join-Path $drive "ClaudeWorkspace\run-locks\$today"
  $pend = @(Get-ChildItem "content\posts\$today-*.md" | Where-Object { -not (Test-Path (Join-Path $lockDir "$($_.BaseName).done")) })
  if ($pend.Count) {
    Note "아침에 예약 안 된 글 $($pend.Count)편 → 그날 다시 예약 띄움"
    & (Join-Path $PSScriptRoot 'catchup-reserve.ps1')
  }
}
exit 0
