param(
  [string]$LibraryPath = ""
)

$ErrorActionPreference = "Stop"
$BaseUrl = "http://127.0.0.1:3310"

try {
  $health = Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 2
  if (-not $health.ok) {
    throw "Immich Mini is not ready."
  }
} catch {
  throw "Immich Mini is not running. Start the site in LocalDock first."
}

if (-not $LibraryPath) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select a media library folder"
  $dialog.UseDescriptionForTitle = $true
  $dialog.ShowNewFolderButton = $false
  try {
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      [pscustomobject]@{ status = "cancelled" } | ConvertTo-Json
      exit 0
    }
    $LibraryPath = $dialog.SelectedPath
  } finally {
    $dialog.Dispose()
  }
}

$ResolvedLibrary = (Resolve-Path -LiteralPath $LibraryPath -ErrorAction Stop).Path
if (-not (Get-Item -LiteralPath $ResolvedLibrary).PSIsContainer) {
  throw "The selected media library is not a folder."
}

$Job = Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/scan" `
  -ContentType "application/json" `
  -Body (@{ path = $ResolvedLibrary } | ConvertTo-Json) `
  -TimeoutSec 10

for ($Attempt = 0; $Attempt -lt 1800; $Attempt++) {
  Start-Sleep -Milliseconds 500
  $Job = Invoke-RestMethod "$BaseUrl/api/jobs/$($Job.id)" -TimeoutSec 5
  if ($Job.status -eq "succeeded") {
    [pscustomobject]@{
      status = "added"
      path = $ResolvedLibrary
      job_id = $Job.id
    } | ConvertTo-Json
    exit 0
  }
  if ($Job.status -in @("failed", "cancelled", "timeout")) {
    throw "Media scan $($Job.status): $($Job.error)"
  }
}

throw "Media scan did not finish within 15 minutes."
