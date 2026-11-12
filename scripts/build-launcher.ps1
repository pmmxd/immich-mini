$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$Source = Join-Path $ProjectRoot "launcher\ImmichMiniLauncher.cs"
$Output = Join-Path $ProjectRoot "ImmichMini.exe"

if (-not (Test-Path -LiteralPath $Compiler)) {
  throw "C# compiler not found: $Compiler"
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist\server\index.js"))) {
  throw "Build the server before building the launcher."
}

& $Compiler `
  /nologo `
  /target:winexe `
  /optimize+ `
  /platform:anycpu `
  /reference:System.Windows.Forms.dll `
  /reference:System.Drawing.dll `
  /out:$Output `
  $Source

if ($LASTEXITCODE -ne 0) {
  throw "Launcher compilation failed with exit code $LASTEXITCODE"
}

$bytes = [System.IO.File]::ReadAllBytes($Output)
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "")
[pscustomobject]@{ Path = $Output; Hash = $hash }
