# 예약 글 다시 하기 — 2026-11-13 사용자 "모두 수정해, 16일부터 다시 진행할거야" (11/16~18 원고 30편이 11/10~11 옛 그림으로 예약돼 있었다).
#   1) 글쓰기 화면 '예약 발행' 목록에서 그 날짜 원고와 제목이 같은 예약 글만 지운다 (한 편 시험 → 목록 다시 읽어 확인 → 나머지, scripts/naver-reserved.mjs --delete)
#   2) 지운 원고의 그림(content\images\<원고>)과 Drive run-locks 의 .done 을 지운다 — 새 그림 지시서(주제 사진·강조 대표사진)로 다시 만들게
#   3) 날짜마다 draft-day.ps1 -Reserve 로 새 그림을 만들어 같은 시각에 다시 예약한다
#   기록은 Drive run-logs\reserved-redo-*. 크롬은 끄지 않는다.
param([string]$Dates = '2026-11-16,2026-11-17,2026-11-18')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>$null
git pull -q --ff-only 2>$null
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
. (Join-Path $PSScriptRoot 'lib-detach.ps1')
$drive = Find-MyDrive
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\reserved-redo-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$logf = Join-Path $out 'redo.log'
function Say($s) { $l = "$(Get-Date -Format 'HH:mm:ss') $s"; Write-Host $l; Add-Content -Path $logf -Value $l -Encoding UTF8 }
function Share { if ($drive) { $dest = Join-Path $drive "ClaudeWorkspace\run-logs\reserved-redo-$stamp-$env:COMPUTERNAME"; New-Item -ItemType Directory -Force -Path $dest | Out-Null; Copy-Item (Join-Path $out '*') $dest -Force -ErrorAction SilentlyContinue } }
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) { Start-AutoChrome -Repo $repo; for ($i = 0; $i -lt 25 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 } }
$blog = $env:NAVER_BLOG_ID; if (-not $blog) { $blog = [Environment]::GetEnvironmentVariable('NAVER_BLOG_ID', 'User') }; if (-not $blog) { $blog = 'seongdaeeyo' }
Say "예약 글 다시 하기 시작 — $Dates"
& node scripts\naver-reserved.mjs $blog --delete --dates $Dates --out $out 2>&1 | ForEach-Object { Say $_ }
$tsv = Join-Path $out 'deleted.tsv'
$rows = @(); if (Test-Path $tsv) { $rows = @(Get-Content $tsv -Encoding UTF8 | Where-Object { $_ } | ForEach-Object { $c = $_ -split "`t"; [pscustomobject]@{ Date = $c[0]; Slug = $c[1] } }) }
if (-not $rows.Count) { Say '지운 예약 글이 없어 다시 예약하지 않아요 (redo.log·캡처 확인)'; Share; exit 0 }
foreach ($r in $rows) {
  $img = Join-Path $repo "content\images\$($r.Slug)"
  if (Test-Path $img) { Remove-Item $img -Recurse -Force -ErrorAction SilentlyContinue }
  if ($drive) { $dn = Join-Path $drive "ClaudeWorkspace\run-locks\$($r.Date)\$($r.Slug).done"; if (Test-Path $dn) { Remove-Item $dn -Force -ErrorAction SilentlyContinue } }
}
Say "지운 예약 글 $($rows.Count)편 — 그림·.done 지움, 새 그림으로 다시 예약 시작"
Share
foreach ($d in @($rows | ForEach-Object { $_.Date } | Sort-Object -Unique)) {
  Say "$d 다시 예약 (draft-day -Reserve)"
  & (Join-Path $PSScriptRoot 'draft-day.ps1') -Reserve -Date $d 2>&1 | Select-Object -Last 15 | ForEach-Object { Say "  $_" }
}
$left = 0; foreach ($r in $rows) { if ($drive -and -not (Test-Path (Join-Path $drive "ClaudeWorkspace\run-locks\$($r.Date)\$($r.Slug).done"))) { $left++ } }
Say "끝 — 다시 예약 $($rows.Count - $left)/$($rows.Count)편 (남은 글은 catchup 13·16·19·22시가 다시 해요)"
Share
