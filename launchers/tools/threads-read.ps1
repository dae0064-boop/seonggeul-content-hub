# 스레드 계정 글 읽어 오기 (읽기만 — 누르지 않음) — 2026-11-02 사용자: 참고할 세 계정의 글감·예시 드는 법을 보라고 함.
# scripts/threads/read-accounts.mjs 를 돌리고 결과를 Drive ClaudeWorkspace\threads-read\<날짜_시각> 로 올린다 → Claude 가 읽고 정리한다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..\..')
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = "dumps\threads-read\$stamp"
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
& node scripts/threads/read-accounts.mjs --out $out 2>&1 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
if ($code -eq 3) { Write-Host '스레드 로그인이 안 돼 있어요. 크롬 탭에서 로그인한 뒤 이 실행기를 다시 더블클릭해 주세요.' -ForegroundColor Yellow }
if ($code -eq 2) { Write-Host '자동화용 크롬에 붙지 못했어요. 크롬 창을 모두 닫고 이 실행기를 다시 더블클릭해 주세요.' -ForegroundColor Yellow }
$drive = Find-MyDrive
if ($drive -and (Test-Path $out)) {
  $dest = Join-Path $drive "ClaudeWorkspace\threads-read\$stamp"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
  Write-Host "읽은 글을 Drive 로 올렸어요: $dest" -ForegroundColor Green
} else { Write-Host 'Google Drive 를 찾지 못해 올리지 못했어요. 이 창을 캡처해서 보여 주세요.' -ForegroundColor Yellow }
exit 0
