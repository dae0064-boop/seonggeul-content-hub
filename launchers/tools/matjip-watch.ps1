# 맛집 글 예약 지킴이 — 작업 스케줄러 SeonggeulMatjipWatch 가 07~23시 15분마다 부른다 (2026-11-04 사용자:
#   "어디서나 모바일 앱으로 요청하면 PC 로 작성해서 1시간 뒤 예약발행", PC 는 15분마다 깨워 확인).
# 새 맛집 원고(content/matjip/posts, publish_at 있음, 아직 안 한 것)가 있으면 사진·지도까지 넣어 예약한다. 크롬은 끄지 않는다.
# 2026-11-09 사용자: 맛집은 예약발행하지 않고 임시저장만(태그·지도·사진·카테고리까지) — 대표사진은 사용자가 보고 직접 발행. publish_at 은 '이 원고를 PC 가 써 달라'는 표시로만 쓴다.
# 2026-11-04 사용자 최종: 평소엔 원고 + 아티팩트만(원고에 publish_at 없음 → 여기서 할 일 없음). 사용자가 "직접 써 줘"라고 한 원고만 publish_at 이 붙어 예약된다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
# 다른 발행이 돌고 있으면 쉰다 (같은 크롬을 쓴다)
$busy = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'publish-naver|publish-tistory|matjip-draft' }
if ($busy) { exit 0 }
git fetch -q origin 2>$null
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>$null
git pull -q --ff-only 2>$null
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
Invoke-StayAwakeRequest 45   # 잠시 깨어 있기 요청 (2026-11-05)
$marks = if ($drive) { Join-Path $drive 'ClaudeWorkspace\run-locks\matjip' } else { Join-Path $repo 'dumps\matjip-done' }
New-Item -ItemType Directory -Force -Path $marks | Out-Null
$todo = @()
foreach ($f in Get-ChildItem (Join-Path $repo 'content\matjip\posts\*.md') -ErrorAction SilentlyContinue) {
  $head = Get-Content $f.FullName -Encoding UTF8 -TotalCount 25
  $pa = ($head | Where-Object { $_ -match '^publish_at:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})' } | Select-Object -First 1)
  if (-not $pa) { continue }
  $at = [datetime]::ParseExact(($pa -replace '^publish_at:\s*', '').Trim(), 'yyyy-MM-dd HH:mm', $null)
  if ($at -lt (Get-Date).AddDays(-2)) { continue }   # 오래된 원고는 하지 않는다
  if (Test-Path (Join-Path $marks "$($f.BaseName).done")) { continue }
  $todo += $f
}
if (-not $todo) { exit 0 }
if (-not ((Test-NetConnection localhost -Port 9222 -InformationLevel Quiet -WarningAction SilentlyContinue))) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  . (Join-Path $PSScriptRoot 'lib-detach.ps1'); Start-Detached $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', '--restore-last-session', 'about:blank'
  Start-Sleep -Seconds 8
}
foreach ($f in $todo) {
  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
  $log = Join-Path $repo "dumps\matjip-$stamp.log"
  & node scripts\matjip-draft.mjs $f.FullName --drive $drive --dump 2>&1 | ForEach-Object { Add-Content -Path $log -Value $_ -Encoding UTF8 }
  $code = $LASTEXITCODE
  $try = Join-Path $marks "$($f.BaseName).try"
  $n = 1 + [int](Get-Content $try -ErrorAction SilentlyContinue | Select-Object -First 1)
  # 0 = 임시저장됨 — 다시 하지 않는다(임시저장 글이 겹치지 않게). 1 = 실패 → 세 번까지 다시
  if ($code -eq 0 -or $code -eq 2 -or $n -ge 3) {
    $what = if ($code -eq 0 -or $code -eq 2) { '임시저장됨 (대표사진 확인 뒤 앱에서 발행해 주세요)' } else { "세 번 실패 (코드 $code)" }
    Set-Content -Path (Join-Path $marks "$($f.BaseName).done") -Value "$stamp $env:COMPUTERNAME $what" -Encoding UTF8
    Remove-Item $try -ErrorAction SilentlyContinue
  } else { Set-Content -Path $try -Value $n -Encoding UTF8 }
  if ($drive) {
    $dest = Join-Path $drive "ClaudeWorkspace\run-logs\matjip-$stamp-$env:COMPUTERNAME"
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item $log $dest -Force
    $dumpDir = Get-ChildItem (Join-Path $repo 'dumps') -Directory | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-15) -and $_.Name -match '^\d{4}-' } | Sort-Object LastWriteTime | Select-Object -Last 1
    if ($dumpDir) { Get-ChildItem $dumpDir.FullName -Filter '*.png' | Copy-Item -Destination $dest -Force }
  }
}
