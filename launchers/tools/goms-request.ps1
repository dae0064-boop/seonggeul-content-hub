# GOMS 광고심의 등록 — 사용자가 요청할 때만 (2026-11-11 사용자 "인스타 2 + 스레드 3, 하루 5개씩. 매일 아침 올릴 필요는 없고 내가 요청할 때마다 올려 줘.
#   곰스 매일 자동 로그인은 쉽지 않다 — 그렇게 일찍 일어나지도 않으니까").
#   사용자가 아무 Claude 대화에 "심의 올려줘" → Claude 가 Drive ClaudeWorkspace\goms-request.txt 를 만든다 (스레드: 3 / 인스타: 2).
#   작업 스케줄러 SeonggeulGomsRequest(07~23시 10분마다, 깨우지 않음 — 절전이면 다음에 깰 때 바로)가 이 파일을 보고:
#     1) goms-login.ps1 — 이미 로그인돼 있으면 문자 없이 통과. 아니면 [인증번호받기] → 사용자가 Claude 에 번호 → Drive goms-otp\code.txt (최대 6분)
#     2) 스레드 보험글 N편 (goms-register-auto.ps1 -IgnorePause -Exact, 등록 안 한 가장 작은 번호부터)
#     3) 인스타 카드뉴스 M편 (insta-goms.ps1 -Exact, 바탕 사진이 있는 편만)
#     4) 결과 한 줄씩 → Drive ClaudeWorkspace\goms-request-result.txt, 요청 파일은 지운다
#   파일이 없으면 바로 끝난다 (몇 초). 처리 중에는 PC 가 잠들지 않게 붙잡는다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { exit 0 }
$ws = Join-Path $drive 'ClaudeWorkspace'
$req = Join-Path $ws 'goms-request.txt'
if (-not (Test-Path $req)) { exit 0 }
$running = Join-Path $ws 'goms-request.running'
if ((Test-Path $running) -and (((Get-Date) - (Get-Item $running).LastWriteTime).TotalMinutes -lt 90)) { exit 0 }   # 다른 실행(다른 PC)이 처리 중
"$env:COMPUTERNAME $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Set-Content -Encoding UTF8 $running
Start-Sleep -Seconds 10
if (((Get-Content $running -Raw) -split ' ')[0] -ne $env:COMPUTERNAME) { exit 0 }

$text = Get-Content $req -Raw -Encoding UTF8
function Num($label, $def) { if ($text -match "$label\s*[:：]\s*(\d+)") { [int]$Matches[1] } else { $def } }
$nThreads = Num '스레드' 3
$nInsta = Num '인스타' 2
$resFile = Join-Path $ws 'goms-request-result.txt'
function Res($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $m" | Add-Content -Encoding UTF8 $resFile; Write-Host $m }
Remove-Item $resFile -ErrorAction SilentlyContinue
Res "요청 받음 — 스레드 $nThreads편 · 인스타 $nInsta편"

Add-Type @'
using System; using System.Runtime.InteropServices;
public static class SgGomsAwake { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f); }
'@
[SgGomsAwake]::SetThreadExecutionState([uint32]('0x80000001')) | Out-Null   # 처리 중 절전 막기

# 최신 원고·Word (밤에 쓴 편이 들어오게)
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>$null
git pull -q --ff-only 2>$null

# 1) 로그인 (인증 문자가 필요하면 사용자에게 감)
& (Join-Path $PSScriptRoot 'goms-login.ps1') | Out-Null
$login = Get-Content (Join-Path $ws 'goms-otp\result.txt') -TotalCount 1 -Encoding UTF8 -ErrorAction SilentlyContinue
Res "로그인: $login"
if ($login -notmatch '^성공') {
  Res '로그인이 안 돼 이번에는 등록하지 않았어요 — 다시 "심의 올려줘" 라고 하시면 처음부터 해요'
} else {
  $before = @{}
  foreach ($d in 'goms-done', 'goms-done-insta') { $before[$d] = @(Get-ChildItem (Join-Path $ws $d) -Filter '*.done' -ErrorAction SilentlyContinue | ForEach-Object Name) }
  if ($nThreads -gt 0) { & (Join-Path $PSScriptRoot 'goms-register-auto.ps1') -Count $nThreads -IgnorePause -Exact | Out-Null }
  if ($nInsta -gt 0) { & (Join-Path $PSScriptRoot 'insta-goms.ps1') -Count $nInsta -Exact | Out-Null }
  foreach ($d in 'goms-done', 'goms-done-insta') {
    $new = @(Get-ChildItem (Join-Path $ws $d) -Filter '*.done' -ErrorAction SilentlyContinue | ForEach-Object Name | Where-Object { $before[$d] -notcontains $_ } | ForEach-Object { $_ -replace '\.done$', '' })
    $label = if ($d -eq 'goms-done') { '스레드' } else { '인스타' }
    $want = if ($d -eq 'goms-done') { $nThreads } else { $nInsta }
    if ($new.Count) { Res "$label 등록 $($new.Count)/$want편: $($new -join ', ')" } elseif ($want -gt 0) { Res "$label 등록 0/$want편 — 올릴 Word 가 없거나 중간에 멈춤 (기록: run-logs\goms-register-* / insta-goms-*)" }
  }
}
Remove-Item $req -Force -ErrorAction SilentlyContinue
Remove-Item $running -Force -ErrorAction SilentlyContinue
Res '끝'
$logDir = Join-Path $ws 'run-logs'; New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Get-Content $resFile -Encoding UTF8 | Add-Content -Encoding UTF8 (Join-Path $logDir "goms-request-$(Get-Date -Format 'yyyy-MM-dd').txt")
[SgGomsAwake]::SetThreadExecutionState([uint32]('0x80000000')) | Out-Null
exit 0
