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
$findingsDirectory = Join-Path $directory "findings"
$manifestPath = Join-Path $directory "package.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
New-Item -ItemType Directory -Force -Path $findingsDirectory | Out-Null

& (Join-Path $PSScriptRoot "parse-check.ps1")
if (-not $?) { throw "PowerShell parse validation failed." }

& (Join-Path $PSScriptRoot "verify-production-boundary.ps1")
if (-not $?) { throw "Production-boundary validation failed." }

Write-Host "Node.js is configured to use the Windows system certificate authority store for all npm operations in this process." -ForegroundColor Green

$packageProperties = @($manifest.dependencies.PSObject.Properties) + @($manifest.devDependencies.PSObject.Properties)
foreach ($property in $packageProperties) {
    $specification = "{0}@{1}" -f $property.Name, $property.Value
    $safeName = $property.Name -replace '^@', '' -replace '[/\\]', '-' -replace '[^A-Za-z0-9._-]', '-'
    $metadataPath = Join-Path $findingsDirectory ("registry-{0}.json" -f $safeName)
    Write-Host ("Inspecting {0}" -f $specification) -ForegroundColor Cyan
    $metadata = & $npmCommand.Source view $specification name version time license engines peerDependencies peerDependenciesMeta scripts dist dependencies --json 2>&1
    $metadataExitCode = $LASTEXITCODE
    if ($metadataExitCode -ne 0) {
        $details = $metadata -join [Environment]::NewLine
        throw ("Registry inspection failed for {0}. Installation stopped.`n{1}" -f $specification, $details)
    }
    $metadata | Set-Content -LiteralPath $metadataPath -Encoding UTF8
}

Push-Location $directory
try {
    & $npmCommand.Source install --ignore-scripts --package-lock-only
    if ($LASTEXITCODE -ne 0) { throw "Lockfile generation failed. Installation stopped." }

    $auditOutput = & $npmCommand.Source audit --json 2>&1
    $auditExitCode = $LASTEXITCODE
    $auditOutput | Set-Content -LiteralPath (Join-Path $findingsDirectory "npm-audit.json") -Encoding UTF8
    if ($auditExitCode -gt 1) {
        throw ("npm audit execution failed with exit code {0}." -f $auditExitCode)
    }

    & $npmCommand.Source ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed. Installation stopped." }

    $dependencyTree = & $npmCommand.Source ls --all --json 2>&1
    $treeExitCode = $LASTEXITCODE
    $dependencyTree | Set-Content -LiteralPath (Join-Path $findingsDirectory "dependency-tree.json") -Encoding UTF8
    if ($treeExitCode -ne 0) { throw "Dependency-tree inspection failed after installation." }
}
finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot "verify-production-boundary.ps1")
if (-not $?) { throw "Post-install production-boundary validation failed." }
Write-Host ("Candidate installed with lifecycle scripts disabled: {0}" -f $Candidate) -ForegroundColor Green
