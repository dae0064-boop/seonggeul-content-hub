' Run the morning launcher (auto-day.cmd) with a visible window only once a day (2026-11-27 user request:
'   show it once when the PC is turned on in the morning, every other run stays hidden).
'   First run of the day: visible window. Later runs the same day (10:10 retry etc.): no window.
'   Marker file: dumps\morning-window-<date>.txt  (ASCII-only file: wscript reads .vbs as ANSI)
' Usage: wscript.exe morning-once.vbs <.cmd path>
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
repo = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
dumps = repo & "\dumps"
If Not fso.FolderExists(dumps) Then fso.CreateFolder dumps
d = Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2)
stamp = dumps & "\morning-window-" & d & ".txt"
style = 0
If Not fso.FileExists(stamp) Then
  style = 1
  Set f = fso.CreateTextFile(stamp, True)
  f.WriteLine Now
  f.Close
End If
WScript.Quit sh.Run("cmd.exe /c """ & WScript.Arguments(0) & """", style, True)
