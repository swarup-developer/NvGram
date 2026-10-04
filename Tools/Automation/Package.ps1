[CmdletBinding()]
param([ValidateSet('development', 'stable')] [string] $Channel)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
$metadata = Get-Content artifacts/release/release.json -Raw | ConvertFrom-Json
$validation = Get-Content artifacts/validation.json -Raw | ConvertFrom-Json
if ($metadata.channel -ne $Channel -or $metadata.commit -ne $env:GITHUB_SHA -or $validation.commit -ne $metadata.commit -or $validation.build -ne 'passed') { throw 'Cannot package an unvalidated source revision.' }
if (-not $env:NVGRAM_SIGNING_PFX -or -not $env:NVGRAM_SIGNING_PASSWORD) { throw 'Signing credentials are required; no repository test key may be used for a release.' }
$kit = 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64'
$sign = Join-Path $kit signtool.exe
$make = Join-Path $kit makeappx.exe
$pfx = Join-Path $env:RUNNER_TEMP 'nvgram-signing.pfx'
$cert = $null
function Invoke-Checked([string] $Executable, [string[]] $Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE." }
}
try {
    [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:NVGRAM_SIGNING_PFX))
    $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($pfx, $env:NVGRAM_SIGNING_PASSWORD)
    if ($cert.Subject -ne $env:NVGRAM_PUBLISHER -or -not $cert.HasPrivateKey -or $cert.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow) { throw 'Signing certificate does not match the configured publisher, lacks a key, or expired.' }
    $bundles = @(Get-ChildItem Telegram.Msix/AppPackages -Recurse -Filter *.msixbundle)
    if ($bundles.Count -ne 1) { throw 'Exactly one build bundle is required.' }
    $bundle = $bundles[0]
    Invoke-Checked $sign @('sign', '/fd', 'SHA256', '/f', $pfx, '/p', $env:NVGRAM_SIGNING_PASSWORD, '/tr', 'https://timestamp.digicert.com', '/td', 'SHA256', $bundle.FullName)
    Invoke-Checked $sign @('verify', '/pa', '/all', $bundle.FullName)
    $unpacked = Join-Path $env:RUNNER_TEMP 'nvgram-bundle-validation'
    Invoke-Checked $make @('unbundle', '/p', $bundle.FullName, '/d', $unpacked, '/o')
    [xml] $bundleManifest = Get-Content (Join-Path $unpacked 'AppxMetadata/AppxBundleManifest.xml') -Raw
    $identity = $bundleManifest.Bundle.Identity
    if ($identity.Name -ne $metadata.packageIdentity -or $identity.Version -ne $metadata.packageVersion -or $identity.Publisher -ne $env:NVGRAM_PUBLISHER) { throw 'Built bundle identity/version/publisher differs from release metadata.' }
    $applications = @($bundleManifest.Bundle.Packages.Package | Where-Object { $_.Type -eq 'application' })
    if ($applications.Count -ne 1 -or $applications[0].Architecture -ne 'x64') { throw 'Release requires the validated x64 application package.' }
    $app = Join-Path $env:RUNNER_TEMP 'nvgram-app-validation'
    Invoke-Checked $make @('unpack', '/p', (Join-Path $unpacked $applications[0].FileName), '/d', $app, '/o')
    foreach ($name in @('Telegram.exe', 'tdjson.dll', 'libvlc.dll', 'libvlccore.dll')) {
        if (-not (Get-ChildItem $app -Recurse -Filter $name)) { throw "Missing required runtime file: $name" }
    }
    if (-not (Get-ChildItem (Join-Path $app 'plugins') -Recurse -Filter *.dll)) { throw 'Missing VLC plugins.' }
    $embedded = Join-Path $app 'NvGramRelease/release.json'
    if (-not (Test-Path $embedded)) { throw 'Full release metadata is missing from the application package.' }
    $embeddedMetadata = Get-Content $embedded -Raw | ConvertFrom-Json
    if ($embeddedMetadata.version -ne $metadata.version -or $embeddedMetadata.channel -ne $Channel -or $embeddedMetadata.commit -ne $metadata.commit) { throw 'Embedded provenance differs from the release.' }
    $review = Get-Content artifacts/prerelease-review/review.json -Raw | ConvertFrom-Json
    if ($review.commit -ne $metadata.commit -or $null -eq $review.findings -or @($review.findings).Count -ne 0) { throw 'Security review does not establish a passing result for this commit.' }
    $metadata.validation = 'passed'
    $metadata | Add-Member -NotePropertyName publisher -NotePropertyValue $cert.Subject
    $metadata | Add-Member -NotePropertyName certificateThumbprint -NotePropertyValue $cert.Thumbprint
    $metadata | ConvertTo-Json -Depth 10 | Set-Content artifacts/release/release.json -Encoding UTF8
    $validation | Add-Member -NotePropertyName securityReview -NotePropertyValue 'passed'
    $validation | Add-Member -NotePropertyName requiredGate -NotePropertyValue 'passed'
    $validation | Add-Member -NotePropertyName validationRun -NotePropertyValue $metadata.runUrl
    $validation | ConvertTo-Json -Depth 10 | Set-Content artifacts/release/validation.json -Encoding UTF8
    Copy-Item artifacts/prerelease-review/review.json artifacts/release/review.json
    $stage = 'artifacts/install'
    New-Item $stage -ItemType Directory -Force | Out-Null
    Copy-Item "$($bundle.Directory.FullName)/*" $stage -Recurse
    # Ensure the signed bundle, channel/version information and license are in every installation archive.
    $name = "NvGram-$Channel-$($metadata.tag)-x64.msixbundle"
    Get-ChildItem $stage -Filter *.msixbundle | Rename-Item -NewName $name
    Copy-Item (Join-Path $stage $name) (Join-Path artifacts/release $name)
    Copy-Item artifacts/release/release.json, artifacts/release/CHANGELOG.md, artifacts/release/RELEASE.md, LICENSE $stage
    $url = "https://github.com/$($metadata.repository)/releases/download/$($metadata.tag)/$name"
    @{ schemaVersion = 1; channel = $Channel; version = $metadata.version; packageVersion = $metadata.packageVersion; identity = $metadata.packageIdentity; publisher = $cert.Subject; commit = $metadata.commit; bundleUrl = $url; sha256 = (Get-FileHash (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant(); automaticChannelSwitch = $false } | ConvertTo-Json | Set-Content "artifacts/release/$Channel.json" -Encoding UTF8
    Copy-Item "artifacts/release/$Channel.json" $stage
    Compress-Archive -Path "$stage/*" -DestinationPath "artifacts/release/NvGram-$Channel-$($metadata.tag)-x64.zip"
} finally {
    Remove-Item $pfx -ErrorAction SilentlyContinue
    if ($cert) { $cert.Dispose() }
}
