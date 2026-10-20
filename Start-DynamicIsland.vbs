' Launches Dynamic Island silently in the background (no PowerShell / CMD window)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
exe = """" & dir & "\node_modules\electron\dist\electron.exe"" """ & dir & """"
sh.Run exe, 0, False
