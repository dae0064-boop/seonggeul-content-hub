# Google Drive 의 "내 드라이브" 위치를 찾는다. share-run.ps1 과 draft-day.ps1 이 같이 쓴다.
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
