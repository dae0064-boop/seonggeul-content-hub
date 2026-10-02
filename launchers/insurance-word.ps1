# 스레드 보험 심의글을 한 편씩 Word 로 만들어 Google Drive 의 ClaudeWorkspace\보험글\ 에 "스레드 N편.docx" 로 저장한다.
#   powershell -ExecutionPolicy Bypass -File launchers\insurance-word.ps1           새로 생기거나 바뀐 것만
#   powershell -ExecutionPolicy Bypass -File launchers\insurance-word.ps1 -Force    전부 다시
# 고정 사진은 ClaudeWorkspace\보험글-사진\ 에서 가장 최근 사진을 쓴다. 사진을 바꾸면 Word 도 다시 만든다.
# 사진에 설계사 정보가 있어 저장소(GitHub, 공개)에는 올리지 않는다.
param([switch]$Force)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
Set-Location (Join-Path $PSScriptRoot '..')
. (Join-Path $PSScriptRoot 'lib-drive.ps1')

$drive = Find-MyDrive
if (-not $drive) {
  Write-Host "Google Drive(내 드라이브\ClaudeWorkspace)를 찾지 못했어요. Drive 가 켜져 있는지 확인해 주세요." -ForegroundColor Yellow
  exit 1
}
$photoDir = Join-Path $drive 'ClaudeWorkspace\보험글-사진'
$photo = Get-ChildItem $photoDir -File -Include *.jpg, *.jpeg, *.png -Recurse -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $photo) {
  Write-Host "고정 사진이 없어요. Drive 의 ClaudeWorkspace\보험글-사진 폴더에 사진을 넣어 주세요." -ForegroundColor Yellow
  exit 1
}

python --version *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "이 PC 에 Python 이 없어요. launchers\connect.cmd 를 먼저 실행해 주세요." -ForegroundColor Yellow
  exit 1
}
python -c "import docx" *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Word 만드는 도구를 처음 한 번 설치해요 (1분쯤)..."
  python -m pip install --user -q python-docx *> $null
}

$outRoot = Join-Path $drive 'ClaudeWorkspace\보험글'
# 한 폴더에 "스레드 1편.docx, 스레드 2편.docx ..." 로 이어서 저장한다 (2026-10-02 사용자 지시)
$sets = Get-ChildItem 'content\threads\insurance\sets\*.md' | Sort-Object Name | ForEach-Object { $_.FullName }
$pyArgs = @('scripts\threads\insurance-word.py', $photo.FullName, $outRoot) + $sets
if (-not $Force) { $pyArgs += '--skip-fresh' }
$lines = & python @pyArgs
$made = @($lines | Where-Object { $_ -like '만듦*' }).Count
$total = @($lines | Where-Object { $_ -like '만듦*' -or $_ -like '그대로 둠*' }).Count
Write-Host ""
Write-Host "Word 저장 완료: 전체 $total 편 중 새로 만든 것 $made 개 (사진: $($photo.Name))" -ForegroundColor Green
Write-Host "위치: 내 드라이브\ClaudeWorkspace\보험글 (스레드 1편 ~ 스레드 $total편)"
