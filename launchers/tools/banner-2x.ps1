# 상담 배너 2배 선명판 (2026-11-09 사용자 "흐릿해 보여" → "2배로 다시 만들어 줘")
# 확정 배너(세로 800)와 같은 배치를 3840×1600 으로 찍는다. 바탕·카드 사진 = Drive 블로그배너, 사람 = 저장소 content/consult/banner/person-cut.png
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive(내 드라이브)를 찾지 못했어요. Drive 앱이 켜져 있는지 확인해 주세요.'; exit 1 }
$dir = Join-Path $drive 'ClaudeWorkspace\블로그배너'
$bg = Join-Path $dir 'consult-bg-room1.png'
if (-not (Test-Path $bg)) { Write-Host "바탕 그림이 없어요: $bg"; exit 1 }
$out = Join-Path $dir 'fresh-banner-2x.png'
node (Join-Path $repo 'content\consult\banner\fresh.mjs') --h 800 --scale 2 --bgimg $bg --photo (Join-Path $repo 'content\consult\banner\person-cut.png') --cardphotos $dir --out $out
if ($LASTEXITCODE -eq 0 -and (Test-Path $out)) {
  $logs = Join-Path $drive 'ClaudeWorkspace\run-logs'
  Copy-Item $out (Join-Path $logs 'banner-2x.png') -Force -ErrorAction SilentlyContinue
  Write-Host ''; Write-Host "완료! 드라이브 ClaudeWorkspace\블로그배너\fresh-banner-2x.png 가 새 배너예요."; Write-Host 'Claude 대화에 "배너 됐어" 라고 알려 주세요.'
} else { Write-Host ''; Write-Host '실패했어요. 이 창을 캡처해서 Claude 대화에 붙여 주세요.' }
