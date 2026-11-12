$ErrorActionPreference = "Stop"

$destination = ""
foreach ($argument in $args) {
  if (-not $destination -and $argument -like "--destination=*") {
    $destination = $argument.Substring("--destination=".Length)
  }
}

if ($destination) {
  $path = (Resolve-Path -LiteralPath $destination -ErrorAction Stop).Path
} else {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select export folder"
  $dialog.ShowNewFolderButton = $true
  $pictures = [Environment]::GetFolderPath("MyPictures")
  if (Test-Path -LiteralPath $pictures) {
    $dialog.SelectedPath = $pictures
  }
  try {
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      [Console]::Out.Write((@{ canceled = $true } | ConvertTo-Json -Compress))
      exit 0
    }
    $path = $dialog.SelectedPath
  } finally {
    $dialog.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $path -PathType Container)) {
  throw "Export folder does not exist: $path"
}
[Console]::Out.Write((@{
  canceled = $false
  path = $path
} | ConvertTo-Json -Compress))
