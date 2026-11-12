$ErrorActionPreference = "Stop"

if ($args.Count -lt 2) {
  throw "Editor path and at least one media file are required."
}

$editor = (Resolve-Path -LiteralPath $args[0] -ErrorAction Stop).Path
if ([IO.Path]::GetExtension($editor).ToLowerInvariant() -ne ".exe") {
  throw "Editor must be an EXE."
}

$files = @()
foreach ($path in ($args | Select-Object -Skip 1)) {
  $resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "Not a file: $resolved"
  }
  $files += $resolved
}

$arguments = ($files | ForEach-Object { '"' + $_ + '"' }) -join " "
$process = Start-Process -FilePath $editor -ArgumentList $arguments -PassThru
Start-Sleep -Milliseconds 750
if ($process.HasExited -and $process.ExitCode -ne 0) {
  throw "Editor exited with code $($process.ExitCode)."
}

[Console]::Out.Write("STARTED:$($process.Id)")
