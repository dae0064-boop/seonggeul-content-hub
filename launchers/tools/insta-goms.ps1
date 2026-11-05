# 인스타 카드뉴스 GOMS 광고심의 — 자동 등록 + 승인 결과 읽기 (2026-11-02 사용자 — "보험심의를 자동으로 올리는 걸 진행").
#   ① 저장소 content\instagram\word\<날짜>\「인스타 카드뉴스 N편.docx」를 Drive ClaudeWorkspace\인스타심의\ 로 모은다
#      (이미 등록한 편의 Word 는 덮어쓰지 않는다 — 심의받은 그 파일이 게시 글의 정본이다)
#   ② GOMS 승인완료 「인스타 카드뉴스 N편」의 심의필 번호·유효기간 → Drive ClaudeWorkspace\goms-approved-insta.tsv
#   ③ 아직 안 올린 편을 번호 순서로 하루 $Count 편까지 GOMS 에 등록 (goms-done-insta\인스타 카드뉴스 N편.done 이 남는다)
#   스레드 보험글(goms-approved.ps1·goms-register-auto.ps1)과 따로 돈다 — 스레드 PAUSE 와 상관없고, content\instagram\PAUSE 로 멈춘다.
#   아침 auto-day 끝에서 돈다. 바로 돌릴 땐 launchers\insta-now.cmd. GOMS 로그인이 안 되면 아무것도 하지 않는다.
param([int]$Count = 3, [switch]$NoRegister)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
if (Test-Path (Join-Path $repo 'content\instagram\PAUSE')) { Write-Host '인스타 멈춤(content\instagram\PAUSE) — 건너뛰어요'; exit 0 }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive 를 찾지 못해 인스타 심의를 건너뛰어요.' -ForegroundColor Yellow; exit 0 }
$prefix = '인스타 카드뉴스'
$fileDir = Join-Path $drive 'ClaudeWorkspace\인스타심의'
$doneDir = Join-Path $drive 'ClaudeWorkspace\goms-done-insta'
$tsv = Join-Path $drive 'ClaudeWorkspace\goms-approved-insta.tsv'
New-Item -ItemType Directory -Force -Path $fileDir, $doneDir | Out-Null

# 바탕 AI 사진(content\instagram\bg\<slug>.png)이 아직 없는 편은 임시 바탕으로 그려진 Word 라 모으지 않는다 (2026-11-03 —
# 심의받은 Word 가 정본이라, 임시 바탕 그대로 등록되면 나중에 바탕을 바꿀 수 없다). 클라우드가 바탕을 넣어 다시 그리면 그때 모인다.
$noBg = @{}
Get-ChildItem (Join-Path $repo 'content\instagram\sets') -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
  try { (Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).posts | ForEach-Object {
    if ($_.bg_prompt -and -not (Test-Path (Join-Path $repo "content\instagram\bg\$($_.slug).png"))) { $noBg[[int]$_.no] = $_.slug } } } catch {}
}
# ① Word 모으기
Get-ChildItem (Join-Path $repo 'content\instagram\word') -Recurse -Filter "$prefix *편.docx" -ErrorAction SilentlyContinue | ForEach-Object {
  $to = Join-Path $fileDir $_.Name
  if (Test-Path (Join-Path $doneDir ($_.BaseName + '.done'))) { return }   # 등록한 편은 그대로
  if ($_.Name -match '(\d+)편\.docx$' -and $noBg.ContainsKey([int]$Matches[1])) { Write-Host "바탕 사진 기다림: $($_.Name) ($($noBg[[int]$Matches[1]])) — 아직 등록하지 않아요"; return }
  if ((Test-Path $to) -and ((Get-Item $to).Length -eq $_.Length)) { return }
  Copy-Item $_.FullName $to -Force
  Write-Host "Word 모음: $($_.Name)"
}
$have = @(Get-ChildItem $fileDir -Filter "$prefix *편.docx" -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Name -match '(\d+)편\.docx$') { [int]$Matches[1] } }) | Sort-Object
if (-not $have.Count) { Write-Host '인스타 카드뉴스 Word 가 아직 없어요.'; exit 0 }

function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', '--restore-last-session', 'about:blank'
  for ($i = 0; $i -lt 45 -and -not (CdpUp); $i++) { Start-Sleep -Seconds 1 }
}
# 2026-11-03: 11:40 실행이 크롬에 붙지 못해 4~6편 등록을 못 함 — 크롬이 안 뜨면 GOMS 단계로 가지 않고 이유를 크게 알린다
if (-not (CdpUp)) {
  Write-Host '자동화용 크롬이 열리지 않았어요. 작업 표시줄의 크롬 창을 모두 닫고(오른쪽 아래 숨은 아이콘의 크롬도 종료) 다시 더블클릭해 주세요.' -ForegroundColor Yellow
  exit 0
}
# 두 PC 가 함께 돌면 한 대만 (2시간 지난 표시는 멈춘 실행으로 보고 무시)
$lock = Join-Path $doneDir 'running.lock'
if ((Test-Path $lock) -and (((Get-Date) - (Get-Item $lock).LastWriteTime).TotalMinutes -lt 120)) { Write-Host "다른 PC 가 인스타 심의 작업 중이라 건너뛰어요 ($(Get-Content $lock -Raw))"; exit 0 }
"$env:COMPUTERNAME $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Set-Content -Encoding UTF8 $lock
Start-Sleep -Seconds 15
if (((Get-Content $lock -Raw) -split ' ')[0] -ne $env:COMPUTERNAME) { Write-Host '다른 PC 가 먼저 시작해 건너뛰어요'; exit 0 }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $repo "dumps\insta-goms-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
# ② 승인 결과 읽기 (아무것도 바꾸지 않음)
Write-Host 'GOMS 인스타 카드뉴스 승인 결과 읽는 중...'
$log = @(& node scripts\goms-ad.mjs --prefix $prefix --file-dir $fileDir --approved --approved-out $tsv --out (Join-Path $out 'approved') 2>&1 | ForEach-Object { "$_" })
$code = $LASTEXITCODE
# ③ 등록 — 승인표에 이미 있는 편·.done 이 있는 편은 다시 고르지 않는다
if ($code -ne 3 -and -not $NoRegister) {
  $reviewed = @()
  if (Test-Path $tsv) { $reviewed = @(Get-Content $tsv -Encoding UTF8 | ForEach-Object { $c = ($_ -replace '^\uFEFF', '') -split "`t"; if ($c[0] -match '^\d+$') { [int]$c[0] } }) }
  $done = @(Get-ChildItem $doneDir -Filter "$prefix *편.done" -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Name -match '(\d+)편\.done$') { [int]$Matches[1] } })
  $todayDone = @(Get-ChildItem $doneDir -Filter "$prefix *편.done" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime.Date -eq (Get-Date).Date }).Count
  $todo = @($have | Where-Object { $done -notcontains $_ -and $reviewed -notcontains $_ } | Select-Object -First ([Math]::Max(0, $Count - $todayDone)))
  if ($todo.Count) {
    $log += "GOMS 등록: $prefix $($todo -join ', ')편"
    foreach ($n in $todo) {   # 한 편씩 따로 — 사이에 Word 가 빠진 번호가 있어도 멈추지 않게
      $log += @(& node scripts\goms-ad.mjs --prefix $prefix --file-dir $fileDir --submit --from $n --to $n --done-dir $doneDir --out (Join-Path $out "register-$n") 2>&1 | ForEach-Object { "$_" })
      if ($LASTEXITCODE -eq 3) { $code = 3; break }
      if ($LASTEXITCODE -ne 0) { $code = $LASTEXITCODE }
    }
  } else { $log += 'GOMS 에 새로 등록할 인스타 카드뉴스가 없어요.' }
}
Remove-Item $lock -Force -ErrorAction SilentlyContinue
$log | ForEach-Object { Write-Host $_ }
@("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "종료 코드: $code (0 = 끝까지, 2 = 중간에 멈춤, 3 = GOMS 로그인 안 됨)", '') + $log |
  Set-Content -Encoding UTF8 (Join-Path $out 'result.txt')
$dest = Join-Path $drive "ClaudeWorkspace\run-logs\insta-goms-$stamp-$env:COMPUTERNAME"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $out '*') $dest -Recurse -Force
if ($code -eq 3) { Write-Host 'GOMS 에 로그인되지 않아 건너뛰었어요.' -ForegroundColor Gray }
exit 0
