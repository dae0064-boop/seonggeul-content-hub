# 사진 찾기 시험 (2026-11-03) — scripts\photo-test.mjs 결과를 화면에 보이고 Drive ClaudeWorkspace\run-logs\photo-test-<시각>.txt 로 올린다 (키 값은 앞 3·끝 4자만).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
foreach ($n in 'PIXABAY_API_KEY', 'FLICKR_API_KEY', 'PEXELS_API_KEY') { if (-not (Get-Item "env:$n" -ErrorAction SilentlyContinue)) { $v = [Environment]::GetEnvironmentVariable($n, 'User'); if ($v) { Set-Item "env:$n" $v } } }
Write-Host '사진 찾기 시험 중 (1~2분, 그림은 받지 않아요)...' -ForegroundColor Cyan
$log = @(& node scripts\photo-test.mjs 2>&1 | ForEach-Object { Write-Host "$_"; "$_" })
$drive = Find-MyDrive
if ($drive) {
  $dir = Join-Path $drive 'ClaudeWorkspace\run-logs'; New-Item -ItemType Directory -Force -Path $dir | Out-Null
  @("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", '') + $log | Set-Content -Encoding UTF8 (Join-Path $dir "photo-test-$(Get-Date -Format 'yyyy-MM-dd_HHmm').txt")
  Write-Host "`nDrive 에 올렸어요. Claude 에게 '끝' 이라고 말해 주세요." -ForegroundColor Green
} else { Write-Host "`nDrive 를 못 찾았어요. 이 화면을 캡처해서 보내 주세요." -ForegroundColor Yellow }
