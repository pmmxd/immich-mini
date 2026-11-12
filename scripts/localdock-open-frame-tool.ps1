$ErrorActionPreference = "Stop"

if ($args.Count -lt 2) {
  throw "Frame editor path and at least one image are required."
}

$editor = (Resolve-Path -LiteralPath $args[0] -ErrorAction Stop).Path
if ([IO.Path]::GetExtension($editor).ToLowerInvariant() -ne ".exe") {
  throw "Frame editor must be an EXE."
}

$files = @()
foreach ($path in ($args | Select-Object -Skip 1)) {
  $resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "Not a file: $resolved"
  }
  $files += $resolved
}

if ([IO.Path]::GetFileName($editor) -ine "copicseal.exe") {
  $arguments = ($files | ForEach-Object { '"' + $_ + '"' }) -join " "
  $process = Start-Process -FilePath $editor -ArgumentList $arguments -PassThru
  [Console]::Out.Write("STARTED:$($process.Id)")
  exit 0
}

$process = Get-Process -Name "copicseal" -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class LocalDockWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr handle, int command);
}
"@

$dropList = New-Object System.Collections.Specialized.StringCollection
foreach ($file in $files) {
  [void]$dropList.Add($file)
}
[System.Windows.Forms.Clipboard]::SetFileDropList($dropList)

if (-not $process) {
  $process = Start-Process -FilePath $editor -PassThru
}

$windowReady = $false
for ($attempt = 0; $attempt -lt 100; $attempt++) {
  Start-Sleep -Milliseconds 100
  $process.Refresh()
  if ($process.HasExited) {
    throw "copicseal exited before it was ready."
  }
  if ($process.MainWindowHandle -ne 0) {
    $windowReady = $true
    break
  }
}
if (-not $windowReady) {
  throw "copicseal did not open a usable window."
}

$process.Refresh()
if ([LocalDockWindow]::GetForegroundWindow() -ne $process.MainWindowHandle) {
  try {
    [void][Microsoft.VisualBasic.Interaction]::AppActivate($process.Id)
  } catch {
  }
  [void][LocalDockWindow]::ShowWindow($process.MainWindowHandle, 9)
  [void][LocalDockWindow]::SetForegroundWindow($process.MainWindowHandle)
  Start-Sleep -Milliseconds 500
}
$process.Refresh()
if ([LocalDockWindow]::GetForegroundWindow() -ne $process.MainWindowHandle) {
  throw "copicseal could not be brought to the foreground."
}

Start-Sleep -Milliseconds 2500
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 500
[Console]::Out.Write("STARTED:$($process.Id);PASTED:$($files.Count)")
