[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("cytoscape", "g6", "sigma", "reagraph", "cosmos", "relation-graph", "react-flow", "elk-layout")]
    [string]$Candidate
)

$ErrorActionPreference = "Stop"
$env:NODE_OPTIONS = "--use-system-ca"

$lab = Split-Path -Parent $PSScriptRoot
$directory = Join-Path $lab ("candidates\{0}" -f $Candidate)
$npmCommand = Get-Command npm.cmd -ErrorAction Stop

& (Join-Path $PSScriptRoot "parse-check.ps1")
if (-not $?) { throw "PowerShell parse validation failed." }

& (Join-Path $PSScriptRoot "verify-production-boundary.ps1")
if (-not $?) { throw "Production-boundary validation failed." }

Push-Location $directory
try {
    & $npmCommand.Source run typecheck
    if ($LASTEXITCODE -ne 0) {
        throw ("TypeScript validation failed for candidate: {0}" -f $Candidate)
    }

    & $npmCommand.Source run build
    if ($LASTEXITCODE -ne 0) {
        throw ("Production build failed for candidate: {0}" -f $Candidate)
    }
}
finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot "verify-production-boundary.ps1")
if (-not $?) { throw "Post-build production-boundary validation failed." }
Write-Host ("Candidate typecheck and production build passed: {0}" -f $Candidate) -ForegroundColor Green
