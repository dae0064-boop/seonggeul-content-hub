# 이 PC 에서 스레드 보험글 자동 올리기·GOMS 자동 등록이 돌게 준비한다 — launchers\threads-laptop.cmd 가 부른다 (2026-10-26).
#   1) Google Drive(ClaudeWorkspace) 연결 확인  2) 스레드 연결 키(없으면 threads-key.ps1)
#   3) 하루 5번 올리기 등록(threads-setup.ps1 — 아침 실행이 09:15 인 노트북은 5분 뒤)  4) 자동화용 크롬의 GOMS 로그인 확인(읽기만)
#   사무실 PC 와 함께 켜져 있어도 겹치지 않는다: 스레드는 올리기 전에 내 글을 되읽어 보고, GOMS 등록은 Drive 표시로 한 대만 한다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
function Ok($s)   { Write-Host "  [OK] $s" -ForegroundColor Green }
function Bad($s)  { Write-Host "  [X]  $s" -ForegroundColor Red }
function Info($s) { Write-Host "       $s" }
$fail = 0
Write-Host ''
Write-Host '  ==============================================='
Write-Host '    이 PC 에서 스레드·GOMS 준비'
Write-Host '  ==============================================='

Write-Host "`n  1/4  Google Drive"
$drive = Find-MyDrive
if ($drive -and (Test-Path (Join-Path $drive 'ClaudeWorkspace\보험글'))) {
  $words = @(Get-ChildItem (Join-Path $drive 'ClaudeWorkspace\보험글') -Filter '스레드 *편.docx' -ErrorAction SilentlyContinue).Count
  Ok "연결돼 있어요 ($drive) — 보험글 Word $words 개"
} else {
  Bad 'Google Drive 의 ClaudeWorkspace\보험글 폴더를 찾지 못했어요.'
  Info '화면 오른쪽 아래 Google Drive 아이콘을 눌러 로그인돼 있는지 보고, 다시 더블클릭해 주세요.'
  $fail++
}

Write-Host "`n  2/4  스레드 연결 키"
if ([Environment]::GetEnvironmentVariable('THREADS_ACCESS_TOKEN', 'User')) { Ok '이 PC 에 있어요.' }
else {
  Info '이 PC 에는 아직 없어요. 키 넣는 화면으로 넘어가요.'
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'threads-key.ps1')
  if ([Environment]::GetEnvironmentVariable('THREADS_ACCESS_TOKEN', 'User')) { Ok '키를 넣었어요.' } else { Bad '키가 없어요 — 이 PC 는 스레드에 올리지 못해요(사무실 PC 가 올려요).'; $fail++ }
}

Write-Host "`n  3/4  하루 5번 자동 올리기 등록"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'threads-setup.ps1')

Write-Host "`n  4/4  GOMS 로그인 (자동화용 크롬)"
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
$out = Join-Path $repo "dumps\goms-login-$(Get-Date -Format 'yyyy-MM-dd_HHmm')"
New-Item -ItemType Directory -Force -Path $out | Out-Null
# Drive 의 승인 결과 표를 그대로 쓴다 — 이미 읽은 편은 다시 열지 않아 빠르다 (아침 승인 결과 읽기와 같은 일)
$tsv = if ($drive) { Join-Path $drive 'ClaudeWorkspace\goms-approved.tsv' } else { Join-Path $out 'check.tsv' }
$fileDir = if ($drive) { Join-Path $drive 'ClaudeWorkspace\보험글' } else { $out }
for ($try = 1; $try -le 2; $try++) {
  Info 'GOMS 에 들어가 보는 중 (1분쯤, 아무것도 바꾸지 않아요)...'
  & node scripts\goms-ad.mjs --file-dir $fileDir --approved --approved-out $tsv --out $out 2>&1 | ForEach-Object { "$_" } | Out-File -Encoding utf8 (Join-Path $out 'log.txt')
  $code = $LASTEXITCODE
  if ($code -ne 3) { break }
  if ($try -eq 2) { break }
  Bad 'GOMS 에 로그인돼 있지 않아요.'
  Info '방금 열린 크롬 창(자동화용)에서 GOMS 에 아이디·비밀번호로 로그인해 주세요.'
  Info '"아이디 저장"·"자동 로그인" 칸이 있으면 체크해 주세요.'
  try { Invoke-RestMethod -Method Put 'http://localhost:9222/json/new?https://www.globalgoms.co.kr/' -TimeoutSec 5 | Out-Null } catch {}
  Read-Host '  로그인을 마쳤으면 이 창으로 돌아와 Enter'
}
if ($code -eq 0) { Ok 'GOMS 로그인 돼 있어요.' }
elseif ($code -eq 3) { Bad 'GOMS 로그인이 아직 안 돼요 — 이 PC 는 GOMS 등록을 건너뛰어요(사무실 PC 가 해요).'; $fail++ }
else { Bad "GOMS 확인이 중간에 멈췄어요 (코드 $code). 화면 캡처를 Claude 에게 보내 주세요."; $fail++ }

if ($drive) {
  $dest = Join-Path $drive "ClaudeWorkspace\run-logs\threads-laptop-$(Get-Date -Format 'yyyy-MM-dd_HHmm')-$env:COMPUTERNAME"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  @("PC: $env:COMPUTERNAME", "문제 수: $fail", "GOMS 코드: $code") | Set-Content -Encoding UTF8 (Join-Path $dest 'result.txt')
  Copy-Item (Join-Path $out 'log.txt') $dest -ErrorAction SilentlyContinue
}
Write-Host ''
if ($fail) { Write-Host "  준비 중 $fail 가지가 안 됐어요 (위 [X] 줄). 고친 뒤 다시 더블클릭하면 돼요." -ForegroundColor Yellow }
else { Write-Host '  다 됐어요. 이 PC 도 스레드 올리기·GOMS 등록을 할 수 있어요. Claude 에게 "끝" 이라고 말해 주세요.' -ForegroundColor Green }
exit 0
