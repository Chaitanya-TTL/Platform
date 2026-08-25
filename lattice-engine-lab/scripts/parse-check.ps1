[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$scripts = Get-ChildItem $PSScriptRoot -Filter "*.ps1" -File
$failed = $false
foreach ($script in $scripts) {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count -gt 0) {
        $failed = $true
        foreach ($parseError in $errors) {
            Write-Error ("PowerShell parse error in {0} at line {1}, column {2}: {3}" -f $script.Name, $parseError.Extent.StartLineNumber, $parseError.Extent.StartColumnNumber, $parseError.Message)
        }
    }
}
if ($failed) { throw "PowerShell parse validation failed." }
Write-Host ("PowerShell parse validation passed for {0} scripts." -f $scripts.Count) -ForegroundColor Green
