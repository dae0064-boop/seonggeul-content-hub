# 스레드 블로그 유입 글 한 편 올리기 — 작업 스케줄러 SeonggeulThreadsBlog 가 07:30·08:30·20:00·21:00·22:30 (+09:15·23:15 다시) 부른다 (2026-11-02 사용자 고정).
#   언제 무엇을 올릴지는 content\threads\blog\<날짜>.md 의 '시각:' 이 정한다. 시각이 지난 글 중 블로그가 공개된 것 한 편 (scripts\threads\blog-post.mjs 가 모두 확인).
#   -Test 면 올리지 않고 보여 주기만 한다.
param([switch]$Test)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
git fetch -q origin 2>$null
git checkout -q -- 'content/posts/*.json' 'content/tistory/*.json' 'content/tistory/*.html' 2>$null
git pull -q --ff-only 2>$null
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $env:THREADS_ACCESS_TOKEN) { $env:THREADS_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable('THREADS_ACCESS_TOKEN', 'User') }
$dir = if ($drive) { Join-Path $drive 'ClaudeWorkspace\run-logs\threads' } else { Join-Path $repo 'dumps' }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$nodeArgs = @('scripts\threads\blog-post.mjs', '--posted', (Join-Path $dir 'blog-posted.tsv'))
if (-not $Test) { $nodeArgs += '--post' }
$log = @(& node @nodeArgs 2>&1 | ForEach-Object { "$_" })
$code = $LASTEXITCODE
$log | ForEach-Object { Write-Host $_ }
@("", "===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · $env:COMPUTERNAME · 블로그 유입 글 $(if ($Test) { '시험' } else { '올리기' }) · 종료 코드 $code") + $log |
  Add-Content -Encoding UTF8 (Join-Path $dir "$(Get-Date -Format 'yyyy-MM-dd').log")
exit $code
