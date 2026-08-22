Option Explicit
Dim fso, sh, root, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetFile(WScript.ScriptFullName).ParentFolder.ParentFolder.Path
sh.CurrentDirectory = root
cmd = "cmd.exe /c """ & root & "\scripts\launch-dev.cmd"""
' 最小化表示。失敗してもコンソールを完全に隠さない
sh.Run cmd, 7, False
