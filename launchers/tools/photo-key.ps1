# 사진 찾기 키 2개(플리커·픽사베이)를 이 컴퓨터에 저장한다 (2026-11-03 사용자 — "위키미디어 말고 다른 곳도"). photo-key.cmd 를 더블클릭하면 실행된다.
# 키는 Windows 사용자 환경 변수 FLICKR_API_KEY · PIXABAY_API_KEY 에 넣는다. 화면에는 앞 3자·끝 4자만 보인다.
# 확인은 검색 한 번뿐이라 요금이 없다(둘 다 무료). 하나만 넣어도 된다 — 그냥 Enter 면 건너뛴다.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Mask($k) { return $k.Substring(0, 3) + '...' + $k.Substring($k.Length - 4) }
function Ok($s)   { Write-Host "  [OK] $s" -ForegroundColor Green }
function Bad($s)  { Write-Host "  [X]  $s" -ForegroundColor Red }
function Info($s) { Write-Host "       $s" }
function ReadKey($label) {
  $secure = Read-Host "  $label 키 (그냥 Enter = 건너뛰기)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $k = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  return ($k -replace '\s', '')
}

Write-Host ''
Write-Host '  ==============================================='
Write-Host '    사진 찾기 키 설정 (플리커 · 픽사베이)'
Write-Host '  ==============================================='
Write-Host ''
Info '복사한 키를 붙여넣으세요 (마우스 오른쪽 클릭 또는 Ctrl+V).'
Info '붙여넣어도 화면에는 * 로만 보여요. 정상이에요. 그다음 Enter.'
Write-Host ''

# 1) 플리커
$old = [Environment]::GetEnvironmentVariable('FLICKR_API_KEY', 'User')
if ($old) { Info "플리커: 이미 키가 있어요 ($(Mask $old)). 바꾸려면 새 키를, 아니면 그냥 Enter." }
$k = ReadKey '플리커(Flickr)'
if ($k) {
  try {
    $r = Invoke-RestMethod -Uri "https://www.flickr.com/services/rest/?method=flickr.test.echo&api_key=$k&format=json&nojsoncallback=1" -TimeoutSec 20
    if ($r.stat -eq 'ok') { [Environment]::SetEnvironmentVariable('FLICKR_API_KEY', $k, 'User'); Ok "플리커 키 정상, 저장했어요: $(Mask $k)" }
    else { Bad "플리커가 키를 거절했어요 ($($r.message)). 저장하지 않았어요."; Info '플리커 앱 화면의 "Key"(긴 글자) 쪽을 복사했는지 보세요. "Secret" 이 아니에요.' }
  } catch { Bad "플리커에 접속하지 못했어요 ($($_.Exception.Message)). 키는 일단 저장해 둘게요."; [Environment]::SetEnvironmentVariable('FLICKR_API_KEY', $k, 'User') }
} elseif (-not $old) { Info '플리커는 건너뛰었어요.' }
Write-Host ''

# 2) 픽사베이 (2026-11-03 — 펙셀스가 새 키 발급을 멈춰 대신)
$old = [Environment]::GetEnvironmentVariable('PIXABAY_API_KEY', 'User')
if ($old) { Info "픽사베이: 이미 키가 있어요 ($(Mask $old)). 바꾸려면 새 키를, 아니면 그냥 Enter." }
$k = ReadKey '픽사베이(Pixabay)'
if ($k) {
  try {
    $r = Invoke-RestMethod -Uri "https://pixabay.com/api/?key=$k&q=apartment&per_page=3" -TimeoutSec 20
    if ($null -ne $r.totalHits) { [Environment]::SetEnvironmentVariable('PIXABAY_API_KEY', $k, 'User'); Ok "픽사베이 키 정상, 저장했어요: $(Mask $k)" }
    else { Bad '픽사베이 답이 이상해요. 저장하지 않았어요.' }
  } catch {
    $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 400 -or $code -eq 401 -or $code -eq 403) { Bad '픽사베이가 키를 거절했어요. 저장하지 않았어요.'; Info 'https://pixabay.com/api/docs/ 의 key 옆 글자를 다시 복사해 보세요.' }
    else { Bad "픽사베이에 접속하지 못했어요 ($($_.Exception.Message)). 키는 일단 저장해 둘게요."; [Environment]::SetEnvironmentVariable('PIXABAY_API_KEY', $k, 'User') }
  }
} elseif (-not $old) { Info '픽사베이는 건너뛰었어요.' }

Write-Host ''
Write-Host '  ==============================================='
Write-Host '    끝났어요. 이 창은 닫아도 됩니다.'
Write-Host '    다음 아침 실행부터 이 키로 사진을 찾아요.'
Write-Host '  ==============================================='
