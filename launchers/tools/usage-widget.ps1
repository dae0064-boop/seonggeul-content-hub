# 클로드 사용량 위젯 — 화면 오른쪽 위에 항상 떠 있는 검은 카드 (2026-11-02 사용자 "채팅창 옆에 이런 식으로").
# launchers/usage-widget.cmd 가 띄운다. 5분마다 scripts/claude-usage.mjs 를 숨겨 돌려 dumps/claude-usage.json 을 읽는다. 읽기만 한다.
# 왼쪽 누른 채 끌기 = 옮기기, 오른쪽 클릭 = 새로 고침·닫기.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$json = Join-Path $root 'dumps\claude-usage.json'
$script = Join-Path $root 'scripts\claude-usage.mjs'
$inv = [Globalization.CultureInfo]::InvariantCulture

# 하나만 띄운다
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\SeonggeulUsageWidget', [ref]$created)
if (-not $created) { exit 0 }

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="클로드 사용량" Width="330" SizeToContent="Height" WindowStyle="None" AllowsTransparency="True"
        Background="Transparent" Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize">
  <Border CornerRadius="20" Background="#F2111111" Padding="20,16,20,14">
    <StackPanel>
      <TextBlock Text="Claude" Foreground="White" FontSize="17" FontWeight="Bold" Margin="0,0,0,10"/>
      <StackPanel x:Name="Rows"/>
      <TextBlock x:Name="Foot" Foreground="#777" FontSize="11" Margin="0,8,0,0" TextWrapping="Wrap"/>
    </StackPanel>
  </Border>
</Window>
"@
$win = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
$rows = $win.FindName('Rows')
$foot = $win.FindName('Foot')

$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$win.Left = $area.Right - 330 - 12
$win.Top = $area.Top + 12

function Brush($hex) { [Windows.Media.BrushConverter]::new().ConvertFromString($hex) }
function ColorFor($p) { if ($p -ge 90) { '#FF5A5A' } elseif ($p -ge 70) { '#F5C542' } else { '#3DDC84' } }

# 위에서 시계 방향으로 p% 만큼 그린 둥근 막대
function Ring($p, $color) {
  $size = 58; $th = 6; $r = ($size - $th) / 2; $c = $size / 2
  $g = New-Object Windows.Controls.Grid
  $g.Width = $size; $g.Height = $size
  $bg = New-Object Windows.Shapes.Ellipse
  $bg.Width = $size - $th; $bg.Height = $size - $th; $bg.Stroke = Brush '#333333'; $bg.StrokeThickness = $th
  [void]$g.Children.Add($bg)
  if ($p -gt 0) {
    $path = New-Object Windows.Shapes.Path
    $path.Stroke = Brush $color; $path.StrokeThickness = $th
    $path.StrokeStartLineCap = 'Round'; $path.StrokeEndLineCap = 'Round'
    if ($p -ge 99.5) {
      $path.Data = New-Object Windows.Media.EllipseGeometry((New-Object Windows.Point($c, $c)), $r, $r)
    } else {
      $a = [Math]::PI * 2 * $p / 100
      $ex = $c + $r * [Math]::Sin($a); $ey = $c - $r * [Math]::Cos($a)
      $large = if ($p -gt 50) { 1 } else { 0 }
      $d = [string]::Format($inv, 'M {0},{1} A {2},{2} 0 {3} 1 {4},{5}', $c, ($c - $r), $r, $large, $ex, $ey)
      $path.Data = [Windows.Media.Geometry]::Parse($d)
    }
    [void]$g.Children.Add($path)
  }
  $t = New-Object Windows.Controls.TextBlock
  $t.Text = "$p%"; $t.Foreground = Brush 'White'; $t.FontSize = 13; $t.FontWeight = 'Bold'
  $t.HorizontalAlignment = 'Center'; $t.VerticalAlignment = 'Center'
  [void]$g.Children.Add($t)
  $g
}

# PowerShell 5 는 날짜를 글자로, 7 은 DateTime 으로 준다 — 둘 다 받는다
function ToLocal($v) {
  if ($v -is [DateTime]) { return ([DateTimeOffset]$v).ToLocalTime() }
  [DateTimeOffset]::Parse([string]$v, $inv).ToLocalTime()
}

function ResetText($iso) {
  if (-not $iso) { return '' }
  try { $t = ToLocal $iso } catch { return '' }
  $left = $t - [DateTimeOffset]::Now
  $day = '일월화수목금토'[[int]$t.DayOfWeek]
  $when = '{0}/{1}({2}) {3:HH\:mm} 초기화' -f $t.Month, $t.Day, $day, $t
  if ($left.TotalMinutes -le 0) { return $when }
  if ($left.TotalDays -ge 1) { $rest = '{0}일 {1}시간 후' -f [int][Math]::Floor($left.TotalDays), $left.Hours }
  elseif ($left.TotalHours -ge 1) { $rest = '{0}시간 {1}분 후' -f [int][Math]::Floor($left.TotalHours), $left.Minutes }
  else { $rest = '{0}분 후' -f [int][Math]::Ceiling($left.TotalMinutes) }
  "$when · $rest"
}

function Row($l) {
  $p = [int]$l.pct; $col = ColorFor $p
  $g = New-Object Windows.Controls.Grid
  $g.Margin = '0,0,0,12'
  $c1 = New-Object Windows.Controls.ColumnDefinition; $c1.Width = 'Auto'
  $c2 = New-Object Windows.Controls.ColumnDefinition
  [void]$g.ColumnDefinitions.Add($c1); [void]$g.ColumnDefinitions.Add($c2)
  $ring = Ring $p $col
  [Windows.Controls.Grid]::SetColumn($ring, 0); [void]$g.Children.Add($ring)
  $sp = New-Object Windows.Controls.StackPanel
  $sp.Margin = '14,0,0,0'; $sp.VerticalAlignment = 'Center'
  $t1 = New-Object Windows.Controls.TextBlock; $t1.Text = $l.label; $t1.Foreground = Brush '#DDDDDD'; $t1.FontSize = 13; $t1.FontWeight = 'SemiBold'
  $bar = New-Object Windows.Controls.Grid; $bar.Height = 6; $bar.Margin = '0,6,0,6'
  $b0 = New-Object Windows.Controls.Border; $b0.CornerRadius = 3; $b0.Background = Brush '#333333'
  $b1 = New-Object Windows.Controls.Border; $b1.CornerRadius = 3; $b1.Background = Brush $col; $b1.HorizontalAlignment = 'Left'
  $b1.Width = [Math]::Max(0, 200 * $p / 100)
  [void]$bar.Children.Add($b0); [void]$bar.Children.Add($b1)
  $t2 = New-Object Windows.Controls.TextBlock; $t2.Text = ('{0}% 사용 · {1}% 남음' -f $p, (100 - $p)); $t2.Foreground = Brush 'White'; $t2.FontSize = 12
  $t3 = New-Object Windows.Controls.TextBlock; $t3.Text = (ResetText $l.resets_at); $t3.Foreground = Brush '#888888'; $t3.FontSize = 11
  foreach ($x in $t1, $bar, $t2, $t3) { [void]$sp.Children.Add($x) }
  [Windows.Controls.Grid]::SetColumn($sp, 1); [void]$g.Children.Add($sp)
  $g
}

$script:lastWrite = [DateTime]::MinValue
$script:proc = $null
function Draw {
  $rows.Children.Clear()
  if (-not (Test-Path $json)) { $foot.Text = '사용량 읽는 중...'; return }
  try { $d = Get-Content $json -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $foot.Text = '사용량 파일을 읽지 못했어요'; return }
  if ($d.ok) {
    foreach ($l in $d.limits) { [void]$rows.Children.Add((Row $l)) }
    $at = ToLocal $d.at
    $foot.Text = ('{0:HH\:mm} 업데이트 · 5분마다 · 오른쪽 클릭 = 새로 고침/닫기' -f $at)
    $foot.Foreground = Brush '#777777'
  } else {
    $foot.Text = "⚠ $($d.message)"
    $foot.Foreground = Brush '#F5C542'
  }
}

function Fetch {
  if ($script:proc -and -not $script:proc.HasExited) { return }
  try {
    $script:proc = Start-Process node -ArgumentList "`"$script`"" -WorkingDirectory $root -WindowStyle Hidden -PassThru
  } catch { $foot.Text = '⚠ node 를 찾지 못했어요 — Claude 에게 알려 주세요' }
}

# 파일이 바뀌면 다시 그리고, 1분마다 남은 시간 글자를 고친다
$watch = New-Object Windows.Threading.DispatcherTimer
$watch.Interval = [TimeSpan]::FromSeconds(5)
$script:tick = 0
$watch.Add_Tick({
  $script:tick++
  $w = if (Test-Path $json) { (Get-Item $json).LastWriteTime } else { [DateTime]::MinValue }
  if ($w -ne $script:lastWrite -or $script:tick % 12 -eq 0) { $script:lastWrite = $w; Draw }
  if ($script:tick % 60 -eq 0) { Fetch }   # 5초 × 60 = 5분
})

$menu = New-Object Windows.Controls.ContextMenu
$mi1 = New-Object Windows.Controls.MenuItem; $mi1.Header = '지금 새로 고침'; $mi1.Add_Click({ Fetch })
$mi2 = New-Object Windows.Controls.MenuItem; $mi2.Header = '닫기'; $mi2.Add_Click({ $win.Close() })
[void]$menu.Items.Add($mi1); [void]$menu.Items.Add($mi2)
$win.ContextMenu = $menu
$win.Add_MouseLeftButtonDown({ try { $win.DragMove() } catch { } })
$win.Add_Closed({ $watch.Stop(); $mutex.ReleaseMutex() })

Draw
Fetch
$watch.Start()
[void]$win.ShowDialog()
