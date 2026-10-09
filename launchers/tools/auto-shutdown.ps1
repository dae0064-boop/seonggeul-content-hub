# 아침 작업이 다 끝나면 PC 를 완전히 끈다 (2026-10-09 사용자 지시: "끄기 전에 알림으로 한 번 물어보고, 10분 동안 대답이 없으면 그냥 끈다").
# auto-day.cmd 맨 끝에서 부른다. 아래일 때는 끄지 않고 조용히 끝낸다.
#   - 오늘 원고(네이버·티스토리) 중 .done 이 없는 글이 남음 → 10:10 "다시 시도" 실행이 해야 하므로 켜 둔다
#   - 이 PC 에서 다른 발행 작업이 아직 돎
#   - dumps\no-auto-shutdown.txt 파일이 있음 (이 PC 만 자동 끄기를 끄는 스위치)
# 물어보는 창: "끄지 않기"를 누르면 그대로 켜 둔다. "지금 끄기" 또는 10분 동안 아무것도 안 누르면 끈다.
# 끌 때 /f(강제 종료)를 쓰지 않는다 — 저장하지 않은 문서가 있으면 윈도우가 먼저 묻는다.
# -Test: 시험용 (launchers\shutdown-test.cmd). 남은 글·다른 작업 확인을 건너뛰고 1분짜리 창을 띄운다. 버튼·시간 초과 동작은 실제와 같다 — 정말 꺼진다 (2026-10-09 사용자: "실제로 꺼지는지도 확인").
param([switch]$Test)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
# 무엇을 했는지 이 PC(dumps\auto-shutdown.log)와 Drive run-logs 에 남긴다 — 클라우드 Claude 가 아침 확인에서 읽는다
$logLines = @()
function Log([string]$m, [string]$c = 'Gray') {
  Write-Host $m -ForegroundColor $c
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $m"
  $script:logLines += $line
  New-Item -ItemType Directory -Force -Path (Join-Path $repo 'dumps') | Out-Null
  Add-Content -Path (Join-Path $repo 'dumps\auto-shutdown.log') -Value $line -Encoding UTF8
  if ($drive) {
    $d = Join-Path $drive 'ClaudeWorkspace\run-logs'
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    Add-Content -Path (Join-Path $d "auto-shutdown-$env:COMPUTERNAME-$(Get-Date -Format 'yyyy-MM-dd').txt") -Value $line -Encoding UTF8
  }
}
Log "시작$(if ($Test) { ' (시험)' })"
if (-not $Test -and (Test-Path (Join-Path $repo 'dumps\no-auto-shutdown.txt'))) { Log '자동 끄기 꺼 둠 (dumps\no-auto-shutdown.txt) — PC 를 켜 둡니다.'; exit 0 }

# 같은 PC 에서 다른 발행 작업이 돌고 있으면 끄지 않는다 (나를 부른 auto-day.cmd 는 뺀다)
$parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$pat = 'auto-day\.cmd|draft-day\.ps1|tistory-day\.ps1|reserve-tomorrow|post-images\.mjs|publish-naver\.mjs|publish-tistory\.mjs'
$busy = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.ProcessId -ne $parent -and $_.CommandLine -and $_.CommandLine -match $pat }
if ($busy -and -not $Test) { Log '다른 발행 작업이 아직 돌고 있어 PC 를 끄지 않습니다.' 'Yellow'; exit 0 }

# 오늘 남은 글이 있으면 끄지 않는다 (on-wake.ps1 과 같은 셈법)
$today = (Get-Date).ToString('yyyy-MM-dd')
$naver = @(Get-ChildItem 'content\posts' -Filter "$today-*.md" | ForEach-Object { $_.BaseName })
$tistory = @(Get-ChildItem 'content\tistory' -Filter "$today-*.md" | ForEach-Object { $_.BaseName })
$lockDir = if ($drive) { Join-Path $drive "ClaudeWorkspace\run-locks\$today" } else { Join-Path $repo "dumps\run-locks\$today" }
$left = @()
foreach ($b in $naver) { if (-not (Test-Path (Join-Path $lockDir "$b.done"))) { $left += $b } }
foreach ($b in $tistory) {
  $d = Join-Path $lockDir "tistory-$b.done"
  if (-not (Test-Path $d) -or ((Get-Content $d -Raw -Encoding UTF8) -match '예약 확인 실패')) { $left += "tistory-$b" }
}
if ($Test) { Log "[시험] 남은 글 $($left.Count)편 — 시험이라 무시하고 창을 띄웁니다." 'Cyan' }
elseif ($left.Count) {
  Log "아직 예약되지 않은 글이 $($left.Count)편 있어 PC 를 켜 둡니다 (다시 시도 실행이 이어서 합니다): $($left -join ', ')" 'Yellow'
  exit 0
}

$ErrorActionPreference = 'Stop'
try {
# 묻는 창 — 10분 동안 대답이 없으면 끈다. 그동안 Google Drive 가 실행 기록을 마저 올린다.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$seconds = if ($Test) { 60 } else { 600 }
$form = New-Object Windows.Forms.Form
$form.Text = if ($Test) { '성글벙글 아침 작업 끝 (시험 — 1분)' } else { '성글벙글 아침 작업 끝' }
$form.TopMost = $true
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false; $form.MinimizeBox = $false
$form.ClientSize = New-Object Drawing.Size(460, 190)
$form.Font = New-Object Drawing.Font('Malgun Gothic', 11)
$label = New-Object Windows.Forms.Label
$label.SetBounds(20, 18, 420, 100)
$form.Controls.Add($label)
$off = New-Object Windows.Forms.Button
$off.Text = '지금 끄기'; $off.SetBounds(60, 130, 150, 40); $off.DialogResult = 'OK'
$keep = New-Object Windows.Forms.Button
$keep.Text = '끄지 않기'; $keep.SetBounds(250, 130, 150, 40); $keep.DialogResult = 'Cancel'
$form.Controls.Add($off); $form.Controls.Add($keep)
$form.AcceptButton = $off; $form.CancelButton = $keep
$script:remain = $seconds
function Show-Remain { $m = [math]::Floor($script:remain / 60); $s = $script:remain % 60
  $label.Text = "오늘 글 예약이 모두 끝났어요.`n`n${m}분 ${s}초 뒤에 PC 를 끕니다.`nPC 를 계속 쓰시려면 [끄지 않기] 를 눌러 주세요." }
Show-Remain
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({ $script:remain--; Show-Remain; if ($script:remain -le 0) { $timer.Stop(); $form.DialogResult = 'OK'; $form.Close() } })
$form.Add_Shown({ $form.Activate(); $timer.Start() })
[System.Media.SystemSounds]::Exclamation.Play()
Log '묻는 창을 띄웁니다.'
$answer = $form.ShowDialog()
} catch {
  Log "창을 띄우지 못했어요: $($_.Exception.Message)" 'Red'
  Log 'PC 를 켜 둡니다 (창 없이 끄지 않음).' 'Red'
  exit 1
}
$ErrorActionPreference = 'SilentlyContinue'
$timer.Stop()
if ($answer -ne 'OK') { Log "PC 를 켜 둡니다 ([끄지 않기] 또는 창 닫기 — 응답 $answer)." 'Green'; exit 0 }
Log "PC 를 끕니다 ($(if ($script:remain -le 0) { '10분 대답 없음' } else { '[지금 끄기]' }))." 'Cyan'
shutdown.exe /s /t 30 /c "성글벙글 아침 작업이 끝나 30초 뒤 PC 를 끕니다. 멈추려면 윈도우 키+R 에 shutdown /a 입력."
exit 0
