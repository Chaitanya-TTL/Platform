param(
    [string]$RepositoryRoot = ".",
    [string]$OutputPath = ".\OrchestrationPlatform\audits\teamcenter-runtime-evidence.json"
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path $RepositoryRoot).Path
$sampleRoot = Join-Path $root "TeamCenter-to-Configit-soa_client\backend\samples"
$helloRoot = Join-Path $sampleRoot "HelloTeamcenter"
$libsRoot = Join-Path $sampleRoot "..\libs"

function Invoke-SafeVersion([string]$Command, [string[]]$Arguments) {
    try { return (& $Command @Arguments 2>&1 | Out-String).Trim() }
    catch { return "unavailable" }
}

function Get-JarMetadata([string]$Path) {
    $version = $null
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($Path)
        try {
            $entry = $zip.Entries | Where-Object FullName -eq "META-INF/MANIFEST.MF" | Select-Object -First 1
            if ($entry) {
                $reader = [IO.StreamReader]::new($entry.Open())
                try {
                    $manifest = $reader.ReadToEnd()
                    $match = [regex]::Match($manifest, '(?im)^(Implementation-Version|Bundle-Version|Specification-Version):\s*(.+)$')
                    if ($match.Success) { $version = $match.Groups[2].Value.Trim() }
                } finally { $reader.Dispose() }
            }
        } finally { $zip.Dispose() }
    } catch { $version = $null }
    [pscustomobject]@{ name = [IO.Path]::GetFileName($Path); version = $version; sha256 = (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
}

$jars = if (Test-Path $libsRoot) { Get-ChildItem $libsRoot -Filter *.jar -File -Recurse | ForEach-Object { Get-JarMetadata $_.FullName } } else { @() }
$source = Join-Path $helloRoot "src\com\teamcenter\hello\PLMXMLExport.java"
$sourceText = if (Test-Path $source) { [IO.File]::ReadAllText($source) } else { "" }
$buildFile = Join-Path $helloRoot "build.xml"
$buildText = if (Test-Path $buildFile) { [IO.File]::ReadAllText($buildFile) } else { "" }

$evidence = [ordered]@{
    collectedAt = [DateTimeOffset]::UtcNow.ToString("O")
    security = [ordered]@{ credentialsRead = $false; tokensRead = $false; environmentValuesPrinted = $false }
    javaVersion = Invoke-SafeVersion "java" @("-version")
    antVersion = Invoke-SafeVersion "ant" @("-version")
    javaTargetEvidence = [ordered]@{
        buildXmlSource = ([regex]::Match($buildText, 'source="([^"]+)"').Groups[1].Value)
        buildXmlTarget = ([regex]::Match($buildText, 'target="([^"]+)"').Groups[1].Value)
        java17RepairScriptPresent = Test-Path (Join-Path $helloRoot "rebuild-java17-direct.bat")
    }
    teamcenterJars = @($jars | Where-Object name -match '^TcSoa')
    strongModelJars = @($jars | Where-Object name -match 'StrongModel')
    queryServiceJars = @($jars | Where-Object name -match 'Query|SavedQuery')
    fmsEvidence = [ordered]@{
        fmsHomeConfigured = [bool]$env:FMS_HOME
        fscConfigurationPrinted = $false
        fileManagementApiReferenced = $sourceText -match 'FileManagementUtility'
    }
    connectionEvidence = [ordered]@{
        httpOrTccsSupportedBySource = $true
        currentRuntimeModeVerified = $false
        serverVersionVerified = $false
        authenticationModeVerified = $false
    }
    savedQueryEvidence = [ordered]@{
        savedQueryServiceReferenced = $sourceText -match 'SavedQueryService'
        getSavedQueriesReferenced = $sourceText -match 'getSavedQueries'
        itemNameEntryReferenced = $sourceText -match 'Item Name'
        itemIdEntryReferenced = $sourceText -match 'Item ID'
        liveCapabilityVerified = $false
        productNameDiscoveryEnabled = $false
    }
    revisionRuleEvidence = [ordered]@{
        latestWorkingReferenced = $sourceText -match 'Latest Working'
        runtimeRuleVerified = $false
    }
    outputIdentityFields = @('sourceItemId','sourceRevId','bomRoot.itemId','bomRoot.revId','bomRoot.sequence','bomRoot.qty','bomRoot.variantCondition','bomRoot.variantState')
}

$target = Join-Path $root $OutputPath
New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $target -Encoding utf8
Write-Host "Teamcenter runtime evidence written without credentials or tokens." -ForegroundColor Green
Write-Host "Output: $OutputPath" -ForegroundColor Cyan
