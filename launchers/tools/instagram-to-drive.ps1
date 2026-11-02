# 인스타 카드뉴스 Word·카드 그림을 Drive 로 옮긴다 (2026-11-02 사용자 — "드라이브에 올려줘").
#   클라우드 대화는 큰 파일을 Drive 로 못 보내서 저장소(content/instagram/word·images)에 두고, PC 가 옮긴다.
#   Drive: 내 드라이브\ClaudeWorkspace\인스타카드뉴스\<날짜>\  (Word 는 바로 아래, 카드 그림은 <번호>-<이름>\01~07.png)
#   이미 같은 크기의 파일이 있으면 건너뛴다. catchup-reserve.ps1(10·13·16·19·22시)과 auto-day 가 부른다.
$ErrorActionPreference = 'SilentlyContinue'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { return }
$dest = Join-Path $drive 'ClaudeWorkspace\인스타카드뉴스'
# 바탕 AI 사진(편마다 1장, low 약 10원)이 없는 편만 만든다 — 클라우드 대화가 Drive 에서 받아 카드를 다시 그린다
$bgOut = node (Join-Path $repo 'scripts\instagram\make-bg.mjs') --out (Join-Path $dest 'bg') 2>&1 | Select-Object -Last 1
if ($bgOut -match '만듦') { Write-Output "$bgOut" }
$copied = 0
foreach ($srcRoot in @('content\instagram\word', 'content\instagram\images')) {
  $base = Join-Path $repo $srcRoot
  if (-not (Test-Path $base)) { continue }
  Get-ChildItem $base -Recurse -File | Where-Object { $_.Extension -in '.docx', '.png' } | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length + 1)
    $to = Join-Path $dest $rel
    if ((Test-Path $to) -and ((Get-Item $to).Length -eq $_.Length)) { return }
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
    Copy-Item $_.FullName $to -Force
    $copied++
  }
}
if ($copied) { Write-Output "인스타 카드뉴스 $copied 개 파일을 Drive ClaudeWorkspace\인스타카드뉴스 로 옮겼어요." }
