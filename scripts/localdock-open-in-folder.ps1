$ErrorActionPreference = "Stop"

if ($args.Count -eq 0) {
  throw "Select at least one file."
}

$files = @()
foreach ($path in $args) {
  $resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "Not a file: $resolved"
  }
  if ($files -notcontains $resolved) {
    $files += $resolved
  }
}

if ($files.Count -eq 1) {
  Start-Process -FilePath explorer.exe -ArgumentList "/select,`"$($files[0])`""
  [Console]::Out.Write("SELECTED:$($files[0])")
  exit 0
}

$directories = @(
  $files |
    ForEach-Object { [IO.Path]::GetDirectoryName($_) } |
    Sort-Object -Unique
)
if ($directories.Count -gt 20) {
  throw "Select media from at most 20 folders."
}
foreach ($directory in $directories) {
  Start-Process -FilePath explorer.exe -ArgumentList "`"$directory`""
}
[Console]::Out.Write("OPENED:$($directories.Count)")
