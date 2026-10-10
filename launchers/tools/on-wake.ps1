# PC 를 켜거나(로그인)·잠금을 풀거나·절전에서 깨우면 바로 오늘 예약발행을 시작한다 (2026-10-05 사용자:
# "고정된 시간보다 내가 일찍 일어났을 때 바로 작업이 진행됐으면"). 작업 스케줄러 'SeonggeulMorningStart' 가 부른다 (auto-setup.ps1 이 등록).
# 아래일 때만 launchers\auto-day.cmd 를 띄운다. 아니면 조용히 끝낸다.
#   - 05:00 ~ 20:59 사이 (2026-10-10 사용자: 늦게 켠 날도 자동 시작 — 15시까지였을 땐 저녁에 켜도 안 돌았다. 늦은 글은 draft-day·tistory-day 가 23시 전 빈자리로 옮긴다)
#   - auto-day 가 이미 돌고 있지 않음
#   - 오늘 원고(main 기준) 중 아직 .done 이 없는 글이 있음 (Drive run-locks\<오늘>\)
#   - 이 PC 에서 60분 안에 띄운 적이 없음 (잠금을 여러 번 풀어도 한 번만)
$ErrorActionPreference = 'SilentlyContinue'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
$now = Get-Date
if ($now.Hour -lt 5 -or $now.Hour -ge 21) { exit 0 }
$busy = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'auto-day\.cmd|draft-day\.ps1|tistory-day\.ps1' }
if ($busy) { exit 0 }
$stamp = Join-Path $repo 'dumps\on-wake-last.txt'
if ((Test-Path $stamp) -and ($now - (Get-Item $stamp).LastWriteTime).TotalMinutes -lt 60) { exit 0 }

$today = $now.ToString('yyyy-MM-dd')
git fetch -q origin main 2>$null
$naver = @(git ls-tree --name-only origin/main content/posts/ 2>$null | Where-Object { $_ -match "/$today-.*\.md$" })
$tistory = @(git ls-tree --name-only origin/main content/tistory/ 2>$null | Where-Object { $_ -match "/$today-.*\.md$" })
if (-not $naver.Count -and -not $tistory.Count) { exit 0 }   # 오늘 원고가 없으면 할 일이 없다

. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
$lockDir = if ($drive) { Join-Path $drive "ClaudeWorkspace\run-locks\$today" } else { Join-Path $repo "dumps\run-locks\$today" }
$pending = 0
foreach ($f in $naver) { if (-not (Test-Path (Join-Path $lockDir ("{0}.done" -f [IO.Path]::GetFileNameWithoutExtension($f))))) { $pending++ } }
foreach ($f in $tistory) { if (-not (Test-Path (Join-Path $lockDir ("tistory-{0}.done" -f [IO.Path]::GetFileNameWithoutExtension($f))))) { $pending++ } }
if (-not $pending) { exit 0 }

New-Item -ItemType Directory -Force -Path (Split-Path $stamp) | Out-Null
"$($now.ToString('s')) 남은 글 $pending 편" | Out-File $stamp -Encoding utf8
Start-Process cmd.exe -ArgumentList '/c', "`"$(Join-Path (Split-Path $PSScriptRoot -Parent) 'auto-day.cmd')`""
exit 0
