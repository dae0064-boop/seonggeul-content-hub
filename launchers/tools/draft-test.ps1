# content\calendar\draft-test.txt 에 적힌 글을 그림까지 만들어 네이버 '임시저장'만 한다 (2026-11-03 사용자 — "블로그에 써봐, 발행은 하지 마").
# 발행·예약을 하지 않고, run-locks 표시도 남기지 않는다 — 그날 아침 실행은 원래대로 예약한다(임시저장본은 공개되지 않으니 확인 뒤 지우면 된다).
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$list = Get-Content 'content\calendar\draft-test.txt' -Encoding UTF8 | Where-Object { $_ -match '^\d{4}-\d\d-\d\d\s+\S' }
if (-not $list) { Write-Host '임시저장할 글이 없어요 (content\calendar\draft-test.txt).' -ForegroundColor Yellow; exit 0 }
foreach ($line in $list) {
  $d, $s = ($line.Trim() -split '\s+')[0, 1]
  Write-Host "`n=== $d $s — 그림 만들고 임시저장 (발행 안 함)" -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'draft-day.ps1') -Date $d -Only $s
}
