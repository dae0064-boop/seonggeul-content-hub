# 상담 배너 2배 선명판 (2026-11-09 사용자 "흐릿해 보여" → "2배로 다시 만들어 줘")
# 확정 배너(세로 800)와 같은 배치를 3840×1600 으로 찍는다. 바탕·카드 사진 = Drive 블로그배너, 사람 = 저장소 content/consult/banner/person-cut.png
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive(내 드라이브)를 찾지 못했어요. Drive 앱이 켜져 있는지 확인해 주세요.'; exit 1 }
$dir = Join-Path $drive 'ClaudeWorkspace\블로그배너'
$logs = Join-Path $drive 'ClaudeWorkspace\run-logs'
$log = Join-Path $logs 'banner-2x-log.txt'
"$(Get-Date -Format 'yyyy-MM-dd HH:mm') 시작" | Out-File $log -Encoding utf8
# 바탕: consult-bg-room1 이 없으면 consult-bg-room* · consult-bg* 중 첫 번째
$bg = @('consult-bg-room1.png','consult-bg-room1.jpg') | ForEach-Object { Join-Path $dir $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bg) { $bg = (Get-ChildItem $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'consult-bg*' } | Select-Object -First 1).FullName }
"폴더 그림: $((Get-ChildItem $dir -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', ')" | Out-File $log -Append -Encoding utf8
if (-not $bg) { "바탕 그림 없음" | Out-File $log -Append -Encoding utf8; Write-Host "바탕 그림(consult-bg…)을 $dir 에서 찾지 못했어요."; exit 1 }
"바탕: $bg" | Out-File $log -Append -Encoding utf8
$out = Join-Path $dir 'fresh-banner-2x.png'
node (Join-Path $repo 'content\consult\banner\fresh.mjs') --h 800 --scale 2 --bgimg $bg --photo (Join-Path $repo 'content\consult\banner\person-cut.png') --cardphotos $dir --out $out 2>&1 | Tee-Object -Variable res | Out-Host
$res | Out-File $log -Append -Encoding utf8
if ($LASTEXITCODE -eq 0 -and (Test-Path $out)) {
  Copy-Item $out (Join-Path $logs 'banner-2x.png') -Force -ErrorAction SilentlyContinue
  Write-Host ''; Write-Host "완료! 드라이브 ClaudeWorkspace\블로그배너\fresh-banner-2x.png 가 새 배너예요."; Write-Host 'Claude 대화에 "배너 됐어" 라고 알려 주세요.'
  '완료' | Out-File $log -Append -Encoding utf8
} else { '실패' | Out-File $log -Append -Encoding utf8; Write-Host ''; Write-Host '실패했어요. 이 창을 캡처해서 Claude 대화에 붙여 주세요.' }
