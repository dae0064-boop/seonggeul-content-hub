# 예약 안 된 글 다시 예약하기 (2026-10-29 사용자 — "원고가 예약되지 않았더라도 너가 예약되도록 했어야지").
#   아침 실행에서 임시저장만 된 글(Drive run-locks\<날짜>\ 에 .done 이 없는 글)을 그날 안에 다시 예약한다.
#   스레드 올리기(threads-post.ps1, 10·13·16·19·22시)가 끝날 때마다 따로 띄운다 — 다음 날 아침까지 기다리지 않는다.
#   오늘·내일·모레 네이버 원고, 오늘 티스토리 원고를 본다. 아래일 때는 조용히 끝낸다:
#     - (오늘 글만) 21시 이후 — 늦은 글은 draft-day 가 23시 전 빈자리로 옮기는데 그보다 늦으면 다음 날 아침 실행이 한다. 내일·모레 글은 22시에도 한다
#     - 아침 실행·다른 예약 작업이 돌고 있음
#     - 남은 글이 없음
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
$now = Get-Date
$today = $now.ToString('yyyy-MM-dd')
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
# 무엇을 했는지·왜 쉬었는지 매번 남긴다 (2026-10-29 16시 — 조용히 쉬어 원인을 알 수 없었다)
$noteFile = if ($drive) { Join-Path $drive "ClaudeWorkspace\run-logs\catchup-$today.txt" } else { Join-Path $repo "dumps\catchup-$today.txt" }
function Note($msg) { New-Item -ItemType Directory -Force -Path (Split-Path $noteFile) | Out-Null; "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$env:COMPUTERNAME] $msg" | Add-Content -Encoding UTF8 $noteFile }
Note "시작 (코드 $(git rev-parse --short HEAD 2>$null))"
# 2026-11-02 사용자 "스레드에 매일 5개씩" — 블로그 유입 글 작업(매시간)이 없으면 등록 (바쁨·Drive 확인보다 먼저)
try { & (Join-Path $PSScriptRoot 'threads-blog-setup.ps1') -IfMissing | Out-Null } catch { Note "스레드 블로그 작업 등록 실패: $($_.Exception.Message)" }
try { & (Join-Path $PSScriptRoot 'matjip-watch-setup.ps1') -IfMissing | Out-Null } catch { }  # 맛집 예약 지킴이 (2026-11-04)
try { & (Join-Path $PSScriptRoot 'goms-request-setup.ps1') -IfMissing | Out-Null } catch { }  # '심의 올려줘' 요청 지킴이 + 08:30 자동 로그인 지움 (2026-11-11)
# 2026-11-03 사용자 — 보험글 09·15·21시: 올리기 작업 시각이 바뀌었으면 다시 등록 (다음 날 아침을 기다리지 않게)
try { & (Join-Path $PSScriptRoot 'threads-setup.ps1') -IfMissing | Out-Null } catch { Note "스레드 올리기 작업 등록 실패: $($_.Exception.Message)" }
# 인스타 카드뉴스 Word·그림을 Drive 로 (2026-11-02 — 클라우드가 큰 파일을 Drive 로 못 보낸다)
$ig = & (Join-Path $PSScriptRoot 'instagram-to-drive.ps1'); if ($ig) { Note "$ig" }
# 블로그 상담 배너 GPT 시안 (2026-11-09) — Drive 블로그배너\사진.jpg 가 있고 아직 안 만든 시안만. 사진이 없으면 아무것도 안 함
try { $d = Find-MyDrive; if ($d) { $bd = Join-Path $d 'ClaudeWorkspace\블로그배너'; if (Get-ChildItem $bd -Filter '사진.*' -ErrorAction SilentlyContinue) { $bo = node (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'scripts\blog-banner\make-gpt.mjs') --out $bd --only consult- 2>&1 | Select-Object -Last 1; if ($bo -match '새로 [1-9]') { Note "배너 시안: $bo" } } } } catch { }
# 인스타 카드뉴스 자동 게시 (2026-11-02) — GOMS 적격 편을 하루 1편, 18~22시 (보통 19시 실행). 키가 없는 PC 는 조용히 넘어간다
try { & (Join-Path $PSScriptRoot 'insta-post.ps1') | Out-Null; Note '인스타 게시 확인 끝 (기록: run-logs\instagram)' } catch { Note "인스타 게시 실패: $($_.Exception.Message)" }
# (2026-11-11 사용자) 저녁 GOMS 혼자 로그인 확인은 뺐다 — GOMS 는 "심의 올려줘" 요청 때만 (goms-request.ps1)
# 사진 찾기 곳(위키미디어·오픈버스·픽사베이)이 되는지 하루 한 번 (2026-11-03 사용자 — "신경 안 쓰면 알아서 확인되는 건가?") → 아침 확인이 읽는다
if ($drive) {
  $pt = Join-Path $drive "ClaudeWorkspace\run-logs\photo-test-$today.txt"
  if (-not (Test-Path $pt)) {
    try {
      foreach ($n in 'PIXABAY_API_KEY', 'FLICKR_API_KEY', 'PEXELS_API_KEY', 'OPENVERSE_CLIENT_ID', 'OPENVERSE_CLIENT_SECRET') { $v = [Environment]::GetEnvironmentVariable($n, 'User'); if ($v) { Set-Item "env:$n" $v } }  # 방금 넣은 키도 읽게
      $out = @(& node scripts\photo-test.mjs 2>&1 | ForEach-Object { "$_" })
      @("PC: $env:COMPUTERNAME", "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", '') + $out | Set-Content -Encoding UTF8 $pt
      Note ("사진 찾기 시험: " + (($out | Where-Object { $_ -match '오픈버스 (토큰|검색)|오픈버스: 연결' }) -join ' / '))
    } catch { Note "사진 찾기 시험 실패: $($_.Exception.Message)" }
  }
}
# 새 배너로 Drive Word 전부 바꾸기 — 한 번만 (2026-11-03 사용자, 보험글\banner-swap-d-warm.txt 가 있으면 건너뜀)
try { $bs = & (Join-Path $PSScriptRoot 'banner-swap.ps1') -IfNeeded | Select-Object -Last 1; if ($bs) { Note "새 배너 Word: $bs" } } catch { Note "새 배너 Word 실패: $($_.Exception.Message)" }
# 오늘 글은 21시 이후면 넣을 자리가 없다 — 내일·모레 글은 밤에도 예약한다 (22시 실행이 마지막 기회가 되게)
$late = ($now.Hour -lt 5 -or $now.Hour -ge 21)
# 실제로 글을 만들거나 예약하는 일이 돌 때만 쉰다. 기다리기만 하는 auto-day.cmd·wait-turn 은 세지 않는다
# (16시 첫 실행이 아무것도 남기지 않고 끝났다 — 아침 실행 창이 남아 있던 것으로 본다)
$busy = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'draft-day\.ps1|tistory-day\.ps1|publish-naver\.mjs|publish-tistory\.mjs|post-images\.mjs|catchup-reserve\.ps1' })
if ($busy.Count) { Note ("다른 예약 작업이 돌고 있어 쉼: " + (($busy | ForEach-Object { ($_.CommandLine -replace '\s+', ' ').Substring(0, [Math]::Min(90, ($_.CommandLine -replace '\s+', ' ').Length)) }) -join ' | ')); exit 0 }
if (-not $drive) { Note 'Drive 를 못 찾아 쉼 (.done 을 볼 수 없어 두 번 예약할 수 있다)'; exit 0 }
# 2026-11-02 사용자 — "막히면 뚫을 방법", "네이버 홈판을 확인해 봐":
#   ① 아침 이슈 모으기 작업(SeonggeulIssueScan 07:50) 등록 — 다음 날 아침을 기다리지 않게 여기서도
#   ② 오늘 이슈를 아직 안 모았으면 모은다 (네이버 랭킹 화면 읽기를 오늘 바로 확인)
#   ③ 네이버 홈판 화면 읽기 (로그인·비로그인) → Drive homefeed\<날짜>\<시각>
try { & (Join-Path $PSScriptRoot 'ensure-retry.ps1') | Out-Null } catch { Note "작업 등록 확인 실패: $($_.Exception.Message)" }
if (-not (Test-Path (Join-Path $drive "ClaudeWorkspace\issues\$today\issues.json"))) {
  Note '오늘 이슈 모으기 시작'
  & (Join-Path $PSScriptRoot 'issue-scan.ps1') | Out-Null
  Note ("오늘 이슈 모으기 끝: " + $(if (Test-Path (Join-Path $drive "ClaudeWorkspace\issues\$today\issues.json")) { 'Drive 에 올림' } else { '실패 — dumps 확인' }))
}
# 2026-11-07 고장 고침: 멈춘 자동화 크롬을 먼저 되살린다 (홈판·통계·예약이 모두 크롬을 쓴다)
. (Join-Path $PSScriptRoot 'lib-detach.ps1')
try { $hn = Repair-HungChrome; if ($hn) { Note $hn } } catch {}
# 2026-11-09: 위에서 다른 작업이 돌지 않는 것을 확인했으니 쌓인 탭을 정리한다 (11/8 72개로 크롬 멈춤)
try { $tn = Clear-ExtraTabs 15; if ($tn) { Note $tn } } catch {}
try {
  $hm = $now.ToString('HHmm')
  $hfOut = Join-Path $repo "dumps\homefeed\$today\$hm"
  New-Item -ItemType Directory -Force -Path (Split-Path $hfOut) | Out-Null
  & node scripts/homefeed-snapshot.mjs --out $hfOut 2>&1 | Out-Null
  $hfDest = Join-Path $drive "ClaudeWorkspace\homefeed\$today"
  New-Item -ItemType Directory -Force -Path $hfDest | Out-Null
  Get-ChildItem "$hfOut*" | Copy-Item -Destination $hfDest -Force
  Note "홈판 화면 읽기 → Drive homefeed\$today\$hm"
} catch { Note "홈판 화면 읽기 실패: $($_.Exception.Message)" }
# 2026-11-05 고장 고침: 아침 블로그 통계가 크롬이 닫혀 중간에 끊긴 날은 여기서 다시 읽는다 (다 읽은 날은 blog-stats.ps1 이 바로 끝냄)
try { & (Join-Path $PSScriptRoot 'blog-stats.ps1') | Out-Null } catch { Note "블로그 통계 다시 읽기 실패: $($_.Exception.Message)" }
# 2026-11-07 고장 고침: 아침에 크롬이 멈춰 티스토리 상태·구글 색인 요청을 못 한 날은 여기서 다시 한다 (오늘 이미 했으면 두 스크립트가 바로 끝냄)
try { & (Join-Path $PSScriptRoot 'tistory-stats.ps1') | Out-Null } catch { Note "티스토리 상태 다시 읽기 실패: $($_.Exception.Message)" }
try { & (Join-Path $PSScriptRoot 'sc-request.ps1') | Out-Null } catch { Note "색인 생성 요청 다시 하기 실패: $($_.Exception.Message)" }
# 네이버 클립 하루 1편 (2026-11-05 사용자) — 발행된 오늘 글로 세로 영상을 만들어 올린다. 화면 확인 전에는 살펴보기·시험만 (clip-day.ps1)
try { $cl = & (Join-Path $PSScriptRoot 'clip-day.ps1') | Select-Object -Last 1; if ($cl) { Note "$cl" } } catch { Note "클립 실패: $($_.Exception.Message)" }
$pendingFor = {
  param($date, $folder, $prefix)
  $lockDir = Join-Path $drive "ClaudeWorkspace\run-locks\$date"
  @(Get-ChildItem (Join-Path $repo "$folder\$date-*.md") | Where-Object {
    -not (Test-Path (Join-Path $lockDir ("{0}{1}.done" -f $prefix, $_.BaseName)))
  }).Count
}

$did = @()
foreach ($i in 0..2) {
  if ($late -and $i -eq 0) { Note '21시 이후라 오늘 글은 건너뜀'; continue }
  $d = $now.AddDays($i).ToString('yyyy-MM-dd')
  $n = & $pendingFor $d 'content\posts' ''
  if ($n -gt 0) {
    Note "네이버 $d 남은 글 $n편 → 다시 예약 시작"
    & (Join-Path $PSScriptRoot 'draft-day.ps1') -Reserve -Date $d
    $did += "네이버 $d $n편"
  }
}
$t = if ($late) { 0 } else { & $pendingFor $today 'content\tistory' 'tistory-' }
if ($t -gt 0) {
  Note "티스토리 $today 남은 글 $t편 → 다시 예약 시작"
  & (Join-Path $PSScriptRoot 'tistory-day.ps1') -Reserve -RetryDrafts
  $did += "티스토리 $today $t편"
}
if ($did.Count) { Note "다시 예약 시도 끝: $($did -join ' · ') (결과는 run-logs 의 day-<날짜>.log)" } else { Note '남은 글 없음' }
exit 0
