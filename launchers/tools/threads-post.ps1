# 스레드 보험 심의글 한 편 올리기 — 작업 스케줄러 SeonggeulThreadsPost 가 하루 5번(08:30·11:30·14:30·18:30·21:30, 노트북은 5분 뒤) 부른다.
#   한 편은 1/2(앞 절반) + 2/2(뒤 절반 + 심의필 배너, 1/2 아래 답글)로 나눠 올린다 (2026-10-26 사용자).
#   심의 '적격' 받은 편을 1편부터 차례로, 그 편의 심의필 배너를 붙여 올린다 (scripts\threads\insurance-post.mjs 가 모두 확인한다).
#   -Test 면 올리지 않고 다음에 올릴 글만 보여 준다 (launchers\threads-post-test.cmd).
# 기록은 Drive ClaudeWorkspace\run-logs\threads\<날짜>.log 에 이어 붙인다.
param([switch]$Test)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive(내 드라이브\ClaudeWorkspace)를 찾지 못했어요. Drive 가 켜져 있는지 확인해 주세요.' -ForegroundColor Yellow; exit 1 }
# 키는 Windows 사용자 환경 변수에 있다 (threads-key.cmd). 작업 스케줄러로 뜬 창에도 보이게 직접 읽어 넘긴다.
if (-not $env:THREADS_ACCESS_TOKEN) { $env:THREADS_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable('THREADS_ACCESS_TOKEN', 'User') }
$nodeArgs = @('scripts\threads\insurance-post.mjs', '--word-dir', (Join-Path $drive 'ClaudeWorkspace\보험글'), '--approved', (Join-Path $drive 'ClaudeWorkspace\goms-approved.tsv'), '--fixes', (Join-Path $drive 'ClaudeWorkspace\goms-fixes.tsv'))
if (-not $Test) { $nodeArgs += '--post' }
$log = @(& node @nodeArgs 2>&1 | ForEach-Object { "$_" })
$code = $LASTEXITCODE
$log | ForEach-Object { Write-Host $_ }
$dir = Join-Path $drive 'ClaudeWorkspace\run-logs\threads'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@("", "===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · $env:COMPUTERNAME · $(if ($Test) { '시험' } else { '올리기' }) · 종료 코드 $code") + $log |
  Add-Content -Encoding UTF8 (Join-Path $dir "$(Get-Date -Format 'yyyy-MM-dd').log")
exit $code
