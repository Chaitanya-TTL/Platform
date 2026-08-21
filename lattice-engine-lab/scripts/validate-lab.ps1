[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$lab = Split-Path -Parent $PSScriptRoot
$required = @(
    "README.md",
    "SECURITY.md",
    "evaluation-manifest.json",
    "shared/contracts/canonical-graph.ts",
    "shared/fixtures/lattice-vertical-slice.ts"
)
foreach ($relativePath in $required) {
    if (-not (Test-Path (Join-Path $lab $relativePath))) {
        throw ("Missing required file: {0}" -f $relativePath)
    }
}
Get-Content (Join-Path $lab "evaluation-manifest.json") -Raw | ConvertFrom-Json | Out-Null
$candidates = @("cytoscape", "g6", "sigma", "reagraph", "cosmos", "relation-graph", "react-flow", "elk-layout")
foreach ($candidate in $candidates) {
    $manifestPath = Join-Path $lab ("candidates\{0}\package.json" -f $candidate)
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $versions = @($manifest.dependencies.PSObject.Properties.Value) + @($manifest.devDependencies.PSObject.Properties.Value)
    foreach ($version in $versions) {
        if ($version -match '^[~^]') {
            throw ("Non-exact version in {0}: {1}" -f $manifestPath, $version)
        }
    }
}
if (Test-Path (Join-Path $lab "candidates\graphin\package.json")) {
    throw "Graphin must not have an installable package.json."
}
$prohibited = Get-ChildItem $lab -Recurse -Force | Where-Object {
    $_.FullName -match '\\(node_modules|dist|build|coverage)(\\|$)' -or
    $_.Name -match '\.(tgz|zip)$'
}
if ($prohibited) { throw "Generated or prohibited files are present in the source foundation." }
foreach ($commercial in @("yfiles", "ogma", "keylines")) {
    $commercialPath = Join-Path $lab ("commercial\{0}" -f $commercial)
    $unexpected = Get-ChildItem $commercialPath -File | Where-Object { $_.Extension -notin @(".md") }
    if ($unexpected) { throw ("Commercial directory contains a prohibited file: {0}" -f $commercial) }
}
Write-Host "Source foundation validation passed." -ForegroundColor Green
Write-Host "Graphin quarantine validated." -ForegroundColor Green
Write-Host "Commercial-package exclusions validated." -ForegroundColor Green
