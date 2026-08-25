[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "parse-check.ps1")
& (Join-Path $PSScriptRoot "verify-production-boundary.ps1")
& (Join-Path $PSScriptRoot "validate-lab.ps1")
Write-Host "Lab setup validation completed. No dependencies were installed." -ForegroundColor Green
