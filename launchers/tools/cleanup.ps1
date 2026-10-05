# 지난 날짜 그림·화면 기록을 이 PC 에서 지운다 (2026-10-05 사용자: "이미 발행했고 지난 것들은 삭제").
# auto-day.cmd 가 하루 작업 끝에 부른다. 저장소의 지난 원고는 클라우드 아침 확인 작업이 지운다 (scripts\clean-published.mjs).
#   content\images\<날짜>-*     오늘보다 앞 날짜 글의 그림 (예약된 글은 이미 네이버·티스토리에 올라가 있다)
#   dumps\*                     3일 지난 화면 기록
#   Drive ClaudeWorkspace\run-logs·run-locks\*   14일 지난 실행 기록 (아침 확인은 어제 것만 본다)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$today = (Get-Date).ToString('yyyy-MM-dd')
$n = 0
Get-ChildItem 'content\images' -Directory | Where-Object { $_.Name -match '^(\d{4}-\d{2}-\d{2})-' -and $Matches[1] -lt $today } |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $n++ }
$cut = (Get-Date).AddDays(-3)
Get-ChildItem 'dumps' | Where-Object { $_.LastWriteTime -lt $cut } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $n++ }
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if ($drive) {
  $old = (Get-Date).AddDays(-14).ToString('yyyy-MM-dd')
  foreach ($sub in 'run-logs', 'run-locks') {
    Get-ChildItem (Join-Path $drive "ClaudeWorkspace\$sub") -Directory |
      Where-Object { $_.Name -match '(\d{4}-\d{2}-\d{2})' -and $Matches[1] -lt $old } |
      ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $n++ }
  }
}
Write-Host "지난 그림·기록 정리: $n 개 지움"
exit 0
