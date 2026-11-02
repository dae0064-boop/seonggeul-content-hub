# 사용량 막대 자동 시작 켜기/끄기 — 윈도우 '시작프로그램' 폴더에 바로가기를 둔다 (2026-11-02 사용자 "pc 켤 때마다 자동으로").
#   켜기: powershell -File usage-autostart.ps1        끄기: powershell -File usage-autostart.ps1 -Remove
# usage-widget.cmd 와 아침 실행의 ensure-retry.ps1 이 부른다 — 사람이 따로 할 일 없음. 이미 있으면 주소만 고쳐 둔다.
# 이 PC 에서 자동 시작을 쓰지 않으려면 dumps\no-usage-autostart.txt 를 만든다 (있으면 바로가기를 지우고 다시 만들지 않는다).
param([switch]$Remove)
$ErrorActionPreference = 'SilentlyContinue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) '성글벙글 클로드 사용량.lnk'
if ($Remove -or (Test-Path (Join-Path $root 'dumps\no-usage-autostart.txt'))) {
  if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host '사용량 막대 자동 시작을 껐어요.' }
  exit 0
}
$had = Test-Path $lnk
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'usage-widget-start.ps1')`""
$s.WorkingDirectory = $root
$s.WindowStyle = 7
$s.Description = '성글벙글 - 클로드 사용량 막대'
$s.Save()
if (-not $had) { Write-Host '이제 PC 를 켤 때마다 사용량 막대가 저절로 떠요.' }
