# GOMS 광고심의 반려 재심사 (2026-10-26 사용자 요청 — "반려가 난 글은 심의결과의 수정요구 문구를 넣어 파일을 바꿔 다시 올린다")
#   1) 목록에서 승인상태 "반려" 인 「스레드 N편」의 심의결과(심의의견)를 읽어 넣을 문구를 Drive ClaudeWorkspace\goms-fixes.tsv 에 적는다
#   2) insurance-word.ps1 이 그 문구를 본문 아래 빨간 글씨로 넣어 Word 를 다시 만든다 (Drive ClaudeWorkspace\보험글\스레드 N편.docx)
#   3) 상세정보 "등록" 탭 → 첨부파일 네모칸 체크 → 파일삭제 → 파일추가(새 Word) → 수정
# 기본은 시험 — 3) 에서 네모칸 체크까지만 하고 멈춘다. -Submit 이면 실제로 다시 올린다 (launchers\goms-revise.cmd).
# 결과 글자·캡처·사유는 Drive ClaudeWorkspace\run-logs\goms-revise-<날짜_시각>-<PC>\ 로 올린다.
param([switch]$Submit)
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
$fixes = Join-Path $drive 'ClaudeWorkspace\goms-fixes.tsv'
$doneDir = Join-Path $drive 'ClaudeWorkspace\goms-done'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\goms-revise-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null

# 실제 GOMS 에서 파일삭제·수정을 처음 돌릴 때는 한 편만 올려 확인한다 (2026-10-26) — 시작할 때 한 번만 묻는다
if ($Submit) { $lim = Read-Host '몇 편 다시 올릴까요? (그냥 Enter = 1편, 모두는 0)'; if (-not $lim) { $lim = '1' } }
Write-Host '1/3 GOMS 반려 건의 심의결과를 읽는 중 (한 편에 30초쯤)...'
$log = @(& node scripts\goms-ad.mjs --file-dir $fileDir --revise --scan --fixes $fixes --out "$out\scan" 2>&1 | ForEach-Object { "$_" })
$code = $LASTEXITCODE
if ($code -eq 0) {
  Write-Host '2/3 수정 문구를 넣어 Word 를 다시 만드는 중...'
  $log += & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'insurance-word.ps1') 2>&1 | ForEach-Object { "$_" }
  # Python 이 없는 PC(사무실 PC)는 위에서 Word 를 다시 만들지 못한다 — 이미 있는 Word 에 문구만 직접 넣는다 (있으면 그대로 둠)
  $log += & node scripts\threads\word-fix.mjs --dir $fileDir --fixes $fixes 2>&1 | ForEach-Object { "$_" }
  Write-Host $(if ($Submit) { '3/3 고친 Word 로 다시 올리는 중 (한 편에 1분쯤)...' } else { '3/3 시험 — 첫 편의 첨부파일 네모칸 체크까지만 해요 (삭제·수정은 누르지 않아요)...' })
  $nodeArgs = @('scripts\goms-ad.mjs', '--file-dir', $fileDir, '--revise', '--fixes', $fixes, '--done-dir', $doneDir, '--out', "$out\revise")
  if ($Submit) {
    $nodeArgs += '--submit'
    $nodeArgs += @('--limit', $lim)
  }
  $log += & node @nodeArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
}
$log | ForEach-Object { Write-Host $_ }
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "종료 코드: $code (0 = 끝까지, 2 = 중간에 멈춤, 3 = GOMS 로그인 안 됨)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\goms-revise-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $out '*') $dest -Recurse -Force
if ($code -eq 3) {
  Write-Host "`nLOGIN 을 눌러도 GOMS 에 들어가지지 않았어요. 열린 크롬 창에서 아이디·비밀번호가 채워져 있는지 보고 LOGIN 을 한 번 눌러 들어간 뒤, 다시 더블클릭해 주세요." -ForegroundColor Yellow
} else {
  Write-Host "`nDrive 에 올렸어요. Claude 에게 '끝' 이라고 말해 주세요." -ForegroundColor Green
}
