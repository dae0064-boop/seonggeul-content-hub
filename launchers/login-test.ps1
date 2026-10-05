# 로그인 시험 (2026-10-05 사용자: "나 말고 너가 로그인 되는지 테스트 해보자")
# 자동 예약발행과 똑같이 자동화용 크롬(9222)에 붙어 네이버 블로그 글쓰기·티스토리 관리 화면을 실제로 열어 본다.
# 결과 글자와 캡처를 Drive ClaudeWorkspace\run-logs\login-test-<날짜_시각>-<PC>\ 에 올린다 → Claude 가 Drive 로 읽는다.
# 글을 쓰거나 저장하지 않는다. 크롬은 끄지 않는다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path $PSScriptRoot -Parent
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
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\login-test-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host '네이버 글쓰기·티스토리 관리 화면을 열어 보는 중... (1분쯤)'
$log = & node scripts\login-check.mjs --shots $out 2>&1 | ForEach-Object { "$_" }
$code = $LASTEXITCODE
$log | ForEach-Object { Write-Host $_ }
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "종료 코드: $code (0 = 모두 로그인됨, 3 = 로그인 필요, 2 = 화면을 못 열어 확인 못 함)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive) {
  $dest = Join-Path $drive "ClaudeWorkspace\run-logs\login-test-$stamp-$env:COMPUTERNAME"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $out '*') $dest -Force
  Write-Host "`nDrive 에 올렸어요. Claude 에게 '로그인 시험 끝났어' 라고 말해 주세요." -ForegroundColor Green
} else {
  Write-Host "`nGoogle Drive 를 찾지 못해 올리지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요." -ForegroundColor Yellow
}
