# 네이버 클립 하루 1편 (2026-11-05 사용자 — "네이버 클립부터 진행해줘"). catchup-reserve.ps1(그날 다시 예약, 10·13·16·19·22시쯤)이 부른다.
#   ① 오늘 네이버 글 중 이미 발행된(예약 시각 30분 지난) 생활보장 글 하나를 고른다 (없으면 생활정보, 이슈·연예 글은 뺀다)
#   ② scripts\clip\make-clip.mjs 로 세로 영상(약 20초, 그림 값 0원)을 만든다
#   ③ scripts\clip\upload-clip.mjs 로 클립 크리에이터 웹에 올린다.
#      실제 화면을 아직 본 적이 없어서 content\clip\POST-OK 가 생기기 전까지는 올리지 않는다:
#        첫 실행 = 화면 살펴보기(--look), 그다음 = 영상·설명까지만 넣고 멈춤. 기록·캡처·영상은 Drive run-logs\clip-<날짜_시각>-<PC>\ → Claude 가 보고 맞춘다.
#   멈춤: content\clip\PAUSE. 하루 한 번 (Drive run-locks\<날짜>\clip.done · clip-tried.done).
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
if (Test-Path (Join-Path $repo 'content\clip\PAUSE')) { Write-Output '클립 멈춤(content\clip\PAUSE)'; exit 0 }
# 시작일 (content\clip\start.txt 'start: YYYY-MM-DD' — 2026-11-05 사용자 "다음 주 월요일부터")
$sf = Join-Path $repo 'content\clip\start.txt'
if (Test-Path $sf) { $sm = Select-String -Path $sf -Pattern '^\s*start:\s*(\d{4}-\d{2}-\d{2})' | Select-Object -First 1
  if ($sm -and (Get-Date).Date -lt [datetime]::ParseExact($sm.Matches[0].Groups[1].Value, 'yyyy-MM-dd', $null)) { Write-Output "클립: $($sm.Matches[0].Groups[1].Value) 부터 시작"; exit 0 } }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Output '클립: Drive 없음 — 쉼'; exit 0 }
$now = Get-Date; $today = $now.ToString('yyyy-MM-dd')
$lock = Join-Path $drive "ClaudeWorkspace\run-locks\$today"
New-Item -ItemType Directory -Force -Path $lock | Out-Null
$postOk = Test-Path (Join-Path $repo 'content\clip\POST-OK')
if (Test-Path (Join-Path $lock 'clip.done')) { Write-Output '클립: 오늘 이미 올림'; exit 0 }
if (-not $postOk -and (Test-Path (Join-Path $lock 'clip-tried.done'))) { Write-Output '클립: 오늘 시험 끝'; exit 0 }

# ① 고르기
$cands = @()
foreach ($f in Get-ChildItem "content\posts\$today-*.md") {
  $head = Get-Content $f.FullName -Encoding UTF8 -TotalCount 30
  if ($head -match '^issue:\s*\S' -or $head -match '^draft_only:\s*\S') { continue }
  $pa = ($head | Where-Object { $_ -match '^publish_at:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})' } | Select-Object -First 1)
  if (-not $pa) { continue }
  $at = [datetime]::ParseExact(($pa -replace '^publish_at:\s*', '').Trim(), 'yyyy-MM-dd HH:mm', $null)
  if ($at -gt $now.AddMinutes(-30)) { continue }
  if (-not (Test-Path (Join-Path $lock "$($f.BaseName).done"))) { continue }   # 예약까지 끝난 글만
  $bojang = [bool]($head -match '^category:\s*생활보장')
  $cands += [pscustomobject]@{ f = $f; at = $at; pri = $(if ($bojang) { 0 } else { 1 }) }
}
$pick = $cands | Sort-Object pri, at | Select-Object -First 1
if (-not $pick) { Write-Output '클립: 아직 발행된 오늘 글이 없음 — 다음 시각에'; exit 0 }

# ② 영상 (ffmpeg 가 없으면 ffmpeg-static 을 받는다)
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $repo 'node_modules\ffmpeg-static'))) { npm install --no-audit --no-fund 2>&1 | Out-Null }
$stamp = $now.ToString('yyyy-MM-dd_HHmm')
$out = Join-Path $repo "dumps\clips\$today"
$mk = @(& node scripts\clip\make-clip.mjs $pick.f.FullName --out $out 2>&1 | ForEach-Object { "$_" })
$slug = $pick.f.BaseName
$mp4 = Join-Path $out "$slug.mp4"; $meta = Join-Path $out "$slug.json"
$shots = Join-Path $repo "dumps\clip-upload-$stamp"
if (-not (Test-Path $mp4)) { $res = "❌ 영상 못 만듦: $($mk -join ' / ')"; $code = 9 }
else {
  # ③ 올리기
  $lookDone = Test-Path (Join-Path $repo 'dumps\clip-look-done.txt')
  $a = if ($postOk) { @('--video', $mp4, '--meta', $meta, '--post') } elseif (-not $lookDone) { @('--look') } else { @('--video', $mp4, '--meta', $meta) }
  $up = @(& node scripts\clip\upload-clip.mjs @a --shots $shots 2>&1 | ForEach-Object { "$_" })
  $code = $LASTEXITCODE
  if ($a -contains '--look' -and $code -eq 0) { 'look done' | Set-Content (Join-Path $repo 'dumps\clip-look-done.txt') }
  $mode = if ($postOk) { '올리기' } elseif ($a -contains '--look') { '화면 살펴보기' } else { '영상·설명 넣고 멈춤(시험)' }
  $res = "$mode · 종료 코드 $code · $slug · " + (($up | Select-Object -Last 2) -join ' / ')
}
# 기록 → Drive
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\clip-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($p in @($mp4, $meta, (Join-Path $out "$slug-01.png"))) { if (Test-Path $p) { Copy-Item $p $dest -Force } }
if (Test-Path $shots) { Get-ChildItem $shots -File | Where-Object { $_.Extension -ne '.html' -or $_.Length -lt 3MB } | Copy-Item -Destination $dest -Force }
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $res" | Set-Content -Encoding UTF8 (Join-Path $dest 'result.txt')
if ($postOk -and $code -eq 0) { $res | Set-Content -Encoding UTF8 (Join-Path $lock 'clip.done') }
elseif (-not $postOk) { $res | Set-Content -Encoding UTF8 (Join-Path $lock 'clip-tried.done') }
Write-Output "클립: $res"
exit 0
