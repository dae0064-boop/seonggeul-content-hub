# GOMS 로그인 + 휴대폰 인증 (2026-11-03 사용자 — "너가 [인증번호 받기]를 누르고, 내가 받은 번호를 Claude 에 입력하면 인증까지 되는지", 아침 9시 시험)
#   지금은 시험 — 사용자가 아침 9시에 launchers\goms-login.cmd 를 더블클릭한다 (매일 저절로 돌릴지는 시험 결과를 보고 정한다).
#   1) 자동화용 크롬에서 GOMS 를 열고 LOGIN (크롬이 아이디·비밀번호를 채워 둔다)
#   2) 휴대폰 인증 칸이 나오면 [인증번호받기] → 문자가 곰스에 등록된 사용자 휴대폰으로 간다
#   3) 사용자가 Claude 대화에 "GOMS 인증번호 123456" 이라고 쓰면 Claude 가 Drive ClaudeWorkspace\goms-otp\code.txt 로 저장
#      → 이 PC 로 내려오면(보통 수십 초) 그 번호를 넣고 [확인]. 최대 6분 기다린다. 틀리면 새 번호를 두 번 더 받는다.
#   4) 결과: Drive goms-otp\result.txt (한 줄) + run-logs\goms-login-otp-<시각>-<PC>\ (화면 캡처·기록). 번호는 기록에 남기지 않는다.
#   이미 로그인돼 있으면 문자를 보내지 않고 "인증 없이 로그인 상태" 로 끝낸다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
# 2026-11-12 사용자 "곰스 로그인도 따로 이야기하지 않으면 자동으로 켜지 말아줘": 작업 스케줄러가 이 파일을 바로 부른 것(예전 08:30 SeonggeulGomsLogin)이면 그 작업을 지우고 끝낸다.
# "심의 올려줘" 요청(goms-request.ps1 안에서 부름)과 goms-login.cmd 더블클릭은 그대로 돈다.
$me = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue
$myParent = (Get-CimInstance Win32_Process -Filter "ProcessId=$($me.ParentProcessId)" -ErrorAction SilentlyContinue).Name
if ($me.CommandLine -match 'goms-login\.ps1' -and $myParent -eq 'svchost.exe') {
  Unregister-ScheduledTask -TaskName 'SeonggeulGomsLogin' -Confirm:$false -ErrorAction SilentlyContinue
  exit 0
}
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬을 켜는 중...'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  . (Join-Path $PSScriptRoot 'lib-detach.ps1'); Start-AutoChrome $chrome
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
$drive = Wait-MyDrive 180
if (-not $drive) { Write-Host 'Google Drive(내 드라이브\ClaudeWorkspace)를 찾지 못해 인증번호를 받을 수 없어요 — GOMS 인증을 건너뛰어요.' -ForegroundColor Yellow; exit 0 }
$otpDir = Join-Path $drive 'ClaudeWorkspace\goms-otp'
New-Item -ItemType Directory -Force -Path $otpDir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\goms-login-otp-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Remove-Item (Join-Path $otpDir 'result.txt') -ErrorAction SilentlyContinue
Write-Host ''
Write-Host 'GOMS 로그인 중 — 휴대폰 인증이 나오면 문자를 요청해요.' -ForegroundColor Cyan
Write-Host '문자가 오면 Claude 대화에  GOMS 인증번호 123456  처럼 적어 주세요 (최대 6분 기다려요).' -ForegroundColor Cyan
Write-Host ''
$log = @(& node scripts\goms-ad.mjs --login-only --otp-dir $otpDir --out $out 2>&1 | ForEach-Object { Write-Host $_; "$_" })
$code = $LASTEXITCODE
$res = Join-Path $otpDir 'result.txt'
if (-not (Test-Path $res)) {
  $line = switch ($code) { 0 { '성공 — 인증 없이 이미 로그인 상태였어요 (문자 안 보냄)' } 3 { '실패 — 로그인되지 않았어요 (휴대폰 인증 칸도 못 찾음)' } default { "실패 — 중간에 멈췄어요 (종료 코드 $code)" } }
  @($line, "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "PC: $env:COMPUTERNAME") | Set-Content -Encoding UTF8 $res
}
Remove-Item (Join-Path $otpDir 'waiting.txt') -ErrorAction SilentlyContinue
Get-ChildItem $otpDir -Filter 'code*.txt' -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "종료 코드: $code (0 = 로그인됨, 2 = 중간에 멈춤, 3 = 로그인 안 됨)", "결과: $(Get-Content $res -TotalCount 1)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\goms-login-otp-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $out '*') $dest -Recurse -Force
Write-Host "`n$(Get-Content $res -TotalCount 1)" -ForegroundColor Green
exit 0
