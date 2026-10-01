# 하루치 원고를 이미지 생성 → 네이버 임시저장까지 한 번에 돌린다. 발행은 하지 않는다.
#   powershell -ExecutionPolicy Bypass -File launchers\draft-day.ps1 -Date 2026-10-01
#   -Only dokgam-75,daeha-jecheol   일부 글만
#   -SkipImages                     이미지 단계 건너뛰기
#   -ImagesOnly                     이미지만 만들고 네이버는 건드리지 않기 (다른 글 임시저장과 동시에 돌려도 됨)
# 한 편이 실패하면 그 글은 저장하지 않는다. 첫 글부터 실패하면 나머지는 돌리지 않는다(같은 이유로 또 실패하기 때문).
param(
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [string[]]$Only = @(),
  [switch]$SkipImages,
  [switch]$ImagesOnly
)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..')
New-Item -ItemType Directory -Force -Path dumps | Out-Null
$log = "dumps\day-$Date$(if ($ImagesOnly) { '-images' }).log"
"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 시작" | Out-File $log -Encoding utf8

function Say($s, $c = 'Gray') { Write-Host $s -ForegroundColor $c; $s | Out-File $log -Append -Encoding utf8 }
function Run($argsList) {
  & node @argsList 2>&1 | ForEach-Object { $l = $_.ToString(); Write-Host $l; $l | Out-File $log -Append -Encoding utf8 }
  return $LASTEXITCODE
}

$posts = Get-ChildItem "content\posts\$Date-*.json" | Sort-Object Name
if ($Only.Count) { $posts = $posts | Where-Object { $s = $_.BaseName.Substring(11); $Only -contains $s } }
if (-not $posts) { Say "원고가 없어요: content\posts\$Date-*.json" 'Red'; exit 1 }
Say "원고 $($posts.Count)편: $(( $posts | ForEach-Object { $_.BaseName.Substring(11) }) -join ', ')" 'Cyan'

# 1) 이미지
if (-not $SkipImages) {
  foreach ($p in $posts) {
    $plan = "content\image-plans\$($p.BaseName).json"
    if (-not (Test-Path $plan)) { Say "  이미지 계획서 없음 — 건너뜀: $($p.BaseName)" 'Yellow'; continue }
    Say "`n[이미지] $($p.BaseName)" 'Cyan'
    $code = Run @('scripts/post-images.mjs', $plan)
    if ($code -ne 0) { Say "  이미지 일부 실패 — 이 글은 빈 자리를 표시 줄로 남깁니다" 'Yellow' }
  }
}

if ($ImagesOnly) { Say "`n이미지만 만들었어요. 네이버는 건드리지 않았어요." 'Green'; exit 0 }

# 2) 자동화용 크롬
function CdpUp { try { Invoke-RestMethod http://localhost:9222/json/version -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (CdpUp)) {
  Say "`n자동화용 크롬을 켜는 중..." 'Cyan'
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  Start-Process $chrome -ArgumentList '--remote-debugging-port=9222', "--user-data-dir=$env:LOCALAPPDATA\seonggeul-chrome", '--no-first-run', 'about:blank'
  Start-Sleep 6
}
if (-not (CdpUp)) { Say '자동화용 크롬을 켜지 못했어요. 자동화크롬-켜기.cmd 를 먼저 실행해 주세요.' 'Red'; exit 1 }

# 3) 네이버 임시저장 (한 편씩)
$result = @()
$i = 0
foreach ($p in $posts) {
  $i++
  $slug = $p.BaseName
  Say "`n[네이버 $i/$($posts.Count)] $slug" 'Cyan'
  $code = Run @('scripts/publish-naver.mjs', '--post', $p.FullName, '--images', "content\images\$slug", '--color', '--save-draft', '--dump')
  $ok = ($code -eq 0)
  $result += [pscustomobject]@{ 글 = $slug; 결과 = $(if ($ok) { '임시저장 완료' } else { '실패 — 저장 안 함' }) }
  if (-not $ok -and $i -eq 1 -and $posts.Count -gt 1) {
    Say '첫 글이 실패해서 나머지는 돌리지 않았어요 (같은 이유로 또 실패할 가능성이 커요).' 'Yellow'
    break
  }
  Start-Sleep 3
}

Say "`n==================== 결과 ====================" 'Cyan'
$result | Format-Table -AutoSize | Out-String | ForEach-Object { Say $_ }
Say '발행은 하지 않았어요. 네이버 글쓰기 화면의 "저장" 옆 숫자 → 임시저장 목록에서 확인하세요.' 'Green'
