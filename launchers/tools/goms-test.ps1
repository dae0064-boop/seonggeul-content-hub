# GOMS 광고심의 등록 시험 (2026-10-05 사용자 요청 — "이렇게까지 가능한지 테스트")
# 자동화용 크롬(9222)으로 GOMS 에 들어가 "스레드 11편" 광고등록 칸을 채우고 심의점검표까지 고른 뒤 멈춘다.
# "등록하기"·"등록"은 누르지 않는다. 결과 글자와 캡처를 Drive ClaudeWorkspace\run-logs\goms-test-<날짜_시각>-<PC>\ 에 올린다.
param([int]$Number = 11)
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
if (-not $drive) { Write-Host 'Google Drive(내 드라이브\ClaudeWorkspace)를 찾지 못했어요. Drive 가 켜져 있는지 확인해 주세요.' -ForegroundColor Yellow; exit 1 }
$fileDir = Join-Path $drive 'ClaudeWorkspace\보험글'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\goms-test-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host "GOMS 광고등록 시험 중 — 스레드 $Number편 (1~2분, 등록은 누르지 않아요)..."
$log = & node scripts\goms-ad.mjs --file-dir $fileDir --number $Number --out $out 2>&1 | ForEach-Object { "$_" }
$code = $LASTEXITCODE
$log | ForEach-Object { Write-Host $_ }
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "종료 코드: $code (0 = 끝까지 채움, 2 = 중간에 멈춤, 3 = GOMS 로그인 필요)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\goms-test-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $out '*') $dest -Force
if ($code -eq 3) {
  Write-Host "`nGOMS 로그인이 필요해요. 열린 크롬 창에서 GOMS 에 로그인한 뒤, goms-test 를 다시 더블클릭해 주세요." -ForegroundColor Yellow
} else {
  Write-Host "`nDrive 에 올렸어요. Claude 에게 'GOMS 시험 끝났어' 라고 말해 주세요." -ForegroundColor Green
}
