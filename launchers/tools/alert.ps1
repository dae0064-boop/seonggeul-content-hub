# 예약 실패 알림 창 (2026-10-19 사용자: "티스토리가 안 됐으면 말을 했었어야지").
# 아침 확인 보고는 따로 열어야 보이는 클라우드 대화라 놓치기 쉽다. 그래서 PC 화면에 바로 창을 띄운다.
# 창은 따로 뜨는 작은 프로그램이라 자동 실행을 멈추지 않는다. 확인을 누르면 닫힌다.
param([Parameter(Mandatory = $true)][string]$Title, [Parameter(Mandatory = $true)][string]$Message)
$t = $Title -replace "'", "''"
$m = $Message -replace "'", "''"
# 한글·줄바꿈이 명령줄에서 깨지지 않게 -EncodedCommand 로 넘긴다
$cmd = "(New-Object -ComObject WScript.Shell).Popup('$m', 0, '$t', 48) | Out-Null"
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
Start-Process powershell -WindowStyle Hidden -ArgumentList @('-NoProfile', '-EncodedCommand', $enc)
