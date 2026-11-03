# 오픈버스(Openverse) 가입 + 키 저장 (2026-11-03 사용자 "오픈버스 가입해"). openverse-key.cmd 를 더블클릭하면 실행된다.
# 1) 이메일을 받아 오픈버스 API 에 앱을 등록 → client_id·client_secret 을 Windows 사용자 환경 변수 OPENVERSE_CLIENT_ID·OPENVERSE_CLIENT_SECRET 에 저장
# 2) 그 이메일로 온 인증 링크를 사람이 한 번 누른다
# 3) 다시 실행하면(이미 키가 있으면) 토큰을 받아 검색 한 번으로 확인만 한다
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Ok($s)   { Write-Host "  [OK] $s" -ForegroundColor Green }
function Bad($s)  { Write-Host "  [X]  $s" -ForegroundColor Red }
function Info($s) { Write-Host "       $s" }
$api = 'https://api.openverse.org/v1'
Write-Host ''
Write-Host '  ==============================================='
Write-Host '    오픈버스(무료 사진 검색) 가입 · 키 저장'
Write-Host '  ==============================================='
Write-Host ''

$id = [Environment]::GetEnvironmentVariable('OPENVERSE_CLIENT_ID', 'User')
$secret = [Environment]::GetEnvironmentVariable('OPENVERSE_CLIENT_SECRET', 'User')
if (-not ($id -and $secret)) {
  Info '인증 메일을 받을 이메일 주소를 적고 Enter 를 누르세요.'
  $email = (Read-Host '  이메일').Trim()
  if ($email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { Bad '이메일 모양이 아니에요. 다시 실행해 주세요.'; exit 1 }
  $body = @{ name = "seonggeul-blog-$(Get-Date -Format 'yyMMddHHmm')"; description = 'Find CC-licensed photos (CC BY, CC0) for my personal blog articles, with credit.'; email = $email } | ConvertTo-Json
  try {
    Info '가입 요청 중... 인증 메일을 보내느라 1~2분 걸릴 수 있어요. 창을 닫지 마세요.'
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $r = $null
    for ($try = 1; $try -le 2 -and -not $r; $try++) {
      try { $r = Invoke-RestMethod -Method Post -Uri "$api/auth_tokens/register/" -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 150 }
      catch { if ($try -ge 2 -or $_.ErrorDetails.Message) { throw }; Info "응답이 없어 한 번 더 해 볼게요 ($($_.Exception.Message))" }
    }
  } catch {
    Bad "가입 요청이 실패했어요 ($($_.Exception.Message))"
    if ($_.ErrorDetails.Message) { Info $_.ErrorDetails.Message }
    Info '이미 인증 메일이 왔다면 그 링크를 눌러 두세요(키는 받지 못해 다시 가입해야 해요). 이 화면을 캡처해서 보내 주세요.'; exit 1
  }
  if (-not $r.client_id -or -not $r.client_secret) { Bad '가입 답에 키가 없어요. 이 화면을 캡처해서 보내 주세요.'; exit 1 }
  [Environment]::SetEnvironmentVariable('OPENVERSE_CLIENT_ID', $r.client_id, 'User')
  [Environment]::SetEnvironmentVariable('OPENVERSE_CLIENT_SECRET', $r.client_secret, 'User')
  $id = $r.client_id; $secret = $r.client_secret
  Ok '가입했어요. 키를 이 컴퓨터에 저장했어요.'
  Write-Host ''
  Write-Host "  ▶ 지금 $email 메일함을 열어 오픈버스(Openverse)에서 온 메일의 인증 링크를 눌러 주세요." -ForegroundColor Yellow
  Info '스팸함에 있을 수도 있어요. 누른 뒤 이 창으로 돌아와 Enter 를 누르세요.'
  Read-Host '  인증 링크를 눌렀으면 Enter' | Out-Null
}

# 확인: 토큰 → 검색 한 번
try {
  $t = Invoke-RestMethod -Method Post -Uri "$api/auth_tokens/token/" -ContentType 'application/x-www-form-urlencoded' -Body "grant_type=client_credentials&client_id=$id&client_secret=$secret" -TimeoutSec 90
  $s = Invoke-RestMethod -Uri "$api/images/?q=Seoul&license_type=commercial&page_size=3" -Headers @{ Authorization = "Bearer $($t.access_token)" } -TimeoutSec 90
  Ok "오픈버스 검색 정상 (Seoul 사진 $($s.result_count)장 찾음). 다음 실행부터 써요."
} catch {
  Bad "아직 확인이 안 돼요 ($($_.Exception.Message))"
  if ($_.ErrorDetails.Message) { Info $_.ErrorDetails.Message }
  Info '메일의 인증 링크를 아직 안 눌렀다면 누른 뒤 이 실행기를 한 번 더 더블클릭하세요(다시 가입하지 않고 확인만 해요).'
}
Write-Host ''
Write-Host '  ==============================================='
Write-Host '    끝났어요. 이 창은 닫아도 됩니다.'
Write-Host '  ==============================================='
