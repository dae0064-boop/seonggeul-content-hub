# 클로드 사용량 창을 띄우고 화면 오른쪽 끝에 '항상 위'로 고정한다 (2026-11-02 사용자 "채팅창 옆에 고정").
# launchers/usage-window.cmd 가 부른다. 평소 크롬(없으면 엣지)으로 claude.ai 사용량 화면만 연다. 읽기만 한다.
# 고정은 그 창에만 걸린다. 창을 닫으면 끝. 다시 고정하려면 실행기를 다시 누른다.
param([int]$Width = 460, [int]$Height = 680)
$ErrorActionPreference = 'Stop'
$url = 'https://claude.ai/settings/usage'

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class UsageWin {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  public static List<long[]> List() {
    var r = new List<long[]>();
    EnumWindows((h, p) => {
      if (IsWindowVisible(h) && GetWindowTextLength(h) > 0) { uint pid; GetWindowThreadProcessId(h, out pid); r.Add(new long[] { h.ToInt64(), pid }); }
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@

function BrowserWindows {
  $ids = @{}
  Get-Process chrome, msedge -ErrorAction SilentlyContinue | ForEach-Object { $ids[[long]$_.Id] = 1 }
  @([UsageWin]::List() | Where-Object { $ids.ContainsKey($_[1]) } | ForEach-Object { $_[0] })
}

$before = BrowserWindows
$appArgs = @("--app=$url", "--window-size=$Width,$Height")
$started = $false
foreach ($b in 'chrome', 'msedge') {
  try { Start-Process $b -ArgumentList $appArgs; $started = $true; break } catch { }
}
if (-not $started) { Write-Host '크롬도 엣지도 찾지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요.'; exit 1 }

# 새로 생긴 창을 찾는다 (최대 15초)
$win = $null
for ($i = 0; $i -lt 30 -and -not $win; $i++) {
  Start-Sleep -Milliseconds 500
  $new = @(BrowserWindows | Where-Object { $before -notcontains $_ })
  if ($new.Count -ge 1) { $win = $new[0] }
}
if (-not $win) { Write-Host '사용량 창은 열었는데 고정하지 못했어요. 창은 그대로 써도 돼요. 이 창을 캡처해서 Claude 에게 보여주세요.'; exit 2 }

$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$h = [Math]::Min($Height, $area.Height)
$hwnd = [IntPtr]$win
[UsageWin]::ShowWindow($hwnd, 9) | Out-Null   # 최소화돼 있으면 되돌림
# -1 = 항상 위, 0x40 = 보이기
[UsageWin]::SetWindowPos($hwnd, [IntPtr](-1), $area.Right - $Width, $area.Top, $Width, $h, 0x40) | Out-Null
Write-Host '사용량 창을 화면 오른쪽에 고정했어요.'
