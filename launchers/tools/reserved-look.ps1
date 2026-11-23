# 예약 글 찾기 — reserved-look.cmd 가 부른다 (2026-11-13, 11/16~18 다시 예약 준비). 읽기만 한다. 크롬은 끄지 않는다.
param([switch]$Chulgeo, [string]$Dates = '')
# -Chulgeo -Dates 2026-11-23 : 철거 블로그(breakandbuild, 크롬 9223) 예약 목록을 읽어 그 날짜 철거 원고가 몇 번씩 예약돼 있는지 본다 (2026-11-23 중복 예약 뒤 확인용, 읽기만)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
# 날짜 지정 예약·철거 예약이 같은 크롬을 쓰는 중이면 끝날 때까지 기다린다 (최대 3시간)
for ($k = 0; $Chulgeo -and $k -lt 180; $k++) {
  $busy = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'reserve-dates\.ps1|chulgeo-day\.ps1|draft-day\.ps1|tistory-day\.ps1' })
  if (-not $busy.Count) { break }
  Start-Sleep -Seconds 60
}
$Port = if ($Chulgeo) { 9223 } else { 9222 }
function CdpUp { try { Invoke-RestMethod "http://localhost:$Port/json/version" -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if ($Chulgeo -and -not (CdpUp)) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  . (Join-Path $PSScriptRoot 'lib-detach.ps1'); Start-AutoChrome $chrome -Port $Port -UserDataDir (Join-Path $env:LOCALAPPDATA 'blog2-chrome')
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬을 켜는 중...'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  . (Join-Path $PSScriptRoot 'lib-detach.ps1'); Start-AutoChrome $chrome
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
$blog = $env:NAVER_BLOG_ID
if (-not $blog) { $blog = [Environment]::GetEnvironmentVariable('NAVER_BLOG_ID', 'User') }
if (-not $blog) { $blog = 'seongdaeeyo' }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\reserved-look-$stamp"
Write-Host '예약 글을 찾는 중... (1~2분, 아무것도 바꾸지 않아요)'
if ($Chulgeo) {
  $stamp = "chulgeo-$stamp"; $out = Join-Path $repo "dumps\reserved-look-$stamp"
  & node scripts\naver-reserved.mjs breakandbuild --list --dates $Dates --dir content/chulgeo/posts --cdp "http://localhost:$Port" --out $out 2>&1 | ForEach-Object { Write-Host $_ }
} else {
  & node scripts\naver-reserved.mjs $blog --look --out $out 2>&1 | ForEach-Object { Write-Host $_ }
}
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\run-logs\reserved-look-$stamp-$env:COMPUTERNAME"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $out '*') $dest -Force
  Write-Host "`n결과를 Drive 에 올렸어요. Claude 에게 '예약 글 찾기 끝났어' 라고 말해 주세요." -ForegroundColor Green
} else {
  Write-Host "`nGoogle Drive 를 찾지 못해 올리지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요." -ForegroundColor Yellow
}
