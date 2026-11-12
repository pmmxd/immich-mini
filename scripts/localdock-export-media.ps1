$ErrorActionPreference = "Stop"

$Destination = ""
$Paths = @()
foreach ($argument in $args) {
  if (-not $Destination -and $argument -like "--destination=*") {
    $Destination = $argument.Substring("--destination=".Length)
    continue
  }
  $Paths += $argument
}

if ($Paths.Count -eq 0 -or $Paths.Count -gt 200) {
  throw "Select 1 to 200 files."
}

$sources = @()
foreach ($path in $Paths) {
  $resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "Not a file: $resolved"
  }
  if ($sources -notcontains $resolved) {
    $sources += $resolved
  }
}

$dialog = $null
if ($Destination) {
  $destination = (Resolve-Path -LiteralPath $Destination -ErrorAction Stop).Path
} else {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select export folder"
  $dialog.SelectedPath = Split-Path -Parent $sources[0]
  $dialog.ShowNewFolderButton = $true
}

try {
  if (-not $Destination -and $dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write((@{
      paths = @()
      failures = @()
      canceled = $true
    } | ConvertTo-Json -Compress))
    exit 0
  }

  if (-not $Destination) {
    $destination = $dialog.SelectedPath
  }
  $exported = @()
  $failures = @()
  foreach ($source in $sources) {
    $name = [IO.Path]::GetFileNameWithoutExtension($source)
    $extension = [IO.Path]::GetExtension($source)
    for ($index = 0; ; $index++) {
      $suffix = if ($index -eq 0) { "" } else { " ($index)" }
      $target = Join-Path $destination ($name + $suffix + $extension)
      try {
        [IO.File]::Copy($source, $target, $false)
        try {
          [IO.File]::SetLastWriteTimeUtc($target, [IO.File]::GetLastWriteTimeUtc($source))
        } catch {
        }
        $exported += $target
        break
      } catch [IO.IOException] {
        if (Test-Path -LiteralPath $target) {
          continue
        }
        $failures += "$source`: $($_.Exception.Message)"
        break
      } catch {
        $failures += "$source`: $($_.Exception.Message)"
        break
      }
    }
  }

  [Console]::Out.Write((@{
    paths = $exported
    failures = $failures
    canceled = $false
  } | ConvertTo-Json -Compress))
} finally {
  if ($dialog) {
    $dialog.Dispose()
  }
}
