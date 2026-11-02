# 인스타 카드뉴스 자동 게시 (2026-11-02 사용자 — "보험심의를 자동으로 올리는 걸 진행").
#   GOMS '적격' 편을 번호 순서로 하루 1편, 18~22시에 올린다 (scripts\instagram\insta-post.mjs 가 모든 확인을 한다).
#   catchup-reserve.ps1(10·13·16·19·22시)이 부른다 → 보통 19시에 올라가고, 19시를 놓치면 22시.
#   연결 키: Windows 사용자 환경 변수 INSTAGRAM_ACCESS_TOKEN (launchers\insta-key.cmd). 7일마다 새 60일 키로 바꿔 둔다.
#   기록: Drive ClaudeWorkspace\run-logs\instagram\<날짜>.log, 게시 기록 run-logs\instagram\posted.tsv
param([switch]$Test, [switch]$Now)   # -Now: 시간대(18~22시) 상관없이 지금 (launchers\insta-post-now.cmd)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { return }
$token = [Environment]::GetEnvironmentVariable('INSTAGRAM_ACCESS_TOKEN', 'User')
if (-not $token) { return }   # 키를 아직 안 넣은 PC — 조용히 넘어간다
$env:INSTAGRAM_ACCESS_TOKEN = $token
$logDir = Join-Path $drive 'ClaudeWorkspace\run-logs\instagram'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "$(Get-Date -Format 'yyyy-MM-dd').log"
function Note($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $m" | Add-Content -Encoding UTF8 $logFile }

# 60일 키는 7일마다 새로 받아 둔다 (만료되면 사람이 다시 넣어야 한다)
$mark = Join-Path $env:LOCALAPPDATA 'seonggeul\insta-token-refreshed.txt'
$last = if (Test-Path $mark) { (Get-Item $mark).LastWriteTime } else { [datetime]'2000-01-01' }
if (((Get-Date) - $last).TotalDays -ge 7) {
  $tmp = Join-Path $env:TEMP "ig-$([guid]::NewGuid()).txt"
  $r = & node scripts\instagram\insta-post.mjs --refresh-out $tmp 2>&1 | Out-String
  if ((Test-Path $tmp) -and ((Get-Content $tmp -Raw).Trim().Length -gt 40)) {
    $new = (Get-Content $tmp -Raw).Trim()
    [Environment]::SetEnvironmentVariable('INSTAGRAM_ACCESS_TOKEN', $new, 'User'); $env:INSTAGRAM_ACCESS_TOKEN = $new
    New-Item -ItemType Directory -Force -Path (Split-Path $mark) | Out-Null; Get-Date | Set-Content $mark
    Note "연결 키 새로 받음 — $($r.Trim())"
  } else { Note "⚠ 연결 키 새로 받기 실패 — $($r.Trim())" }
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

$args2 = @('scripts\instagram\insta-post.mjs', '--word-dir', (Join-Path $drive 'ClaudeWorkspace\인스타심의'),
  '--approved', (Join-Path $drive 'ClaudeWorkspace\goms-approved-insta.tsv'), '--posted', (Join-Path $logDir 'posted.tsv'))
if (-not $Test) { $args2 += '--post' }
if ($Now) { $args2 += @('--from-hour', '0', '--to-hour', '23') }
$out = & node @args2 2>&1 | ForEach-Object { "$_" }
$out | ForEach-Object { Write-Host $_ }
Note ("코드 $(git rev-parse --short HEAD 2>$null)`n" + ($out -join "`n"))
if ($out -match '❌') { & (Join-Path $PSScriptRoot 'alert.ps1') -Title '인스타 카드뉴스' -Message (($out | Where-Object { $_ -match '❌' }) -join "`n") 2>$null }
