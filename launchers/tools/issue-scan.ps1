# 아침 이슈 모으기 — 작업 스케줄러 SeonggeulIssueScan 이 매일 06:50 에 부른다(절전이면 깨움, 꺼져 있으면 켤 때) (2026-11-02 사용자).
# 구글 트렌드·네이버 연예 랭킹·많이 본 뉴스를 읽어 Drive ClaudeWorkspace\issues\<날짜>\ 로 올린다.
# 07:17 클라우드 작업(routines/issue-morning.md)이 이걸 읽고 오늘 이슈 글 4편을 쓴다. 다른 PC 가 이미 올렸으면 건너뛴다.
. (Join-Path $PSScriptRoot 'lib-boot.ps1'); Exit-IfJustBooted '이슈 모으기'   # 2026-11-12 사용자: 껐다 켰을 때 뜨는 창 빼기
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Wait-MyDrive 180
$date = Get-Date -Format 'yyyy-MM-dd'
if ($drive) {
  $dest = Join-Path $drive "ClaudeWorkspace\issues\$date"
  if (Test-Path (Join-Path $dest 'issues.json')) { Write-Host '오늘 이슈는 이미 모였어요 (다른 PC).'; exit 0 }
}
git fetch -q origin 2>$null
git checkout -q -- 'content/posts/*.json' 'content/tistory/*.json' 'content/tistory/*.html' 2>$null
git pull -q --ff-only 2>$null
New-Item -ItemType Directory -Force -Path 'dumps' | Out-Null
$base = "dumps\issues-$date"
& node scripts/issue-scan.mjs --out $base 2>&1 | ForEach-Object { Write-Host $_ }
if ($drive -and (Test-Path "$base.json")) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item "$base.json" (Join-Path $dest 'issues.json') -Force
  Copy-Item "$base.txt" (Join-Path $dest 'issues.txt') -Force
  Write-Host "Drive 로 올렸어요: $dest" -ForegroundColor Green
} elseif (-not $drive) { Write-Host 'Google Drive 를 찾지 못해 올리지 못했어요.' -ForegroundColor Yellow }
