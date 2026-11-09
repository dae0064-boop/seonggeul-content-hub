# 블로그 배너 GPT 그림 만들기 (2026-11-09 사용자 — "블로그 배너인데 왜 인스타 실행기로?") → Drive ClaudeWorkspace\블로그배너\
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'lib-drive.ps1')
$drive = Find-MyDrive
if (-not $drive) { Write-Host 'Google Drive(내 드라이브)를 찾지 못했어요. Drive 앱이 켜져 있는지 확인해 주세요.'; exit 1 }
$dest = Join-Path $drive 'ClaudeWorkspace\블로그배너'
if (-not (Get-ChildItem $dest -Include '사진.*','profile.*' -Recurse -ErrorAction SilentlyContinue)) { Write-Host '알림: 블로그배너 폴더에 사진.png(또는 사진.jpg)가 없어 비슷한 사람으로 그려요. 본인 사진으로 하려면 사진을 넣고 다시 실행하세요.'; Write-Host '' }
node (Join-Path $repo 'scripts\blog-banner\make-gpt.mjs') --out $dest --only consult-
if ($LASTEXITCODE -eq 0) { Write-Host ''; Write-Host '완료! Claude 대화에 "배너 그림 됐어" 라고 알려 주세요.' }
else { Write-Host ''; Write-Host '실패한 그림이 있어요. 이 창을 캡처해서 Claude 대화에 붙여 주세요.' }
