# 사용량 막대를 PC 를 켤 때(로그인할 때)마다 띄운다 — 시작프로그램 바로가기가 부른다 (2026-11-02 사용자 "pc 켤 때마다 자동으로").
# 1) 로그인 직후 바쁜 때를 피해 20초 쉼 2) 자동화용 크롬(9222)이 없으면 최소화로 띄움 3) 위젯(작은 막대) 실행. 위젯이 5분마다 숫자를 새로 읽는다.
$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds 20
$up = $false
try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $up = $true } catch { }
if (-not $up) {
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if (Test-Path $chrome) {
    . (Join-Path $PSScriptRoot 'lib-detach.ps1'); Start-Detached $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', '--restore-last-session', '--start-minimized', 'about:blank' -WindowStyle Minimized
    # 크롬이 뜰 때까지 30초까지 기다린다 (그래야 위젯의 첫 읽기가 맞는다)
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 2
      try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 2 | Out-Null; break } catch { }
    }
  }
}
Start-Process powershell -ArgumentList '-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $PSScriptRoot 'usage-widget.ps1')`"" -WindowStyle Hidden
