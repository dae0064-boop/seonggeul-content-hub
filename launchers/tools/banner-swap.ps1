# 새 배너로 Drive Word 전부 바꾸기 (2026-11-03 사용자 — "워드에 들어간 모든 배너 사진 새 배너로, 앞으로 심의 올릴 때·받았을 때 모두 이 배너")
#   ① 보험글\스레드 N편.docx (심의 올리는 원본) 배너 → 새 배너 자리표시 판(banners\base.jpg)
#   ② 보험글-심의필\스레드 N편.docx 다시 (편별 심의필 배너 thread-N.jpg)
#   ③ 보험글-사진 에 새 배너를 가장 최근 사진으로 (Python 으로 Word 를 만드는 PC 도 새 배너를 쓰게)
#   기록: Drive run-logs\banner-swap-<시각>.txt. 문제가 없으면 Drive 보험글\banner-swap-d-warm.txt 를 남겨 다시 하지 않는다 (catchup-reserve 가 부른다)
param([switch]$IfNeeded)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive 를 못 찾았어요'; exit 1 }
$word = Join-Path $drive 'ClaudeWorkspace\보험글'
$marker = Join-Path $word 'banner-swap-d-warm.txt'
if ($IfNeeded -and (Test-Path $marker)) { exit 0 }
$base = Join-Path $repo 'content\threads\insurance\banners\base.jpg'
$log = @("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "코드: $(git rev-parse --short HEAD 2>$null)", '')
$photoDir = Join-Path $drive 'ClaudeWorkspace\보험글-사진'
New-Item -ItemType Directory -Force -Path $photoDir | Out-Null
Copy-Item $base (Join-Path $photoDir '배너-2026-11-03-새디자인.jpg') -Force
(Get-Item (Join-Path $photoDir '배너-2026-11-03-새디자인.jpg')).LastWriteTime = Get-Date
$log += '보험글-사진: 배너-2026-11-03-새디자인.jpg 넣음'
$log += @(& node scripts\threads\word-banner.mjs --word-dir $word --placeholder $base 2>&1 | ForEach-Object { "$_" }); $ok1 = $LASTEXITCODE -eq 0
$log += @(& node scripts\threads\word-banner.mjs --word-dir $word --out-dir (Join-Path $drive 'ClaudeWorkspace\보험글-심의필') 2>&1 | ForEach-Object { "$_" })
$log | ForEach-Object { Write-Host $_ }
$dir = Join-Path $drive 'ClaudeWorkspace\run-logs'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$log | Set-Content -Encoding UTF8 (Join-Path $dir "banner-swap-$(Get-Date -Format 'yyyy-MM-dd_HHmm').txt")
if ($ok1) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] 새 배너로 바꿈" | Set-Content -Encoding UTF8 $marker }
($log | Where-Object { $_ -like '원본 Word 배너*' -or $_ -like '심의필 Word*' }) -join ' / '
