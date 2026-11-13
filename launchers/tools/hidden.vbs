' Run a PowerShell script with no window (2026-11-13: request watcher every 2 min, no black flash).
' Usage: wscript.exe hidden.vbs <ps1 path>
Set sh = CreateObject("WScript.Shell")
WScript.Quit sh.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & WScript.Arguments(0) & """", 0, True)
