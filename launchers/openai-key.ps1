# OpenAI API 키를 이 컴퓨터에 저장한다. openai-key.cmd 를 더블클릭하면 실행된다.
#
# 키는 Windows 사용자 환경 변수 OPENAI_API_KEY 에 넣는다.
# 저장소 스크립트는 .env 보다 환경 변수를 먼저 읽으므로 .env 를 따로 만들 필요가 없다.
# 키 값은 화면에 찍지 않는다. 앞 3자와 끝 4자만 보여준다.
# 확인은 모델 목록 조회만 하므로 요금이 나가지 않는다.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Mask($k) { return $k.Substring(0, 3) + '...' + $k.Substring($k.Length - 4) }
function Ok($s)   { Write-Host "  [OK] $s" -ForegroundColor Green }
function Bad($s)  { Write-Host "  [X]  $s" -ForegroundColor Red }
function Info($s) { Write-Host "       $s" }

Write-Host ''
Write-Host '  ==============================================='
Write-Host '    OpenAI API 키 설정'
Write-Host '  ==============================================='
Write-Host ''

$old = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User')
if ($old -and $old.Length -gt 8) {
  Write-Host "  이 컴퓨터에는 이미 키가 있어요: $(Mask $old)"
  $ans = Read-Host '  새 키로 바꿀까요? (y = 바꾸기 / 그냥 Enter = 그대로 두기)'
  if ($ans -notmatch '^[yYㅛ]') {
    Write-Host ''
    Ok '바꾸지 않았어요. 지금 키를 그대로 씁니다.'
    exit 0
  }
  Write-Host ''
}

Info '1) OpenAI 사이트에서 복사한 키(sk- 로 시작)를'
Info '   아래에 붙여넣으세요. 마우스 오른쪽 클릭 또는 Ctrl+V'
Info '2) 붙여넣어도 화면에는 * 로만 보여요. 정상이에요.'
Info '3) 붙여넣은 뒤 Enter 를 누르세요.'
Write-Host ''

$secure = Read-Host '  키' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$key = ($key -replace '\s', '')

Write-Host ''
if (-not $key) {
  Bad '아무것도 붙여넣지 않았어요.'
  Info '이 창을 닫고 다시 더블클릭해서 해보세요.'
  exit 1
}
if (-not $key.StartsWith('sk-') -or $key.Length -lt 20) {
  Bad '키 모양이 이상해요. sk- 로 시작하는 긴 글자여야 해요.'
  Info 'https://platform.openai.com/api-keys 에서 다시 만들어 복사하세요.'
  exit 1
}
Ok "키를 받았어요: $(Mask $key)"

Write-Host '       OpenAI 에 접속해서 키가 맞는지 보는 중...'
$models = $null
try {
  $res = Invoke-RestMethod -Uri 'https://api.openai.com/v1/models' `
    -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 20
  $models = @($res.data | ForEach-Object { $_.id })
} catch {
  $code = $null
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 401) {
    Bad '키가 틀렸거나 지워진 키예요. 저장하지 않았어요.'
    Info 'https://platform.openai.com/api-keys 에서 새로 만들어 다시 해보세요.'
    exit 1
  }
  if ($code -eq 429) {
    Bad '결제 수단이나 크레딧이 없어요. 키는 저장해 둘게요.'
    Info 'https://platform.openai.com/settings/organization/billing 에서 결제를 등록하세요.'
  } else {
    Bad "OpenAI 에 접속하지 못했어요 ($($_.Exception.Message))"
    Info '인터넷 연결을 확인하세요. 키는 일단 저장해 둘게요.'
  }
}

[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $key, 'User')
Ok '이 컴퓨터에 키를 저장했어요.'

if ($models) {
  Ok "키가 정상이에요. 쓸 수 있는 모델 $($models.Count)개"
  $image = @($models | Where-Object { $_ -match '^(gpt-image|dall-e)' })
  if ($image.Count) { Ok "이미지 모델: $($image -join ', ')" }
  else {
    Write-Host '  [!]  이미지 모델이 아직 안 보여요.' -ForegroundColor Yellow
    Info '원고는 바로 쓸 수 있어요. 이미지는 OpenAI 조직 인증이 필요할 수 있어요.'
  }
}

Write-Host ''
Write-Host '  ==============================================='
Write-Host '    끝났어요. 이 창은 닫아도 됩니다.'
Write-Host '    (이미 열려 있던 Claude/터미널 창은 한 번 껐다 켜야 키를 알아봐요)'
Write-Host '  ==============================================='
