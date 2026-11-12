param(
  [string]$LibraryPath = "",
  [int]$Port = 3311,
  [int]$IdleSeconds = 12
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RunId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$DataDir = Join-Path $ProjectRoot "work\memory-$RunId\data"
$Stdout = Join-Path $ProjectRoot "work\server-$RunId.stdout.log"
$Stderr = Join-Path $ProjectRoot "work\server-$RunId.stderr.log"
New-Item -ItemType Directory -Path (Split-Path $Stdout) -Force | Out-Null

$PreviousPort = $env:PORT
$PreviousDataDir = $env:IMMICH_MINI_DATA_DIR
$PreviousFaceScan = $env:IMMICH_MINI_FACE_SCAN
$env:PORT = "$Port"
$env:IMMICH_MINI_DATA_DIR = $DataDir
$env:IMMICH_MINI_FACE_SCAN = "0"
$Node = Join-Path $ProjectRoot "runtime\node.exe"
if (-not (Test-Path -LiteralPath $Node)) {
  $Node = "node"
}
$Process = Start-Process `
  -FilePath $Node `
  -ArgumentList @("--enable-source-maps", "dist/server/index.js") `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $Stdout `
  -RedirectStandardError $Stderr `
  -PassThru

try {
  $BaseUrl = "http://127.0.0.1:$Port"
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      Invoke-RestMethod "$BaseUrl/api/health" | Out-Null
      $Ready = $true
      break
    } catch {
      if ($Process.HasExited) {
        throw "Server exited before becoming ready. See $Stderr"
      }
    }
  }
  if (-not $Ready) {
    throw "Server did not become ready"
  }

  if ($LibraryPath) {
    $ResolvedLibrary = (Resolve-Path -LiteralPath $LibraryPath).Path
    $Job = Invoke-RestMethod `
      -Method Post `
      -Uri "$BaseUrl/api/scan" `
      -ContentType "application/json" `
      -Body (@{ path = $ResolvedLibrary } | ConvertTo-Json)
    do {
      Start-Sleep -Milliseconds 400
      $Job = Invoke-RestMethod "$BaseUrl/api/jobs/$($Job.id)"
    } while ($Job.status -in @("queued", "running"))
    if ($Job.status -ne "succeeded") {
      throw "Scan failed: $($Job.error)"
    }
  }

  Start-Sleep -Seconds $IdleSeconds
  $Process.Refresh()
  $Status = Invoke-RestMethod "$BaseUrl/api/status"
  [pscustomobject]@{
    process_id = $Process.Id
    assets = $Status.assets.total
    working_set_mb = [math]::Round($Process.WorkingSet64 / 1MB, 1)
    private_memory_mb = [math]::Round($Process.PrivateMemorySize64 / 1MB, 1)
    page_file_mb = [math]::Round($Process.PagedMemorySize64 / 1MB, 1)
    cpu_seconds = [math]::Round($Process.TotalProcessorTime.TotalSeconds, 2)
    idle_seconds = $IdleSeconds
    data_dir = $DataDir
  } | Format-List
} finally {
  if (-not $Process.HasExited) {
    Stop-Process -Id $Process.Id
    $Process.WaitForExit(5000) | Out-Null
  }
  $env:PORT = $PreviousPort
  $env:IMMICH_MINI_DATA_DIR = $PreviousDataDir
  $env:IMMICH_MINI_FACE_SCAN = $PreviousFaceScan
}
