# 블로그 이미지 만들기. image.cmd 를 더블클릭하면 실행된다.
#
# 모델 gpt-image-2, 품질 low. 1장에 약 0.006달러(약 8원).
# 키는 openai-key.cmd 가 저장한 사용자 환경 변수 OPENAI_API_KEY 를 쓴다.
# 사진은 내 사진(Pictures)\성글벙글 이미지 폴더에 저장한다.
# 한글 글씨는 싼 모델에서 깨지므로 그림에 글자를 넣지 말라고 항상 덧붙인다.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$MODEL   = 'gpt-image-2'
$QUALITY = 'low'
$NO_TEXT = 'Do not include any text, letters, numbers, logos or watermarks in the image.'

function Ok($s)   { Write-Host "  [OK] $s" -ForegroundColor Green }
function Bad($s)  { Write-Host "  [X]  $s" -ForegroundColor Red }
function Info($s) { Write-Host "       $s" }

Write-Host ''
Write-Host '  ==============================================='
Write-Host "    블로그 이미지 만들기  ($MODEL / $QUALITY)"
Write-Host '  ==============================================='
Write-Host ''

$key = $env:OPENAI_API_KEY
if (-not $key) { $key = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User') }
if (-not $key) {
  Bad '이 컴퓨터에 OpenAI 키가 없어요.'
  Info '같은 폴더의 openai-key.cmd 를 먼저 더블클릭해서 키를 넣으세요.'
  exit 1
}

$outDir = Join-Path ([Environment]::GetFolderPath('MyPictures')) '성글벙글 이미지'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$sizes = @{ '1' = '1024x1024'; '2' = '1536x1024'; '3' = '1024x1536' }

while ($true) {
  Info '어떤 그림을 원하세요? 한 문장으로 적고 Enter 를 누르세요.'
  Info '예) 가을 아침 거실에서 선풍기 날개를 닦는 모습, 따뜻한 햇살, 사진 느낌'
  Info '(아무것도 안 쓰고 Enter 를 누르면 끝나요)'
  Write-Host ''
  $prompt = Read-Host '  그림 설명'
  if (-not $prompt.Trim()) { break }

  Write-Host ''
  Info '모양을 고르세요.  1 = 정사각형(대표사진)   2 = 가로   3 = 세로'
  $pick = Read-Host '  번호 (그냥 Enter = 1)'
  $size = $sizes[$pick.Trim()]
  if (-not $size) { $size = '1024x1024' }

  $body = @{
    model   = $MODEL
    prompt  = "$prompt`n`n$NO_TEXT"
    size    = $size
    quality = $QUALITY
    n       = 1
  } | ConvertTo-Json -Compress

  Write-Host ''
  Info '그리는 중이에요... (보통 20초~1분 걸려요)'
  try {
    $res = Invoke-RestMethod -Method Post -Uri 'https://api.openai.com/v1/images/generations' `
      -Headers @{ Authorization = "Bearer $key" } `
      -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 300
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $detail = $_.ErrorDetails.Message
    try { $detail = ($detail | ConvertFrom-Json).error.message } catch {}
    if ($code -eq 401) {
      Bad '키가 맞지 않아요. openai-key.cmd 로 키를 다시 넣으세요.'
    } elseif ($code -eq 429) {
      Bad '결제 한도나 크레딧이 부족해요.'
      Info 'https://platform.openai.com/settings/organization/billing 을 확인하세요.'
    } elseif ($detail -match 'verif') {
      Bad 'gpt-image-2 는 OpenAI 조직 인증을 해야 쓸 수 있어요.'
      Info 'https://platform.openai.com/settings/organization/general 에서 Verify Organization'
    } elseif ($detail -match 'safety|moderation|rejected') {
      Bad '그림 설명이 OpenAI 안전 기준에 걸렸어요. 표현을 바꿔서 다시 해보세요.'
    } else {
      Bad "만들지 못했어요 (HTTP $code)"
    }
    if ($detail) { Info "OpenAI 메시지: $detail" }
    Write-Host ''
    continue
  }

  $b64 = $res.data[0].b64_json
  if (-not $b64) {
    Bad 'OpenAI 가 그림을 보내주지 않았어요. 다시 해보세요.'
    Write-Host ''
    continue
  }

  $file = Join-Path $outDir ((Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
  [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($b64))
  Ok "저장했어요: $file"
  Invoke-Item $file
  Write-Host ''
  Write-Host '  -----------------------------------------------'
  Info '한 장 더 만들 수 있어요. 끝내려면 그냥 Enter.'
  Write-Host ''
}

Write-Host ''
Ok "끝났어요. 사진은 여기 있어요: $outDir"
Invoke-Item $outDir
