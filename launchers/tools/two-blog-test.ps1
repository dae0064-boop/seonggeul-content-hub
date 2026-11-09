# 블로그 2개 이어서 작업 시험 (2026-11-09 사용자) — launchers\two-blog-test.cmd 가 부른다.
# 블로그 1 = 지금 자동화용 크롬(9222, seonggeul-chrome), 블로그 2 = 따로 켜는 크롬(9223, blog2-chrome).
# 한 크롬에서 로그아웃·다시 로그인하지 않는다 — 블로그 1 로그인 유지가 풀리고 매번 비밀번호·보안문자가 필요해진다.
# 블로그 2 크롬에 로그인이 없으면 로그인 화면을 열고 10분 기다린다(처음 한 번만 사람이 로그인).
# 결과 글자·캡처는 Drive ClaudeWorkspace\run-logs\two-blog-test-<날짜_시각>-<PC>\ 로 → Claude 가 읽는다. 글은 쓰지 않는다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-detach.ps1')
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
function CdpUp($port) { try { Invoke-RestMethod "http://localhost:$port/json/version" -TimeoutSec 3 | Out-Null; $true } catch { $false } }
foreach ($c in @(@{ Port = 9222; Profile = 'seonggeul-chrome'; Name = '블로그 1' }, @{ Port = 9223; Profile = 'blog2-chrome'; Name = '블로그 2' })) {
  if (CdpUp $c.Port) { continue }
  Write-Host "$($c.Name)용 크롬을 켜는 중..."
  Start-Detached $chrome -ArgumentList "--remote-debugging-port=$($c.Port)", "--user-data-dir=$env:LOCALAPPDATA\$($c.Profile)", '--no-first-run', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp $c.Port); $i++) { Start-Sleep -Seconds 1 }
}
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\two-blog-test-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host ''
Write-Host '블로그 1 → 블로그 2 → 블로그 1 순서로 글쓰기 화면을 열어 보는 중... (1~2분)' -ForegroundColor Cyan
Write-Host '블로그 2 크롬에 네이버 로그인 화면이 뜨면, 그 창에서 블로그 2 아이디로 로그인해 주세요 ("로그인 상태 유지" 체크).' -ForegroundColor Yellow
$log = & node scripts\two-blog-test.mjs --ports 9222,9223 --shots $out --wait-login 600 2>&1 | ForEach-Object { "$_" }
$code = $LASTEXITCODE
$log | ForEach-Object { Write-Host $_ }
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "종료 코드: $code (0 = 성공, 3 = 로그인 필요, 4 = 같은 아이디, 2 = 화면 확인 못 함, 1 = 크롬에 못 붙음)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive) {
  $dest = Join-Path $drive "ClaudeWorkspace\run-logs\two-blog-test-$stamp-$env:COMPUTERNAME"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $out '*') $dest -Force
  Write-Host "`n결과를 Drive 에 올렸어요." -ForegroundColor Green
} else { Write-Host "`nGoogle Drive 를 찾지 못해 올리지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요." -ForegroundColor Yellow }
Write-Host ''
switch ($code) {
  0 { Write-Host '성공 — 두 블로그 모두 다시 로그인 없이 이어서 작업할 수 있어요. 크롬 창 두 개는 닫지 말고 두세요.' -ForegroundColor Green }
  3 { Write-Host '블로그 2 로그인을 10분 안에 마치지 못했어요. 이 창을 닫고 다시 더블클릭해 주세요.' -ForegroundColor Yellow }
  4 { Write-Host '두 크롬이 같은 아이디예요. 블로그 2 크롬 창에서 로그아웃하고 블로그 2 아이디로 로그인한 뒤 다시 더블클릭해 주세요.' -ForegroundColor Yellow }
  default { Write-Host 'Claude 에게 "블로그 2개 시험 끝났어" 라고 말해 주세요. Drive 결과를 보고 고칩니다.' -ForegroundColor Yellow }
}
