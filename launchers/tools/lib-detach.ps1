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
