# content\calendar\draft-test.txt 에 적힌 글을 그림까지 만들어 네이버 '임시저장'만 한다 (2026-11-03 사용자 — "블로그에 써봐, 발행은 하지 마").
# 발행·예약을 하지 않는다. 원고에 draft_only: 가 있으면 그날 아침 실행도 예약하지 않고(처리 표시를 남김), 없으면 아침 실행이 원래대로 예약한다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$list = Get-Content 'content\calendar\draft-test.txt' -Encoding UTF8 | Where-Object { $_ -match '^\d{4}-\d\d-\d\d\s+\S' }
if (-not $list) { Write-Host '임시저장할 글이 없어요 (content\calendar\draft-test.txt).' -ForegroundColor Yellow; exit 0 }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Wait-MyDrive
foreach ($line in $list) {
  $d, $s = ($line.Trim() -split '\s+')[0, 1]
  Write-Host "`n=== $d $s — 그림 만들고 임시저장 (발행 안 함)" -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'draft-day.ps1') -Date $d -Only $s
  # 그날 아침 실행·켜짐 확인이 '남은 글'로 세지 않게 처리 표시를 남긴다 (예약은 draft_only 로 이미 건너뛴다)
  if ($drive) { $ld = Join-Path $drive "ClaudeWorkspace\run-locks\$d"; New-Item -ItemType Directory -Force -Path $ld | Out-Null; "$env:COMPUTERNAME $(Get-Date -Format 'HH:mm') 확인용 임시저장 (draft-test)" | Out-File (Join-Path $ld "$d-$s.done") -Encoding utf8 }
}
