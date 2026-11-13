# 내 블로그 댓글을 읽기만 하고 Drive research/comments/<날짜>/ 로 올린다 (2026-11-13 사용자 "다 진행해줘").
# 아침 확인(클라우드)이 이걸 읽어 답글 초안을 Drive comment-replies/<날짜>.md 에 쓴다. 답글은 사용자가 단다 — 자동으로 달지 않는다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$date = Get-Date -Format 'yyyy-MM-dd'
$out = "dumps\blog-comments\$date"
if (Test-Path (Join-Path $out 'comments.md')) { exit 0 }  # 오늘 이미 했음
Write-Host "`n[내 블로그 댓글 읽기]" -ForegroundColor Cyan
& node scripts/blog-comments.mjs seongdaeeyo --out $out 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\research\comments\$date"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  Write-Host "Drive 로 올렸어요: $dest" -ForegroundColor Green
}
