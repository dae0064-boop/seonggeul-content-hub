# GOMS 광고심의 승인 결과 읽기 (2026-10-26 사용자 — 스레드에 올릴 때 배너에 편마다 준법심의필번호·유효기간을 넣는다)
#   목록에서 승인상태 "승인완료" 인 「스레드 N편」의 심의결과 탭(심의결과·준법심의필번호·유효기간)을 읽어
#   Drive ClaudeWorkspace\goms-approved.tsv 에 한 줄씩 적는다. 이미 적은 편은 다시 열지 않는다. GOMS 에서 아무것도 바꾸지 않는다.
#   아침 auto-day 끝에서 돌고(로그인이 안 되면 건너뜀), launchers\goms-approved.cmd 로 바로 돌릴 수도 있다.
# 배너(content\threads\insurance\banners\thread-N.jpg)는 클라우드 Claude 가 아침 확인 때 이 표로 만든다 (routines\morning-check.md).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬을 켜는 중...'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive(내 드라이브\ClaudeWorkspace)를 찾지 못해 GOMS 승인 결과 읽기를 건너뛰어요.' -ForegroundColor Yellow; exit 0 }
$fileDir = Join-Path $drive 'ClaudeWorkspace\보험글'
$tsv = Join-Path $drive 'ClaudeWorkspace\goms-approved.tsv'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\goms-approved-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host 'GOMS 승인완료 편의 심의필 번호를 읽는 중 (새로 읽는 편마다 20초쯤)...'
$log = @(& node scripts\goms-ad.mjs --file-dir $fileDir --approved --approved-out $tsv --out $out 2>&1 | ForEach-Object { "$_" })
$code = $LASTEXITCODE
$log | ForEach-Object { Write-Host $_ }
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "종료 코드: $code (0 = 끝까지, 2 = 중간에 멈춤, 3 = GOMS 로그인 안 됨)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\goms-approved-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $out '*') $dest -Recurse -Force
if ($code -eq 3) { Write-Host 'GOMS 에 로그인되지 않아 건너뛰었어요 (블로그 발행과는 상관없어요).' -ForegroundColor Gray }
else { Write-Host "`nDrive 에 올렸어요. Claude 에게 '끝' 이라고 말해 주세요." -ForegroundColor Green }
exit 0
