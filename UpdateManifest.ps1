param (
  [string]$path = $(throw "-path is required"),
  [string]$config = "DEBUG",
  [string]$mode = ""
)

Write-Output "Config: $config"
Write-Output "Path: $path"
Write-Output "Mode: $mode"

$path = (Resolve-Path $path).Path
$path_manifest = Join-Path $path "Package.appxmanifest"

$config = $config.ToUpper()

if ($mode -ieq "StoreUpload") {
    throw "StoreUpload is disabled for NvGram: Package.StoreAssociation.xml still contains upstream Unigram Store metadata. Configure NvGram's own Partner Center association before creating a Store upload."
}

if ($config -notin @("DEBUG", "RELEASE")) {
    throw "Unsupported NvGram manifest configuration '$config'. Expected DEBUG or RELEASE."
}

Write-Output "Manifest: $config"

$out = git -C $path rev-list --count HEAD
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($out)) {
    throw "Unable to read the repository commit count for build versioning."
}

Write-Host "Git rev-list: $out"

$rtn = 0
if ([double]::TryParse($out, [ref]$rtn) -ne $true) {
    throw "Git returned an invalid commit count '$out'."
}

#$out = "7447"
#$rtn = 7447

$documentRaw = Get-Content $path_manifest -Raw
$documentRaw = $documentRaw -replace "packageManagement`" />`r`n    <rescap:Capability Name=`"oneProcessVoIP", "oneProcessVoIP"

if ($config -ne "RELEASE") {
    $documentRaw = $documentRaw -replace "oneProcessVoIP", "packageManagement`" />`r`n    <rescap:Capability Name=`"oneProcessVoIP"
}

[xml]$document = $documentRaw

$h = @{}
$h["DEBUG"] = @{
    Name = "NvGram.Desktop.Bundle";
    Publisher = "CN=D89C87B4-2758-402A-8F40-3571D00882AB";
    DisplayName = "NvGram";
    PublisherDisplayName = "NvGram";
    AppName = "NvGram"
}
$h["RELEASE"] = @{
    Name = "NvGram.Desktop.Bundle";
    Publisher = "CN=D89C87B4-2758-402A-8F40-3571D00882AB";
    DisplayName = "NvGram";
    PublisherDisplayName = "NvGram";
    AppName = "NvGram"
}
$identity = $document.GetElementsByTagName("Identity")[0]
$identity.Attributes["Name"].Value = $h[$config].Name
$identity.Attributes["Publisher"].Value = $h[$config].Publisher

$version = $identity.Attributes["Version"].Value
$regex = [regex]'(?:(\d+)\.)(?:(\d+)\.)(?:(\d*?)\.\d+)'

if ($config -eq "RELEASE") {
    $identity.Attributes["Version"].Value = $regex.Replace($version, '$1.$2.$3.0')
}
else {
    $identity.Attributes["Version"].Value = $regex.Replace($version, '$1.$2.$3.{0}' -f $out)
}

$properties = $document.GetElementsByTagName("Properties")[0]
$displayName = $properties.GetElementsByTagName("DisplayName")[0]
$displayName.InnerText = $h[$config].DisplayName

$publisherDisplayName = $properties.GetElementsByTagName("PublisherDisplayName")[0]
$publisherDisplayName.InnerText = $h[$config].PublisherDisplayName

$visualElements = $document.GetElementsByTagName("uap:VisualElements")[0]
$visualElements.Attributes["DisplayName"].Value = $h[$config].AppName

$manifestTempPath = "$path_manifest.tmp"
$constantsPath = Join-Path $path "..\Telegram\Constants.Secret.cs"
if (-not (Test-Path $constantsPath)) {
    throw "Build constants file not found at $constantsPath."
}

$document.Save($manifestTempPath)

try {
    if (Compare-Object -ReferenceObject $(Get-Content $path_manifest) -DifferenceObject $(Get-Content $manifestTempPath)) {
        $document.Save($path_manifest)
        Write-Output "Package.appxmanifest updated"
    }
}
finally {
    Remove-Item $manifestTempPath -ErrorAction SilentlyContinue
}

(Get-Content -path $constantsPath) -Replace "BuildNumber = (.*?);", "BuildNumber = ${out};" | Out-File $constantsPath