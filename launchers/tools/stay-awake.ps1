# 정해진 시각까지 PC 가 잠들지 않게 붙잡는다 (2026-11-05 사용자 — 원격 접속용 "잠시 절전 풀어 줘"). lib-drive.ps1 Invoke-StayAwakeRequest 가 띄운다.
#   창 없이 돈다. 윈도우에 '시스템 필요' 상태를 알려 절전·무인 절전을 막고, 시각이 되면 끝난다(그 뒤엔 평소처럼 절전 담당이 재운다).
#   Drive stay-awake.txt 의 시각이 바뀌면(연장·취소) 1분 안에 따른다. 기록 Drive run-logs\stay-awake-<날짜>.txt.
param([string]$Until)
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class SgAwake { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f); }
'@
$drive = Find-MyDrive
function Note($m) { if ($drive) { $d = Join-Path $drive 'ClaudeWorkspace\run-logs'; New-Item -ItemType Directory -Force -Path $d | Out-Null; "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $m" | Add-Content -Encoding UTF8 (Join-Path $d "stay-awake-$(Get-Date -Format 'yyyy-MM-dd').txt") } }
$end = [datetime]::ParseExact($Until, 'yyyy-MM-dd HH:mm', $null)
Note "깨어 있기 시작 — $($end.ToString('M/d HH:mm')) 까지 절전 안 함 (원격 데스크톱으로 들어올 수 있음)"
$ES = [uint32]('0x80000001')   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
while ((Get-Date) -lt $end) {
  [SgAwake]::SetThreadExecutionState($ES) | Out-Null
  Start-Sleep 60
  $f = if ($drive) { Join-Path $drive 'ClaudeWorkspace\stay-awake.txt' } else { $null }
  if ($f -and (Test-Path $f)) {
    $m = Select-String -Path $f -Pattern '^\s*until:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})' | Select-Object -First 1
    if ($m) { $new = [datetime]::ParseExact($m.Matches[0].Groups[1].Value, 'yyyy-MM-dd HH:mm', $null); if ($new -ne $end) { Note "시각 바뀜: $($end.ToString('HH:mm')) → $($new.ToString('M/d HH:mm'))"; $end = $new } }
  } elseif ($f) { Note '요청 파일이 지워져 깨어 있기를 끝냄'; break }
}
[SgAwake]::SetThreadExecutionState([uint32]('0x80000000')) | Out-Null
Note '깨어 있기 끝 — 이제 평소처럼 작업이 없으면 절전'
