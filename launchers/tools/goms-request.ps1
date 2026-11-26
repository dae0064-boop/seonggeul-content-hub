# 2분 지킴이 — 작업 스케줄러 SeonggeulGomsRequest(이름만 예전 그대로)가 하루 종일 2분마다 부른다. PC 를 깨우지 않는다.
#   Drive ClaudeWorkspace 의 요청 파일만 본다: reserved-look · reserved-redo · threads-probe · reserve-request(날짜 지정 예약) · matjip-request(맛집 임시저장).
#   2026-11-26 사용자: 곰스(GOMS)·심의는 쓰지 않는다 — 예전 goms-request.txt 처리(곰스 로그인·등록·승인 읽기)는 지웠다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { exit 0 }
$ws = Join-Path $drive 'ClaudeWorkspace'
$req = Join-Path $ws 'goms-request.txt'
# 2026-11-13 사용자 "PC 켜놨어 지금 바로 해봐": 10분마다 도는 이 작업이 예약 글 찾기(읽기만) 요청도 본다 (catchup 22시를 기다리지 않게)
$rlq = Join-Path $ws 'reserved-look-request.txt'
# 파일에 '철거' 가 있으면 철거 블로그 예약 목록을 읽는다 (예: "철거 2026-11-23", 2026-11-23) — 기다릴 수 있어 따로 띄운다
if (Test-Path $rlq) { try {
  $rlt = Get-Content $rlq -Raw -Encoding UTF8; Remove-Item $rlq -Force
  if ($rlt -match '철거') {
    $rld = (([regex]::Matches($rlt, '\d{4}-\d{2}-\d{2}') | ForEach-Object { $_.Value }) -join ',')
    . (Join-Path $PSScriptRoot 'lib-detach.ps1')
    Start-Detached powershell.exe -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $PSScriptRoot 'reserved-look.ps1')`"", '-Chulgeo', '-Dates', $rld
  } else { & (Join-Path $PSScriptRoot 'reserved-look.ps1') | Out-Null }
} catch { } }
# 같은 날 사용자 "모두 수정해": reserved-redo-request.txt (첫 줄 = 날짜들, 쉼표) → 예약 글 지우고 새 그림으로 다시 예약. 오래 걸려 따로 띄운다(작업 시간 제한에 같이 꺼지지 않게)
$rrq = Join-Path $ws 'reserved-redo-request.txt'
if (Test-Path $rrq) {
  try {
    $dates = ((Get-Content $rrq -Encoding UTF8 | Select-Object -First 1) -replace '[^0-9,\-]', '')
    Remove-Item $rrq -Force
    . (Join-Path $PSScriptRoot 'lib-detach.ps1')
    $ps1 = Join-Path $PSScriptRoot 'reserved-redo.ps1'
    Start-Detached powershell.exe -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$ps1`"", '-Dates', $dates, '-SkipDelete'
  } catch { }
}
# 2026-11-14 사용자 "스레드도 예약발행이 가능해, 확인해 보고 20일까지 예약": threads-probe-request.txt → 스레드 웹 글쓰기 창의 '예약' 화면을 살펴보기만(올리지 않음) → Drive threads-web\<시각>
$tpq = Join-Path $ws 'threads-probe-request.txt'
if (Test-Path $tpq) {
  try {
    Remove-Item $tpq -Force
    git -C $repo pull -q --ff-only 2>$null
    $st = Get-Date -Format 'yyyy-MM-dd_HHmm'; $po = Join-Path $repo "dumps\threads-web\$st"
    & node (Join-Path $repo 'scripts\threads\web-probe.mjs') --out $po 2>&1 | Out-File (Join-Path $repo "dumps\threads-web-$st.log") -Encoding utf8
    $pd = Join-Path $ws "threads-web\$st-$env:COMPUTERNAME"; New-Item -ItemType Directory -Force -Path $pd | Out-Null
    if (Test-Path $po) { Copy-Item (Join-Path $po '*') $pd -Force }; Copy-Item (Join-Path $repo "dumps\threads-web-$st.log") $pd -Force -ErrorAction SilentlyContinue
  } catch { }
}
# 2026-11-14 사용자 "20일까지 원고 모두 만들어서 예약발행": reserve-request.txt (첫 줄 = 날짜들, 쉼표) → 네이버·티스토리·철거를 그 날짜로 예약. 오래 걸려 따로 띄운다
$rsq = Join-Path $ws 'reserve-request.txt'
if (Test-Path $rsq) {
  try {
    $dates = ((Get-Content $rsq -Encoding UTF8 | Select-Object -First 1) -replace '[^0-9,\-]', '')
    Remove-Item $rsq -Force
    . (Join-Path $PSScriptRoot 'lib-detach.ps1')
    Start-Detached powershell.exe -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $PSScriptRoot 'reserve-dates.ps1')`"", '-Dates', $dates
  } catch { }
}
# 2026-11-13 사용자 "맛집 올려줘라고 하면 바로": 클라우드가 맛집 원고를 main 에 넣으며 Drive matjip-request.txt 를 남긴다 → 최신 원고 받아 임시저장
$mjq = Join-Path $ws 'matjip-request.txt'
if (Test-Path $mjq) { try { & (Join-Path $PSScriptRoot 'matjip-watch.ps1') -Requested; if ($LASTEXITCODE -ne 9) { Remove-Item $mjq -Force -ErrorAction SilentlyContinue } } catch { } }
# 2026-11-26 사용자 "곰스는 앞으로 사용 안 할 거야, 기존 작업 모두 삭제" — goms-request.txt(심의 올려줘) 처리는 지웠다. 파일 이름·작업 이름은 그대로(다른 요청 지킴이라서).
Remove-Item $req -Force -ErrorAction SilentlyContinue
exit 0
