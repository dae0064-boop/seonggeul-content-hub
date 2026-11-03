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
  $parts = $line.Trim() -split '\s+'
  $d, $s = $parts[0], $parts[1]
  # 세 번째 칸 'thumb' — 대표사진 글씨·자르기만 다시 (그림은 다시 받지 않음, 비용 0). 2026-11-03 계약결혼 대표사진이 잘려서
  if ($parts.Count -ge 3 -and $parts[2] -eq 'thumb') {
    Write-Host "  대표사진을 다시 만듭니다 (잘림 고침)" -ForegroundColor Cyan
    & node scripts/post-images.mjs "content\image-plans\$d-$s.json" --overlay-only --only 1
  }
  # 세 번째 칸 'redo=1,2,5' — 그 번호 그림을 새로 받는다 (2026-11-03 계약결혼 사진이 지난 회차라서)
  if ($parts.Count -ge 3 -and $parts[2] -match '^redo=([\d,]+)$') {
    Write-Host "  그림 $($Matches[1]) 번을 새로 만듭니다" -ForegroundColor Cyan
    & node scripts/post-images.mjs "content\image-plans\$d-$s.json" --force --only $Matches[1]
  }
  Write-Host "`n=== $d $s — 그림 만들고 임시저장 (발행 안 함)" -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'draft-day.ps1') -Date $d -Only $s
  # 그날 아침 실행·켜짐 확인이 '남은 글'로 세지 않게 처리 표시를 남긴다 (예약은 draft_only 로 이미 건너뛴다)
  if ($drive) { $ld = Join-Path $drive "ClaudeWorkspace\run-locks\$d"; New-Item -ItemType Directory -Force -Path $ld | Out-Null; "$env:COMPUTERNAME $(Get-Date -Format 'HH:mm') 확인용 임시저장 (draft-test)" | Out-File (Join-Path $ld "$d-$s.done") -Encoding utf8 }
}
