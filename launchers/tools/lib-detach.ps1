# 작업 스케줄러 묶음 밖에서 프로그램을 띄운다 (2026-11-05 고장 고침 — "크롬이 작업 중에 닫힘").
#   작업 스케줄러는 작업이 띄운 프로그램(자식)을 한 묶음(job)으로 보고, 그 작업의 '최대 실행 시간'이 되면 묶음째 끈다.
#   SeonggeulMorningStart(10분)가 띄운 auto-day·크롬이 10분 뒤 같이 꺼졌다(11/5 06:49 시작 → 07:01 크롬 닫힘),
#   스레드 보험글 작업(15분)이 띄운 catchup·크롬도 같은 식. Start-Process 로 띄우면 묶음 안에 남는다.
#   Win32_Process.Create(WMI)로 만든 프로세스는 WMI 서비스가 만들어 묶음 밖이다 → 작업이 끝나거나 시간이 다 돼도 살아 있다.
#   -WindowStyle 은 WMI 로 띄울 때는 쓰지 않는다(크롬은 --start-minimized, powershell 은 인자 -WindowStyle 로).
#   WMI 가 안 되면 예전처럼 Start-Process (그때는 묶음 안이라 꺼질 수 있다).
function Start-Detached {
  param([Parameter(Mandatory)][string]$FilePath, [string[]]$ArgumentList = @(), [string]$WorkingDirectory = '', [string]$WindowStyle = '')
  $q = { param($s) if ($s -match '^".*"$') { $s } elseif ($s -match '[\s]') { '"' + $s + '"' } else { $s } }
  $line = (@(& $q $FilePath) + @($ArgumentList | ForEach-Object { & $q $_ })) -join ' '
  try {
    $a = @{ CommandLine = $line }
    if ($WorkingDirectory) { $a.CurrentDirectory = $WorkingDirectory }
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments $a -ErrorAction Stop
    if ($r.ReturnValue -eq 0) { return }
    throw "Win32_Process.Create 코드 $($r.ReturnValue)"
  } catch {
    $sp = @{ FilePath = $FilePath }
    if ($ArgumentList.Count) { $sp.ArgumentList = $ArgumentList }
    if ($WorkingDirectory) { $sp.WorkingDirectory = $WorkingDirectory }
    if ($WindowStyle) { $sp.WindowStyle = $WindowStyle }
    Start-Process @sp
  }
}

# 멈춘 자동화 크롬 되살리기 (2026-11-07 고장 고침 — 크롬이 '켜져는 있는데' 대답하지 않아 그날 25편이 하나도 예약되지 않음).
#   /json/version 은 대답하는데 실제 연결(connectOverCDP)이 시간을 넘기면 멈춘 것이다. 30초 띄워 두 번 확인하고도 멈춰 있으면
#   자동화용 프로필(seonggeul-chrome)로 뜬 크롬만 끄고 --restore-last-session 으로 다시 켠다 (로그인은 프로필에 남는다).
#   사용자가 평소 쓰는 크롬(다른 프로필)은 건드리지 않는다. 결과를 한 줄로 돌려준다 ('' = 할 일 없었음).
# 쌓인 탭 정리 (2026-11-09) — 다른 작업이 돌지 않을 때만 부른다. 탭이 $Over 개보다 많으면 첫 탭·로그인 화면만 남긴다.
function Clear-ExtraTabs {
  param([int]$Over = 15, [string]$Repo = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
  $probe = Join-Path $Repo 'scripts\cdp-probe.mjs'
  if (-not (Test-Path $probe)) { return '' }
  $o = @(& node $probe 9222 20000 --trim $Over 2>&1 | ForEach-Object { "$_" }) | Select-Object -Last 1
  if ("$o" -match '정리') { "탭 정리: $o" } else { '' }
}

function Repair-HungChrome {
  param([string]$Repo = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
  $probe = Join-Path $Repo 'scripts\cdp-probe.mjs'
  if (-not (Test-Path $probe)) { return '' }
  $o1 = @(& node $probe 9222 20000 2>&1 | ForEach-Object { "$_" }); $c1 = $LASTEXITCODE
  if ($c1 -ne 1) { return '' }          # 0 대답함 · 2 꺼져 있음(각 스크립트가 원래대로 켠다)
  Start-Sleep 30
  $o2 = @(& node $probe 9222 20000 2>&1 | ForEach-Object { "$_" }); $c2 = $LASTEXITCODE
  if ($c2 -ne 1) { return '' }
  $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -match 'seonggeul-chrome' })
  foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }
  Start-Sleep 5
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (-not (Test-Path $chrome)) { $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
  Start-Detached $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', '--restore-last-session', 'about:blank'
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep 1; try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; break } catch {} }
  Start-Sleep 3
  $o3 = @(& node $probe 9222 20000 2>&1 | ForEach-Object { "$_" }); $c3 = $LASTEXITCODE
  $why = ($o2 | Select-Object -Last 1)
  if ($c3 -eq 0) {
    # --restore-last-session 이 쌓인 탭을 모두 되살리므로(11/8 72개) 다시 켠 뒤 바로 정리한다 — 그 탭들은 이미 죽은 작업의 것
    $t = @(& node $probe 9222 20000 --trim 3 2>&1 | ForEach-Object { "$_" }) | Select-Object -Last 1
    "⚠ 크롬이 멈춰 있어 다시 켬 ($why → 창 $($procs.Count)개 끄고 다시 켬, 지금 대답함 · $t)"
  }
  else { "❌ 크롬이 멈춰 있어 다시 켰지만 아직 대답 없음 ($($o3 | Select-Object -Last 1))" }
}
