# 실행 결과를 Google Drive 의 ClaudeWorkspace\run-logs\ 로 올린다. Claude 가 Drive 에서 읽고 확인한다.
#   powershell -ExecutionPolicy Bypass -File launchers\share-run.ps1                 가장 최근 기록
#   powershell -ExecutionPolicy Bypass -File launchers\share-run.ps1 -Since <시각>   draft-day 가 끝날 때 부른다
# 저장소가 공개라서 GitHub 에는 올리지 않는다 (네이버 편집 화면 스크린샷이 들어 있다).
# 올리는 것: 실행 기록(.log), 이번 실행의 화면 스크린샷·만든 이미지(작게 줄인 JPG). HTML 덤프·.env 는 올리지 않는다.
param(
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [datetime]$Since = (Get-Date).AddHours(-6)
)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot '..')

function Find-MyDrive {
  if ($env:CLAUDE_DRIVE_ROOT -and (Test-Path $env:CLAUDE_DRIVE_ROOT)) { return $env:CLAUDE_DRIVE_ROOT }
  $names = @('내 드라이브', 'My Drive')
  $bases = @([char[]]'GHIJKLMNOPQRSTUVWXYZDEF' | ForEach-Object { "$($_):\" }) + @($env:USERPROFILE, (Join-Path $env:USERPROFILE 'Google Drive'))
  foreach ($b in $bases) {
    foreach ($n in $names) {
      $p = Join-Path $b $n
      if (Test-Path (Join-Path $p 'ClaudeWorkspace')) { return $p }
    }
  }
  return $null
}

Add-Type -AssemblyName System.Drawing
function Save-Small($src, $dest, [int]$maxW) {
  try {
    $img = [System.Drawing.Image]::FromFile((Resolve-Path $src))
    $w = [Math]::Min($maxW, $img.Width); $h = [int]($img.Height * $w / $img.Width)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($img, 0, 0, $w, $h)
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 80L
    $bmp.Save($dest, $codec, $ep)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  } catch { Copy-Item $src ($dest -replace '\.jpg$', '.png') -ErrorAction SilentlyContinue }
}

$drive = Find-MyDrive
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
if ($drive) { $out = Join-Path $drive "ClaudeWorkspace\run-logs\$stamp" }
else { $out = "dumps\share\$stamp" }
New-Item -ItemType Directory -Force -Path $out | Out-Null

# 1) 실행 기록
Get-ChildItem "dumps\day-$Date*.log" -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item $_.FullName $out }

# 2) 이번 실행의 화면 스크린샷 (글마다 폴더를 나눈다)
$shots = Get-ChildItem dumps -Directory -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $Since }
foreach ($d in $shots) {
  $dst = Join-Path $out "screens\$($d.Name)"
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Get-ChildItem $d.FullName -Filter *.png | ForEach-Object { Save-Small $_.FullName (Join-Path $dst ($_.BaseName + '.jpg')) 1000 }
}

# 3) 이번 실행에서 만든 이미지 (글씨 얹은 최종본만)
Get-ChildItem "content\images\$Date-*" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $slug = $_.Name
  $files = Get-ChildItem $_.FullName -Filter *.png | Where-Object { $_.Name -notlike '*.raw.png' -and $_.LastWriteTime -ge $Since }
  if ($files) {
    $dst = Join-Path $out "images\$slug"
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    $files | ForEach-Object { Save-Small $_.FullName (Join-Path $dst ($_.BaseName + '.jpg')) 512 }
  }
}

$n = (Get-ChildItem $out -Recurse -File).Count
if ($drive) {
  Write-Host "`n결과를 Google Drive 에 올렸어요 ($n개 파일): ClaudeWorkspace\run-logs\$stamp" -ForegroundColor Green
  Write-Host 'Drive 동기화가 끝나면 Claude 에게 "결과 확인해줘" 라고 말해 주세요.' -ForegroundColor Green
} else {
  Write-Host "`nGoogle Drive(내 드라이브\ClaudeWorkspace)를 찾지 못해 이 PC 에만 모았어요: $out" -ForegroundColor Yellow
  Write-Host '이 폴더의 .log 파일 내용을 Claude 에게 붙여 넣어 주세요.' -ForegroundColor Yellow
}
