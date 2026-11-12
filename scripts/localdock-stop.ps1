$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectNode = Join-Path $ProjectRoot "runtime\node.exe"
$Marker = "--immich-mini-production"
$listener = Get-NetTCPConnection -LocalPort 3310 -State Listen -ErrorAction SilentlyContinue
$projectProcesses = @(
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "node.exe" -and
    $_.ExecutablePath -and
    [string]::Equals(
      [IO.Path]::GetFullPath($_.ExecutablePath),
      [IO.Path]::GetFullPath($ProjectNode),
      [StringComparison]::OrdinalIgnoreCase
    ) -and
    $_.CommandLine.Replace("\", "/") -like "*dist/server/index.js*$Marker*"
  }
)
if (-not $listener -and $projectProcesses.Count -eq 0) {
  [pscustomobject]@{ status = "already-stopped" } | ConvertTo-Json
  exit 0
}

if ($listener) {
  $listenerProcess = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -eq $listener.OwningProcess
  }
  $isProjectNode = $listenerProcess.ExecutablePath -and (
    [string]::Equals(
      [IO.Path]::GetFullPath($listenerProcess.ExecutablePath),
      [IO.Path]::GetFullPath($ProjectNode),
      [StringComparison]::OrdinalIgnoreCase
    )
  )
  if (
    -not $listenerProcess -or
    $listenerProcess.Name -ne "node.exe" -or
    -not $isProjectNode -or
    $listenerProcess.CommandLine.Replace("\", "/") -notlike "*dist/server/index.js*$Marker*"
  ) {
    throw "Port 3310 is not owned by this Immich Mini project."
  }
  $projectProcesses = @($projectProcesses + $listenerProcess | Sort-Object ProcessId -Unique)
}

$descendants = @()
foreach ($process in $projectProcesses) {
  $queue = @($process.ProcessId)
  while ($queue.Count -gt 0) {
    $parent = $queue[0]
    $queue = @($queue | Select-Object -Skip 1)
    $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $parent })
    foreach ($child in $children) {
      $descendants += $child.ProcessId
      $queue += $child.ProcessId
    }
  }
}

[array]::Reverse($descendants)
foreach ($id in $descendants) {
  Stop-Process -Id $id -ErrorAction SilentlyContinue
}
foreach ($process in $projectProcesses) {
  Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
}
[pscustomobject]@{
  status = "stopped"
  pids = @($projectProcesses.ProcessId)
} | ConvertTo-Json
