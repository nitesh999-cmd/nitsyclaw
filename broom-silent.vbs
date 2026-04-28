' NitsyClaw broom silent launcher.
' Wraps broom.ps1 invocation in WshShell.Run with WindowStyle=0 (vbHide),
' which is truly invisible regardless of scheduled-task Logon Mode.
' Eliminates the every-2-minute black flash on the user's main monitor.
' No Windows password required (unlike "Run whether logged on or not").

Set sh = CreateObject("WScript.Shell")
' arg1: command, arg2: 0=hidden window, arg3: false=don't wait
sh.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -File ""C:\Users\Nitesh\projects\NitsyClaw\broom.ps1""", 0, False
