[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repo
try {
    $before = @(git status --porcelain=v1 -- OrchestrationPlatform/frontend)
    $after = @(git status --porcelain=v1 -- OrchestrationPlatform/frontend)
    if (($before -join "`n") -ne ($after -join "`n")) {
        throw "Production frontend status changed during boundary inspection."
    }
    Write-Host "Production boundary verified. No production files were changed by this script." -ForegroundColor Green
    if ($before.Count -gt 0) {
        Write-Host ("Existing frontend changes detected: {0}. They were not modified." -f $before.Count) -ForegroundColor Yellow
    }
}
finally { Pop-Location }
