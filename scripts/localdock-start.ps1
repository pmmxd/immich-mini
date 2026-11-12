$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Node = Join-Path $ProjectRoot "runtime\node.exe"
if (-not (Test-Path -LiteralPath $Node)) {
  $Node = "node"
}
$BaseUrl = "http://127.0.0.1:3310"
$Marker = "--immich-mini-production"
$LogDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LockPath = Join-Path $LogDir "localdock-start.lock"

$StartLock = $null
for ($Attempt = 0; $Attempt -lt 120; $Attempt++) {
  try {
    $StartLock = [IO.File]::Open(
      $LockPath,
      [IO.FileMode]::OpenOrCreate,
      [IO.FileAccess]::ReadWrite,
      [IO.FileShare]::None
    )
    break
  } catch {
    Start-Sleep -Milliseconds 250
  }
}
if (-not $StartLock) {
  throw "Another Immich Mini start operation is already in progress."
}

try {
  try {
    $health = Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 1
    if ($health.ok -and $health.service -eq "immich-mini") {
      [pscustomobject]@{ status = "already-running"; url = $BaseUrl } | ConvertTo-Json
      exit 0
    }
  } catch {
  }

  $listener = Get-NetTCPConnection -LocalPort 3310 -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "Port 3310 is already used by another process."
  }

  $RunId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $Stdout = Join-Path $LogDir "server-$RunId.stdout.log"
  $Stderr = Join-Path $LogDir "server-$RunId.stderr.log"
  $Process = Start-Process `
    -FilePath $Node `
    -ArgumentList @("--enable-source-maps", "dist\server\index.js", $Marker) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $Stdout `
    -RedirectStandardError $Stderr `
    -PassThru

  for ($Attempt = 0; $Attempt -lt 120; $Attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $health = Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 1
      $listener = Get-NetTCPConnection -LocalPort 3310 -State Listen -ErrorAction SilentlyContinue
      if (
        $health.ok -and
        $health.service -eq "immich-mini" -and
        $listener.OwningProcess -contains $Process.Id
      ) {
        [pscustomobject]@{
          status = "started"
          pid = $Process.Id
          url = $BaseUrl
          stdout = $Stdout
          stderr = $Stderr
        } | ConvertTo-Json
        exit 0
      }
      if ($health.ok -and $health.service -eq "immich-mini" -and $listener) {
        $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        $isProjectNode = $listenerProcess.ExecutablePath -and [string]::Equals(
          [IO.Path]::GetFullPath($listenerProcess.ExecutablePath),
          [IO.Path]::GetFullPath($Node),
          [StringComparison]::OrdinalIgnoreCase
        )
        if (
          $listenerProcess.Name -eq "node.exe" -and
          $isProjectNode -and
          $listenerProcess.CommandLine.Replace("\", "/") -like "*dist/server/index.js*$Marker*"
        ) {
          [pscustomobject]@{
            status = "already-running"
            pid = $listener.OwningProcess
            url = $BaseUrl
          } | ConvertTo-Json
          exit 0
        }
      }
    } catch {
      $Process.Refresh()
      if ($Process.HasExited) {
        throw "Immich Mini exited before becoming ready. See $Stderr"
      }
    }
  }

  throw "Immich Mini did not become ready within 30 seconds."
} finally {
  $StartLock.Dispose()
}
