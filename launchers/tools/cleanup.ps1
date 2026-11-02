# 지난 날짜 그림·화면 기록을 이 PC 에서 지운다 (2026-10-05 사용자: "이미 발행했고 지난 것들은 삭제").
# auto-day.cmd 가 하루 작업 끝에 부른다. 저장소의 지난 원고는 클라우드 아침 확인 작업이 지운다 (scripts\clean-published.mjs).
#   content\images\<날짜>-*     오늘보다 앞 날짜 글의 그림 (예약된 글은 이미 네이버·티스토리에 올라가 있다)
#   dumps\*                     3일 지난 화면 기록
#   Drive ClaudeWorkspace\ 날짜 폴더   14일(통계는 35일) 지난 기록 — 아래 $rules
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$today = (Get-Date).ToString('yyyy-MM-dd')
$n = 0
# 다와이철거(2026-10-26): 아직 저장소에 남은 철거 원고(못 올려 다음 날로 밀린 글)의 그림은 지우지 않는다 — 다시 만들면 돈이 든다
$keep = @(Get-ChildItem 'content\chulgeo\posts\*.md' -ErrorAction SilentlyContinue | ForEach-Object { $_.BaseName })
Get-ChildItem 'content\images' -Directory | Where-Object { $_.Name -match '^(\d{4}-\d{2}-\d{2})-' -and $Matches[1] -lt $today -and $keep -notcontains $_.Name } |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $n++ }
# 시험 그림(2026-10-26 사용자 — "테스트 이미지들도 다 삭제"): 실행기 style-test.cmd 와 함께 없앴다
Get-ChildItem 'content\images' -Directory -Filter 'style-test-*' | ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $n++ }
$cut = (Get-Date).AddDays(-3)
Get-ChildItem 'dumps' -Force | Where-Object { $_.LastWriteTime -lt $cut } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $n++ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive) {
  # 2026-11-02 사용자 "사용하지 않거나 오래된 파일 모두 삭제": 날짜 폴더가 쌓이는 곳을 모두 정리한다.
  #   14일: 실행 기록·검색량(저장소 title-keywords 에 옮겨 둠)·이슈·홈판·색인 요청·스레드 화면 기록
  #   35일: 블로그·티스토리 통계 화면 (2주마다 일요일 점검이 지난 28일을 견준다. 숫자는 stats-log.md 에도 쌓인다)
  #   날짜 이름이 아닌 것(requested.tsv 같은 상태 파일, 보험글 Word, goms-done 표시)은 건드리지 않는다.
  $old = (Get-Date).AddDays(-14).ToString('yyyy-MM-dd')
  $old35 = (Get-Date).AddDays(-35).ToString('yyyy-MM-dd')
  $rules = @(
    @{ Sub = 'run-logs'; Cut = $old }, @{ Sub = 'run-locks'; Cut = $old }, @{ Sub = 'run-logs\threads'; Cut = $old },
    @{ Sub = 'keyword-volume'; Cut = $old }, @{ Sub = 'issues'; Cut = $old }, @{ Sub = 'homefeed'; Cut = $old },
    @{ Sub = 'index-requests'; Cut = $old }, @{ Sub = 'threads-web'; Cut = $old }, @{ Sub = 'threads-read'; Cut = $old },
    @{ Sub = 'blog-stats'; Cut = $old35 }, @{ Sub = 'tistory-stats'; Cut = $old35 }
  )
  foreach ($r in $rules) {
    $dir = Join-Path $drive "ClaudeWorkspace\$($r.Sub)"
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem $dir |
      Where-Object { $_.Name -match '(\d{4}-\d{2}-\d{2})' -and $Matches[1] -lt $r.Cut } |
      ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $n++ }
  }
  $st = Join-Path $drive 'ClaudeWorkspace\style-test'
  if (Test-Path $st) { Remove-Item $st -Recurse -Force; $n++ }
}
Write-Host "지난 그림·기록 정리: $n 개 지움"
exit 0
