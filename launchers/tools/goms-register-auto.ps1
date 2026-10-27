# 스레드 보험글 GOMS 광고심의 자동 등록 — 하루 10편 (2026-10-26 사용자: "하루에 스레드 10편씩 만들어서 광고 등록").
#   Drive ClaudeWorkspace\보험글 의 「스레드 N편.docx」 중 아직 등록하지 않은 편(goms-done\스레드 N편.done 없음)을 번호 순서로 10편 골라
#   약관 참조 문구를 미리 넣고(반려 9건 중 8건이 이 문구 요구 — 이미 있으면 그대로) scripts\goms-ad.mjs --submit 으로 등록한다.
#   등록한 편은 goms-done 에 .done 이 남아 다시 하지 않는다. GOMS 로그인이 안 되면 아무것도 하지 않는다.
#   아침 auto-day 끝(승인 결과 읽기 다음)에서 돈다. 바로 돌릴 땐 launchers\goms-register.cmd (번호를 직접 고름).
param([int]$Count = 10)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive 를 찾지 못해 GOMS 자동 등록을 건너뛰어요.' -ForegroundColor Yellow; exit 0 }
$fileDir = Join-Path $drive 'ClaudeWorkspace\보험글'
$doneDir = Join-Path $drive 'ClaudeWorkspace\goms-done'
New-Item -ItemType Directory -Force -Path $doneDir | Out-Null
$have = @(Get-ChildItem $fileDir -Filter '스레드 *편.docx' -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Name -match '^스레드 (\d+)편\.docx$') { [int]$Matches[1] } }) | Sort-Object
$done = @(Get-ChildItem $doneDir -Filter '스레드 *편.done' -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Name -match '^스레드 (\d+)편\.done$') { [int]$Matches[1] } })
# 2026-10-27 사용자: "31편부터 80편까지 등록은 11월 1일부터 다시" — 그 전에는 등록하지 않는다.
#   10/27 아침 이 작업이 .done 이 없던 1~10편을 다시 등록하려다 심의점검표에서 멈췄다 → 이미 심의받은 1~30편과
#   승인표(goms-approved.tsv)에 있는 편은 절대 다시 고르지 않는다.
$resumeDate = [datetime]'2026-11-01'
$minNo = 31
if ((Get-Date).Date -lt $resumeDate) { Write-Host "GOMS 자동 등록은 $($resumeDate.ToString('M월 d일'))부터 다시 해요 (사용자 결정) — 오늘은 건너뛰어요"; exit 0 }
$reviewed = @()
$approvedTsv = Join-Path $drive 'ClaudeWorkspace\goms-approved.tsv'
if (Test-Path $approvedTsv) { $reviewed = @(Get-Content $approvedTsv -Encoding UTF8 | ForEach-Object { $c = ($_ -replace '^\uFEFF', '') -split "`t"; if ($c[0] -match '^\d+$') { [int]$c[0] } }) }
$todo = @($have | Where-Object { $_ -ge $minNo -and $done -notcontains $_ -and $reviewed -notcontains $_ } | Select-Object -First $Count)
if (-not $todo.Count) { Write-Host 'GOMS 에 새로 등록할 보험글이 없어요.'; exit 0 }
# 사무실 PC·노트북이 같은 아침에 함께 돌 수 있다 — Drive 표시로 한 대만 등록한다 (2시간 지난 표시는 멈춘 실행으로 보고 무시)
$lock = Join-Path $doneDir 'registering.lock'
if (Test-Path $lock) {
  $age = (Get-Date) - (Get-Item $lock).LastWriteTime
  if ($age.TotalMinutes -lt 120) { Write-Host "다른 PC 가 GOMS 등록 중이라 건너뛰어요 ($(Get-Content $lock -Raw))"; exit 0 }
}
"$env:COMPUTERNAME $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Set-Content -Encoding UTF8 $lock
Start-Sleep -Seconds 20
if (((Get-Content $lock -Raw) -split ' ')[0] -ne $env:COMPUTERNAME) { Write-Host '다른 PC 가 먼저 GOMS 등록을 시작해 건너뛰어요'; exit 0 }
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\goms-register-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host "GOMS 광고심의 자동 등록 — 스레드 $($todo -join ', ')편 (한 편에 1~2분)..."
# 등록 직전에 그 편 Word 를 최신 원고로 다시 만든다 — 밤 작업이 출처를 다시 확인하며 고친 문장이 그대로 올라가게 (2026-10-26)
$log = @(& node scripts\threads\word-make.mjs --out $fileDir --only ($todo -join ',') --force 2>&1 | ForEach-Object { "$_" })
$log += @(& node scripts\threads\word-fix.mjs --dir $fileDir --notice ($todo -join ',') 2>&1 | ForEach-Object { "$_" })
# goms-ad 는 --from ~ --to 사이를 차례로 하며 .done 이 있는 편은 건너뛴다
$log += @(& node scripts\goms-ad.mjs --file-dir $fileDir --submit --from $todo[0] --to $todo[-1] --done-dir $doneDir --out $out 2>&1 | ForEach-Object { "$_" })
$code = $LASTEXITCODE
$log | ForEach-Object { Write-Host $_ }
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "대상: 스레드 $($todo -join ', ')편", "종료 코드: $code (0 = 끝까지, 2 = 중간에 멈춤, 3 = GOMS 로그인 안 됨)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\goms-register-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $out '*') $dest -Recurse -Force
Remove-Item $lock -Force -ErrorAction SilentlyContinue
exit 0
