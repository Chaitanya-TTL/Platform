param([string]$RepositoryRoot=".")
$ErrorActionPreference="Stop"
$root=(Resolve-Path $RepositoryRoot).Path
$rules=@(
 @{Id="SEC001";Severity="critical";Pattern='(?i)authorization\s*[:=].*(apikey|bearer|basic)'},
 @{Id="SEC002";Severity="critical";Pattern='(?i)(api[_-]?key|client[_-]?secret|password|passwd|jco\.client\.passwd)\s*[:=]\s*["''][^"'']+["'']'},
 @{Id="SEC003";Severity="high";Pattern='(?i)https?://[^\s/:]+:[^\s/@]+@'}
)
$excluded='(?i)(^|[\\/])(\.git|node_modules|\.next|bin|obj|dist|runtime|logs?|coverage)([\\/]|$)|(?i)(\.zip|\.7z|\.dll|\.jar|\.exe|\.pdb|\.png|\.jpg|\.pdf)$'
$findings=@()
$self=$MyInvocation.MyCommand.Path
Get-ChildItem $root -Recurse -File -Force | Where-Object {$_.FullName -notmatch $excluded -and $_.FullName -ne $self} | ForEach-Object {
 $file=$_; foreach($rule in $rules){Select-String -LiteralPath $file.FullName -Pattern $rule.Pattern -AllMatches -ErrorAction SilentlyContinue | ForEach-Object {$findings += [pscustomobject]@{Path=$file.FullName.Substring($root.Length).TrimStart([char[]]@('\','/'));RuleId=$rule.Id;Severity=$rule.Severity;LineNumber=$_.LineNumber}}}
}
$findings | Sort-Object Path,LineNumber,RuleId | Format-Table -AutoSize
Write-Host "Findings: $($findings.Count). Matched values and source lines are intentionally suppressed."
if($findings.Count){exit 2}

