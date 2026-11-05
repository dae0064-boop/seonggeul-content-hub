# 맛집 후기 임시저장 — matjip.cmd 가 부른다 (2026-11-04 사용자 — "사진을 보내주면 블로그 열어서 너가 직접 써 줄 수 없어?").
# 가장 최근 맛집 원고(content/matjip/posts)를 사진·지도와 함께 네이버에 임시저장한다. 발행은 사용자가 확인하고 직접 누른다. 크롬은 끄지 않는다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬을 켜는 중...'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', '--restore-last-session', 'about:blank'
  for ($i = 0; $i -lt 20 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
try { & (Join-Path $PSScriptRoot 'matjip-watch-setup.ps1') -IfMissing | Out-Null } catch { }  # 15분마다 새 맛집 원고 예약 (2026-11-04)
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive(내 드라이브)를 찾지 못했어요. Drive 가 켜져 있는지 확인해 주세요.' -ForegroundColor Yellow; exit 1 }
$post = Get-ChildItem (Join-Path $repo 'content\matjip\posts\*.md') | Sort-Object Name | Select-Object -Last 1
if (-not $post) { Write-Host '맛집 원고가 없어요. Claude 에게 원고를 먼저 써 달라고 해 주세요.' -ForegroundColor Yellow; exit 1 }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$log = Join-Path $repo "dumps\matjip-$stamp.log"
Write-Host "맛집 글 임시저장 중: $($post.BaseName)  (3~5분, 창을 닫지 마세요)"
& node scripts\matjip-draft.mjs $post.FullName --drive $drive --dump 2>&1 | ForEach-Object { Write-Host $_; Add-Content -Path $log -Value $_ -Encoding UTF8 }  # Tee-Object 는 UTF-16 으로 써서 Drive 에서 글자가 깨졌다
$ok = $LASTEXITCODE -eq 0
# 기록과 화면 캡처를 Drive 로 (HTML 덤프는 올리지 않는다)
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\matjip-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item $log $dest -Force
$dumpDir = Get-ChildItem (Join-Path $repo 'dumps') -Directory | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-15) -and $_.Name -notlike 'matjip' } | Sort-Object LastWriteTime | Select-Object -Last 1
if ($dumpDir) { Get-ChildItem $dumpDir.FullName -Filter '*.png' | Copy-Item -Destination $dest -Force }
if ($ok) {
  Write-Host "`n임시저장했어요. 네이버 블로그 글쓰기 → 오른쪽 위 '저장' 옆 숫자(임시저장 글)에서 열어 확인하고 발행해 주세요." -ForegroundColor Green
} else {
  Write-Host "`n끝까지 못 했어요. Claude 에게 '맛집 임시저장 안 됐어' 라고 말해 주세요 (기록은 Drive 에 올렸어요)." -ForegroundColor Yellow
}
