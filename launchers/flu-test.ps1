# "독감 무료접종 75세 이상 언제부터인가요?" 원고용 테스트 이미지.
# 대표사진 1장(정사각형) + 본문 2장(가로) = 3장을, 고른 느낌으로 만든다.
# 0 을 고르면 5가지 느낌을 전부 만든다(15장).
#
# 모델 gpt-image-2 / 품질 low. 키는 openai-key.cmd 가 저장한 OPENAI_API_KEY.
# 저장 위치: 내 사진\성글벙글 이미지\독감접종-테스트\<느낌>\
# 주사기·바늘·아픈 표정은 넣지 않는다(원고 규칙: 불안감 조성 금지).
# 날짜 같은 글자는 그림에 넣지 않고 나중에 따로 얹는다.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$MODEL   = 'gpt-image-2'
$QUALITY = 'low'
$COMMON  = 'Korean people and a Korean home or clinic. No syringes, no needles, no one in pain. ' +
           'Do not include any text, letters, numbers, logos or watermarks in the image.'

# 사람이 나오는 장면 (①②③⑤ 공통)
$PEOPLE = @(
  @{ name = '1-대표사진'; size = '1024x1024'; scene =
     '가을 햇살이 드는 아늑한 거실, 70대 후반 노부부가 벽에 걸린 달력을 함께 보며 환하게 웃고 있다. ' +
     '화면 위쪽 3분의 1은 단순한 벽 배경으로 비워 둔다(나중에 제목 글씨를 얹을 자리).' },
  @{ name = '2-본문1'; size = '1536x1024'; scene =
     '거실 소파, 40대 자녀가 70대 후반 어머니 옆에 앉아 휴대폰 화면을 함께 보며 가까운 병원을 찾아보고 있다. 다정한 분위기.' },
  @{ name = '3-본문2'; size = '1536x1024'; scene =
     '밝고 깨끗한 동네 의원 접수대, 70대 후반 할머니가 접수 직원에게 웃으며 접수하고 있다. 대기실 의자와 화분이 보인다.' }
)

# 물건 중심 장면 (④)
$STILL = @(
  @{ name = '1-대표사진'; size = '1024x1024'; scene =
     '나무 테이블 위 가을 벽달력, 돋보기 안경, 김이 나는 따뜻한 차 한 잔. ' +
     '화면 위쪽 3분의 1은 단순한 배경으로 비워 둔다(나중에 제목 글씨를 얹을 자리).' },
  @{ name = '2-본문1'; size = '1536x1024'; scene =
     '나무 테이블 위 휴대폰, 낡은 가죽 수첩, 볼펜, 돋보기 안경이 가지런히 놓여 있다.' },
  @{ name = '3-본문2'; size = '1536x1024'; scene =
     '나무 테이블 위 작은 지갑, 부드러운 니트 머플러, 동그란 반창고 하나가 놓여 있다.' }
)

$STYLES = [ordered]@{
  '1' = @{ dir = '1-생활사진';   scenes = $PEOPLE; style = '자연광, 휴대폰으로 찍은 듯한 생활 사진, 따뜻한 색감, 과하지 않은 보정.' }
  '2' = @{ dir = '2-수채화';     scenes = $PEOPLE; style = '부드러운 수채화 일러스트, 따뜻한 파스텔 톤, 종이 질감, 여백 많게.' }
  '3' = @{ dir = '3-플랫';       scenes = $PEOPLE; style = '플랫 벡터 일러스트, 단순한 형태, 연한 베이지 배경, 색은 3~4가지만.' }
  '4' = @{ dir = '4-정물사진';   scenes = $STILL;  style = '정물 사진, 부드러운 창가 빛, 45도 구도, 차분한 색감.' }
  '5' = @{ dir = '5-클레이3D';   scenes = $PEOPLE; style = '말랑한 클레이 3D 캐릭터, 파스텔 톤, 부드러운 조명, 둥근 형태.' }
}

function Ok($s)   { Write-Host "  [OK] $s" -ForegroundColor Green }
function Bad($s)  { Write-Host "  [X]  $s" -ForegroundColor Red }
function Info($s) { Write-Host "       $s" }

Write-Host ''
Write-Host '  ==============================================='
Write-Host '    독감 무료접종 원고 - 테스트 이미지'
Write-Host "    ($MODEL / $QUALITY)"
Write-Host '  ==============================================='
Write-Host ''

$key = $env:OPENAI_API_KEY
if (-not $key) { $key = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User') }
if (-not $key) {
  Bad '이 컴퓨터에 OpenAI 키가 없어요.'
  Info '같은 폴더의 openai-key.cmd 를 먼저 더블클릭해서 키를 넣으세요.'
  exit 1
}

Info '어떤 느낌으로 만들까요? 번호를 누르고 Enter.'
Write-Host ''
Info '1 = 생활 사진      (3장, 약 30원)'
Info '2 = 수채화 그림    (3장, 약 30원)'
Info '3 = 플랫 일러스트  (3장, 약 30원)'
Info '4 = 물건 정물 사진 (3장, 약 30원)'
Info '5 = 클레이 3D      (3장, 약 30원)'
Info '0 = 전부 비교하기  (15장, 약 150원)'
Write-Host ''
$pick = (Read-Host '  번호').Trim()

if ($pick -eq '0') { $keys = @($STYLES.Keys) }
elseif ($STYLES.Contains($pick)) { $keys = @($pick) }
else {
  Bad '1~5 또는 0 중에서 골라주세요. 창을 닫고 다시 해보세요.'
  exit 1
}

$root = Join-Path ([Environment]::GetFolderPath('MyPictures')) '성글벙글 이미지\독감접종-테스트'
$total = $keys.Count * 3
$done = 0; $failed = 0

foreach ($k in $keys) {
  $st = $STYLES[$k]
  $dir = Join-Path $root $st.dir
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Host ''
  Write-Host "  --- $($st.dir) ---"

  foreach ($sc in $st.scenes) {
    $n = $done + $failed + 1
    Info "[$n/$total] $($sc.name) 그리는 중... (20초~1분)"
    $body = @{
      model   = $MODEL
      prompt  = "$($sc.scene)`n스타일: $($st.style)`n`n$COMMON"
      size    = $sc.size
      quality = $QUALITY
      n       = 1
    } | ConvertTo-Json -Compress
    try {
      $res = Invoke-RestMethod -Method Post -Uri 'https://api.openai.com/v1/images/generations' `
        -Headers @{ Authorization = "Bearer $key" } `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 300
      $file = Join-Path $dir ($sc.name + '.png')
      [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($res.data[0].b64_json))
      Ok "$($st.dir)\$($sc.name).png"
      $done++
    } catch {
      $failed++
      $code = $null
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      $detail = $_.ErrorDetails.Message
      try { $detail = ($detail | ConvertFrom-Json).error.message } catch {}
      if (-not $detail) { $detail = $_.Exception.Message }
      Bad "$($sc.name) 실패 (HTTP $code)"
      Info "OpenAI 메시지: $detail"
      # 키·결제·인증 문제는 다음 장도 똑같이 실패하므로 바로 멈춘다
      if ($code -in 401, 403, 429 -or $detail -match 'verif|billing|quota') {
        Write-Host ''
        if ($code -eq 401) { Info '키가 맞지 않아요. openai-key.cmd 로 다시 넣으세요.' }
        elseif ($detail -match 'verif') { Info 'gpt-image-2 는 조직 인증이 필요해요: https://platform.openai.com/settings/organization/general' }
        else { Info '결제/한도를 확인하세요: https://platform.openai.com/settings/organization/billing' }
        Info '이 메시지를 그대로 Claude 에게 알려주세요 (키는 보내지 마세요).'
        exit 1
      }
    }
  }
}

Write-Host ''
Write-Host '  ==============================================='
if ($failed) { Write-Host "    끝났어요. 성공 $done 장 / 실패 $failed 장" }
else         { Write-Host "    끝났어요. $done 장 모두 만들었어요." }
Write-Host '    사진 폴더를 열어 드릴게요.'
Write-Host '  ==============================================='
Invoke-Item $root
