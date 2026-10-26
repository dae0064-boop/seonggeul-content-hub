# 구글 색인 확인 — index-check.cmd 가 부른다 (2026-10-26). 읽기만 한다. 크롬은 끄지 않는다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬을 켜는 중...'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
$blog = $env:TISTORY_BLOG
if (-not $blog) { $blog = [Environment]::GetEnvironmentVariable('TISTORY_BLOG', 'User') }
if (-not $blog) { $blog = 'seongdaeeyo' }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\index-check-$stamp"
Write-Host '구글 서치 콘솔과 사이트맵을 읽는 중... (1분쯤)'
& node scripts\tistory-stats.mjs $blog --index-only --out $out 2>&1 | ForEach-Object { Write-Host $_ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\run-logs\index-check-$stamp-$env:COMPUTERNAME"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $out '*') $dest -Force
  Write-Host "`n결과를 Drive 에 올렸어요. Claude 에게 '색인 확인 끝났어' 라고 말해 주세요." -ForegroundColor Green
} else {
  Write-Host "`nGoogle Drive 를 찾지 못해 올리지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요." -ForegroundColor Yellow
}
$login = $false
try { $login = (Get-Content (Join-Path $out 'index-check.json') -Raw -Encoding UTF8 | ConvertFrom-Json).searchConsole | Where-Object { $_.login } } catch {}
if ($login) {
  Write-Host "`n자동화용 크롬이 구글에 로그인돼 있지 않아요. 크롬에 새로 열린 서치 콘솔 탭에서 구글 로그인만 하고," -ForegroundColor Yellow
  Write-Host '이 파일(index-check.cmd)을 한 번 더 더블클릭해 주세요. 크롬 창은 닫지 마세요.' -ForegroundColor Yellow
}
