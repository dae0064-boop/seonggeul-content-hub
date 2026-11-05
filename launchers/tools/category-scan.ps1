# 블로그 카테고리 확인 — category-check.cmd 가 부른다 (2026-11-04). 읽기만 한다. 크롬은 끄지 않는다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬을 켜는 중...'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  . (Join-Path $PSScriptRoot 'lib-detach.ps1'); Start-Detached $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', '--restore-last-session', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
$blog = $env:NAVER_BLOG_ID
if (-not $blog) { $blog = [Environment]::GetEnvironmentVariable('NAVER_BLOG_ID', 'User') }
if (-not $blog) { $blog = 'seongdaeeyo' }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\category-scan-$stamp"
Write-Host '내 블로그의 글과 카테고리를 읽는 중... (1~3분)'
& node scripts\naver-category-scan.mjs $blog --out $out 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\run-logs\category-scan-$stamp-$env:COMPUTERNAME"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $out '*') $dest -Force
  Write-Host "`n결과를 Drive 에 올렸어요. Claude 에게 '카테고리 확인 끝났어' 라고 말해 주세요." -ForegroundColor Green
} else {
  Write-Host "`nGoogle Drive 를 찾지 못해 올리지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요." -ForegroundColor Yellow
}
