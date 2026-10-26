# 스레드 연결 키(액세스 토큰)를 이 컴퓨터에 저장한다. threads-key.cmd 를 더블클릭하면 실행된다 (2026-10-26).
# 키는 Windows 사용자 환경 변수 THREADS_ACCESS_TOKEN 에 넣는다. 저장소(GitHub)·Drive 에는 올리지 않는다.
# 키 값은 화면에 찍지 않는다. 확인은 내 계정 이름 읽기만 하므로 아무것도 올라가지 않는다.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Mask($k) { return $k.Substring(0, 4) + '...' + $k.Substring($k.Length - 4) }
function Ok($s)   { Write-Host "  [OK] $s" -ForegroundColor Green }
function Bad($s)  { Write-Host "  [X]  $s" -ForegroundColor Red }
function Info($s) { Write-Host "       $s" }

Write-Host ''
Write-Host '  ==============================================='
Write-Host '    스레드 연결 키 넣기'
Write-Host '  ==============================================='
Write-Host ''
$old = [Environment]::GetEnvironmentVariable('THREADS_ACCESS_TOKEN', 'User')
if ($old -and $old.Length -gt 12) {
  Write-Host "  이 컴퓨터에는 이미 키가 있어요: $(Mask $old)"
  $ans = Read-Host '  새 키로 바꿀까요? (y = 바꾸기 / 그냥 Enter = 그대로 두기)'
  if ($ans -notmatch '^[yYㅛ]') { Write-Host ''; Ok '바꾸지 않았어요.'; exit 0 }
  Write-Host ''
}
Info '1) 메모장에 붙여 둔 키(THAA 로 시작하는 긴 글자)를 복사해서'
Info '   아래에 붙여 넣으세요. 마우스 오른쪽 클릭 또는 Ctrl+V'
Info '2) 붙여 넣어도 화면에는 * 로만 보여요. 정상이에요.'
Info '3) 붙여 넣은 뒤 Enter 를 누르세요.'
Write-Host ''
$secure = Read-Host '  키' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$key = ($key -replace '\s', '')
Write-Host ''
if (-not $key -or $key.Length -lt 40) { Bad '키가 비었거나 너무 짧아요. 창을 닫고 다시 더블클릭해 주세요.'; exit 1 }
Write-Host '       스레드에 접속해서 키가 맞는지 보는 중...'
try {
  $me = Invoke-RestMethod -Uri "https://graph.threads.net/v1.0/me?fields=id,username&access_token=$key" -TimeoutSec 20
} catch {
  Bad '스레드가 이 키를 받아 주지 않았어요. 저장하지 않았어요.'
  Info '개발자 화면 → 이용 사례 → 맞춤 설정 → 설정 탭 맨 아래 "사용자 토큰 생성기"에서 새로 만들어 다시 해 주세요.'
  exit 1
}
[Environment]::SetEnvironmentVariable('THREADS_ACCESS_TOKEN', $key, 'User')
Ok "키가 정상이에요. 연결된 계정: @$($me.username)"
Ok "이 컴퓨터에 저장했어요: $(Mask $key)"
Write-Host ''
Write-Host '  ==============================================='
Write-Host '    끝났어요. 이 창은 닫아도 됩니다.'
Write-Host '  ==============================================='
