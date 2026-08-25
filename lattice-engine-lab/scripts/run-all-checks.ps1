[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "verify-production-boundary.ps1")
$lab = Split-Path -Parent $PSScriptRoot
foreach ($candidate in @("cytoscape","g6","sigma","reagraph","cosmos","relation-graph","react-flow","elk-layout")) {
    $lockfile = Join-Path $lab ("candidates\{0}\package-lock.json" -f $candidate)
    if (Test-Path $lockfile) { & (Join-Path $PSScriptRoot "build-candidate.ps1") $candidate }
    else { Write-Warning ("Candidate is not installed and was skipped: {0}" -f $candidate) }
}
