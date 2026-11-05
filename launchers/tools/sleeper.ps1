# 절전 담당 (2026-11-05 사용자 — "작업할 때는 켜고, 안 하면 바로 절전"). 작업 스케줄러 SeonggeulSleeper 가 5분마다 부른다 — PC 를 깨우지 않는다(깨어 있을 때만 돈다).
#   content\away.txt 의 sleep_after_work 기간에만 동작한다. 아래가 모두 맞으면 절전:
#     · 성글벙글 작업(예약·그림·스레드·이슈·GOMS·지킴이 등)이 하나도 돌지 않음 — 1분 뒤 한 번 더 확인 (그동안 Drive 가 기록을 올린다)
#     · 마우스·키보드를 10분 넘게 아무도 안 만짐 (원격 데스크톱으로 들어가 있으면 재우지 않는다)
#   무엇을 했는지 Drive run-logs\sleeper-<날짜>.txt 에 남긴다 (잔 때만).
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
if (-not (Test-SleepAfterWork)) { exit 0 }
if (Test-Path (Join-Path $repo 'dumps\no-auto-shutdown.txt')) { exit 0 }
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class SgIdle {
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);
  public static uint Seconds() { var l = new LII(); l.cbSize = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l); return ((uint)Environment.TickCount - l.dwTime) / 1000; }
}
'@
$pat = 'auto-day|draft-day|tistory-day|reserve-tomorrow|publish-naver|publish-tistory|post-images|catchup-reserve|threads-|daily-post|blog-post|insurance-post|insta-|goms-|issue-scan|matjip|category-|blog-stats|tistory-stats|sc-request|keyword-volume|blog-snapshot|login-check|login-test|health\.ps1|away-check|chrome-login|now\.cmd|share-run|cleanup\.ps1|image-gen|build-'
function Busy { @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -match $pat -and $_.CommandLine -notmatch 'sleeper' }) }
if ((Busy).Count) { exit 0 }
if ([SgIdle]::Seconds() -lt 600) { exit 0 }
Start-Sleep 60
if ((Busy).Count -or [SgIdle]::Seconds() -lt 600) { exit 0 }
$drive = Find-MyDrive
if ($drive) {
  $d = Join-Path $drive 'ClaudeWorkspace\run-logs'
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] 작업이 없어 절전 (아무도 안 만진 지 $([int]([SgIdle]::Seconds() / 60))분)" | Add-Content -Encoding UTF8 (Join-Path $d "sleeper-$(Get-Date -Format 'yyyy-MM-dd').txt")
  Start-Sleep 20   # Drive 가 이 줄을 올릴 틈
}
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false) | Out-Null
exit 0
