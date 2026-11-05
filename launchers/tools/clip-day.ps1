# 네이버 클립 하루 1편 (2026-11-05 사용자 — "네이버 클립부터 진행해줘"). catchup-reserve.ps1(그날 다시 예약, 10·13·16·19·22시쯤)이 부른다.
#   ★ 2026-11-05 사용자 — "클립이랑 인스타는 모두 보험심의 카드뉴스글만 올릴 거야": 블로그 글 영상은 만들지 않는다.
#   ① content\clip\approved.tsv (영상으로 GOMS 심의 적격 받은 카드뉴스 편) 에서 아직 안 올린 가장 앞 편을 고른다 — 없으면 화면 살펴보기만
#   ② scripts\clip\make-reel.mjs 로 그 편 카드뉴스 영상을 만든다 (심의받은 영상과 같은 원고·같은 그림)
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

# ① 고르기 — 영상 심의 적격 편 (approved.tsv: 편번호⇥set 파일⇥영상 심의필⇥유효기간 끝, '#' 줄은 설명)
$posted = @(); $pf = Join-Path $repo 'content\archive\clip-posted.tsv'
if (Test-Path $pf) { $posted = @(Get-Content $pf -Encoding UTF8 | ForEach-Object { ($_ -split "`t")[1] }) }
$pick = $null; $af = Join-Path $repo 'content\clip\approved.tsv'
if (Test-Path $af) {
  foreach ($l in (Get-Content $af -Encoding UTF8)) {
    if ($l -match '^\s*#' -or -not $l.Trim()) { continue }
    $c = $l -split "`t"; if ($c.Count -lt 4) { continue }
    if ($posted -contains "insta-$($c[0])") { continue }
    if ([datetime]::ParseExact($c[3].Trim(), 'yyyy-MM-dd', $null) -lt $now.Date) { continue }   # 유효기간 지난 심의는 쓰지 않는다
    $pick = [pscustomobject]@{ no = $c[0].Trim(); set = $c[1].Trim(); slug = "insta-$($c[0].Trim())" }; break
  }
}
$stamp = $now.ToString('yyyy-MM-dd_HHmm')
$shots = Join-Path $repo "dumps\clip-upload-$stamp"
$lookDone = Test-Path (Join-Path $repo 'dumps\clip-look-done.txt')
$mp4 = ''; $meta = ''
if (-not $pick) {
  if ($lookDone) { Write-Output '클립: 영상 심의 적격 카드뉴스가 아직 없음 — 쉼'; exit 0 }
  $up = @(& node scripts\clip\upload-clip.mjs --look --shots $shots 2>&1 | ForEach-Object { "$_" }); $code = $LASTEXITCODE
  if ($code -eq 0) { 'look done' | Set-Content (Join-Path $repo 'dumps\clip-look-done.txt') }
  $res = "화면 살펴보기 · 종료 코드 $code · " + (($up | Select-Object -Last 2) -join ' / ')
} else {
  # ② 영상 (ffmpeg 가 없으면 ffmpeg-static 을 받는다). 마지막 장 = 심의필 넣은 카드 (content\instagram\final\<N>\)
  if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $repo 'node_modules\ffmpeg-static'))) { npm install --no-audit --no-fund 2>&1 | Out-Null }
  $out = Join-Path $repo "dumps\clips\$today"
  $mk = @(& node scripts\clip\make-reel.mjs $pick.set $pick.no --cards "content\instagram\final\$($pick.no)" --out $out 2>&1 | ForEach-Object { "$_" })
  $mp4 = (Get-ChildItem $out -Filter "$($pick.no)-*.mp4" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
  $meta = Join-Path $out "$($pick.slug).json"
  if (-not $mp4) { $res = "❌ 영상 못 만듦: $($mk -join ' / ')"; $code = 9 }
  else {
    # 설명 = 심의받은 클립용 설명(clip_caption, 7편~) — 없으면 게시글 본문. 줄이지 않는다(300자 넘으면 멈춘다)
    & node -e "const s=require(process.argv[1]),p=s.posts.find(x=>String(x.no)===process.argv[2]);const d=(p.clip_caption||p.caption||[]).join('\n');require('fs').writeFileSync(process.argv[3],JSON.stringify({description:d,tags:p.tags||[],title:p.cards[0].title.join(' ').replace(/[\[\]]/g,'')}));if(d.length>300)process.exit(3)" (Resolve-Path $pick.set) $pick.no $meta
    if ($LASTEXITCODE -eq 3) { $res = "⏸ $($pick.no)편 게시글 본문이 300자를 넘어 클립 설명에 못 넣음 — 심의받은 짧은 설명이 필요"; $code = 3 }
    else {
      # ③ 올리기
      $a = if ($postOk) { @('--video', $mp4, '--meta', $meta, '--post') } elseif (-not $lookDone) { @('--look') } else { @('--video', $mp4, '--meta', $meta) }
      $up = @(& node scripts\clip\upload-clip.mjs @a --shots $shots 2>&1 | ForEach-Object { "$_" })
      $code = $LASTEXITCODE
      if ($a -contains '--look' -and $code -eq 0) { 'look done' | Set-Content (Join-Path $repo 'dumps\clip-look-done.txt') }
      $mode = if ($postOk) { '올리기' } elseif ($a -contains '--look') { '화면 살펴보기' } else { '영상·설명 넣고 멈춤(시험)' }
      $res = "$mode · 종료 코드 $code · $($pick.slug) · " + (($up | Select-Object -Last 2) -join ' / ')
    }
  }
}
# 기록 → Drive
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\clip-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($p in @($mp4, $meta)) { if ($p -and (Test-Path $p)) { Copy-Item $p $dest -Force } }
if (Test-Path $shots) { Get-ChildItem $shots -File | Where-Object { $_.Extension -ne '.html' -or $_.Length -lt 3MB } | Copy-Item -Destination $dest -Force }
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $res" | Set-Content -Encoding UTF8 (Join-Path $dest 'result.txt')
if ($postOk -and $code -eq 0) { $res | Set-Content -Encoding UTF8 (Join-Path $lock 'clip.done') }
elseif (-not $postOk) { $res | Set-Content -Encoding UTF8 (Join-Path $lock 'clip-tried.done') }
Write-Output "클립: $res"
exit 0
