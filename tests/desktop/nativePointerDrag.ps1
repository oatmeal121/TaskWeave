param([int]$SourceX,[int]$SourceY,[int]$TargetX,[int]$TargetY)
$ErrorActionPreference = 'Stop'
$qaPid = [int](Get-Content 'src-tauri/target/native-reminder-qa.pid')
$qaProcess = Get-Process -Id $qaPid
if ($qaProcess.Path -ne (Join-Path (Resolve-Path '.').Path 'src-tauri\target\debug\taskweave.exe')) { throw 'Unexpected QA process' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QADrag {
  [StructLayout(LayoutKind.Sequential)] public struct Point {public int X;public int Y;}
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr handle,ref Point point);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle,int command);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
[void][QADrag]::SetThreadDpiAwarenessContext([IntPtr](-4))
$handle = $qaProcess.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw 'QA window not found' }
[void][QADrag]::ShowWindow($handle,9)
[void][QADrag]::SetForegroundWindow($handle)
$origin = New-Object QADrag+Point
[void][QADrag]::ClientToScreen($handle,[ref]$origin)
$previous = New-Object QADrag+Point
[void][QADrag]::GetCursorPos([ref]$previous)
try {
  [void][QADrag]::SetCursorPos(($origin.X+$SourceX),($origin.Y+$SourceY))
  Start-Sleep -Milliseconds 150
  [QADrag]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  for ($i=1;$i -le 24;$i++) {
    [void][QADrag]::SetCursorPos(($origin.X+$SourceX+($TargetX-$SourceX)*$i/24),($origin.Y+$SourceY+($TargetY-$SourceY)*$i/24))
    Start-Sleep -Milliseconds 35
  }
  Start-Sleep -Milliseconds 150
  [QADrag]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
} finally {
  [QADrag]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  [void][QADrag]::SetCursorPos($previous.X,$previous.Y)
}
