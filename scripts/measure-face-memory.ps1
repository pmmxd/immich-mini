param(
  [string]$FaceLibraryPath = "",
  [int]$Port = 3312,
  [int]$IdleSeconds = 15
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $FaceLibraryPath) {
  $FaceLibraryPath = Join-Path $ProjectRoot "work\face-samples"
}
$ResolvedLibrary = (Resolve-Path -LiteralPath $FaceLibraryPath).Path
$RunId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$DataDir = Join-Path $ProjectRoot "work\face-memory-$RunId\data"
$Stdout = Join-Path $ProjectRoot "work\face-memory-$RunId.stdout.log"
$Stderr = Join-Path $ProjectRoot "work\face-memory-$RunId.stderr.log"
New-Item -ItemType Directory -Path (Split-Path $Stdout) -Force | Out-Null

$PreviousPort = $env:PORT
$PreviousDataDir = $env:IMMICH_MINI_DATA_DIR
$PreviousFaceScan = $env:IMMICH_MINI_FACE_SCAN
$PreviousFaceIdle = $env:IMMICH_MINI_FACE_IDLE_SECONDS
$env:PORT = "$Port"
$env:IMMICH_MINI_DATA_DIR = $DataDir
$env:IMMICH_MINI_FACE_SCAN = "1"
$env:IMMICH_MINI_FACE_IDLE_SECONDS = "$IdleSeconds"
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
  for ($Attempt = 0; $Attempt -lt 80; $Attempt++) {
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

  $PeakPythonMb = 0
  $PeakNodeMb = 0
  $FaceWorkerPid = $null
  $Detected = $false
  for ($Attempt = 0; $Attempt -lt 180; $Attempt++) {
    Start-Sleep -Milliseconds 500
    $Process.Refresh()
    $PeakNodeMb = [math]::Max($PeakNodeMb, $Process.WorkingSet64 / 1MB)
    $Children = Get-CimInstance Win32_Process | Where-Object {
      $_.ParentProcessId -eq $Process.Id -and $_.Name -eq "python.exe"
    }
    foreach ($Child in $Children) {
      $FaceWorkerPid = $Child.ProcessId
      $PythonProcess = Get-Process -Id $Child.ProcessId -ErrorAction SilentlyContinue
      if ($PythonProcess) {
        $PeakPythonMb = [math]::Max($PeakPythonMb, $PythonProcess.WorkingSet64 / 1MB)
      }
    }
    $People = Invoke-RestMethod "$BaseUrl/api/people?withHidden=true&size=1000"
    if ($People.total -gt 0) {
      $Detected = $true
    }
    if ($Detected -and -not $Children) {
      break
    }
  }

  Start-Sleep -Seconds 2
  $Process.Refresh()
  [pscustomobject]@{
    faces_detected = $Detected
    people = (Invoke-RestMethod "$BaseUrl/api/people?withHidden=true&size=1000").total
    face_worker_pid = $FaceWorkerPid
    peak_node_working_set_mb = [math]::Round($PeakNodeMb, 1)
    peak_python_working_set_mb = [math]::Round($PeakPythonMb, 1)
    combined_peak_mb = [math]::Round($PeakNodeMb + $PeakPythonMb, 1)
    node_idle_after_worker_mb = [math]::Round($Process.WorkingSet64 / 1MB, 1)
    face_worker_running_after_idle = [bool](
      Get-CimInstance Win32_Process | Where-Object {
        $_.ParentProcessId -eq $Process.Id -and $_.Name -eq "python.exe"
      }
    )
    idle_seconds = $IdleSeconds
    data_dir = $DataDir
  } | Format-List
} finally {
  if (-not $Process.HasExited) {
    Stop-Process -Id $Process.Id
    $Process.WaitForExit(5000) | Out-Null
  }
  if ($FaceWorkerPid) {
    Stop-Process -Id $FaceWorkerPid -ErrorAction SilentlyContinue
  }
  $env:PORT = $PreviousPort
  $env:IMMICH_MINI_DATA_DIR = $PreviousDataDir
  $env:IMMICH_MINI_FACE_SCAN = $PreviousFaceScan
  $env:IMMICH_MINI_FACE_IDLE_SECONDS = $PreviousFaceIdle
}
