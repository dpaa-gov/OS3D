' OS3D - Silent Launcher (no console window)
' Double-click this file to start OS3D without a console window

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script lives
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Run os3d.bat silently (0 = hidden window, False = don't wait)
WshShell.Run """" & scriptDir & "\os3d.bat""", 0, False
