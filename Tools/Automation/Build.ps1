[CmdletBinding()]
param(
    [ValidateSet('x64', 'ARM64')] [string] $Platform = 'x64',
    [ValidateSet('validation', 'development', 'stable')] [string] $Channel = 'validation'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
New-Item artifacts/logs -ItemType Directory -Force | Out-Null
# Capture exact bytes before generating workspace-only source inputs; never destroy a local key file.
$workspaceInputs = @('Telegram/Telegram.csproj', 'Telegram/Constants.Secret.cs', 'Telegram.Msix/Package.appxmanifest', 'Telegram.Msix/Telegram.Msix.wapproj')
$originals = @{}
foreach ($path in $workspaceInputs) { $originals[$path] = $(if (Test-Path $path) { [IO.File]::ReadAllBytes((Join-Path $root $path)) } else { $null }) }
Start-Transcript -Path "artifacts/logs/build-$Platform.txt"
function Invoke-Checked([string] $Executable, [string[]] $Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE. Inspect the transcript and MSBuild diagnostic log." }
}
try {
    $sha = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve checked out source.' }
    if ($env:GITHUB_SHA -and $sha -ne $env:GITHUB_SHA) { throw 'Source SHA does not match triggering SHA.' }
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $vs = & $vswhere -latest -prerelease -products * -version '[18.0,19.0)' -requires Microsoft.Component.MSBuild -property installationPath
    if (-not $vs) { throw 'Visual Studio 2026 with UWP, C++, .NET Native and MSIX packaging is required.' }
    $msbuild = Join-Path $vs 'MSBuild/Current/Bin/amd64/MSBuild.exe'
    $env:PATH = "$(Split-Path $vswhere);$env:PATH"
    foreach ($tool in @('cmake', 'php', 'dotnet', 'git')) { Get-Command $tool -ErrorAction Stop | Out-Null }
    if (-not (Test-Path 'C:/Program Files (x86)/Windows Kits/10/Include/10.0.26100.0')) { throw 'Windows SDK 10.0.26100.0 is required.' }
    $baseline = (Get-Content vcpkg.json -Raw | ConvertFrom-Json).'builtin-baseline'
    $temporaryRoot = $(if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() })
    $env:VCPKG_ROOT = Join-Path $temporaryRoot ("nvgram-vcpkg-" + [guid]::NewGuid().ToString('N'))
    Invoke-Checked git @('clone', 'https://github.com/microsoft/vcpkg.git', $env:VCPKG_ROOT)
    Invoke-Checked git @('-C', $env:VCPKG_ROOT, 'checkout', '--detach', $baseline)
    Invoke-Checked (Join-Path $env:VCPKG_ROOT 'bootstrap-vcpkg.bat') @('-disableMetrics')
    # Public validation never receives credentials. A release build uses channel-scoped app configuration,
    # which is deliberately embedded in a desktop client, NOT an account token or signing secret.
    $apiId = 0; $apiHash = ''; $appChannel = ''
    if ($Channel -ne 'validation') {
        if ($env:NVGRAM_API_ID -notmatch '^[1-9][0-9]*$' -or $env:NVGRAM_API_HASH -notmatch '^[a-fA-F0-9]{32}$') { throw 'Release environment requires a valid NVGRAM_API_ID and NVGRAM_API_HASH.' }
        if ($env:NVGRAM_APP_CHANNEL -notmatch '^[A-Za-z0-9_]*$') { throw 'NVGRAM_APP_CHANNEL must be a Telegram username or empty.' }
        $apiId = $env:NVGRAM_API_ID; $apiHash = $env:NVGRAM_API_HASH; $appChannel = $env:NVGRAM_APP_CHANNEL
    }
    # The legacy project enumerates Compile items; explicitly include generated CI constants.
    [xml] $project = Get-Content Telegram/Telegram.csproj -Raw
    if (-not $project.SelectSingleNode("//*[local-name()='Compile' and @Include='Constants.Secret.cs']")) {
        $compile = $project.CreateElement('Compile', $project.DocumentElement.NamespaceURI)
        $compile.SetAttribute('Include', 'Constants.Secret.cs')
        $group = $project.CreateElement('ItemGroup', $project.DocumentElement.NamespaceURI)
        $group.AppendChild($compile) | Out-Null
        $project.DocumentElement.AppendChild($group) | Out-Null
    }
    $project.Save((Join-Path $root 'Telegram/Telegram.csproj'))
    $count = (& git rev-list --count HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or [int]$count -gt 65535) { throw 'Constants.BuildNumber exceeds ushort; update application version policy before release.' }
    @"
namespace Telegram {
    public static partial class Constants {
        static Constants() {
            ApiId = $apiId;
            ApiHash = "$apiHash";
            AppChannel = "$appChannel";
            BuildNumber = $count;
        }
    }
}
"@ | Set-Content Telegram/Constants.Secret.cs -Encoding UTF8
    [xml] $manifest = Get-Content Telegram.Msix/Package.appxmanifest -Raw
    if ($Channel -ne 'validation') {
        $metadata = Get-Content artifacts/release/release.json -Raw | ConvertFrom-Json
        $manifest.Package.Identity.Name = $metadata.packageIdentity
        $manifest.Package.Identity.Version = $metadata.packageVersion
        if ($env:NVGRAM_PUBLISHER -notmatch '^CN=.+$') { throw 'NVGRAM_PUBLISHER is required for release packages.' }
        $manifest.Package.Identity.Publisher = $env:NVGRAM_PUBLISHER
        if ($Channel -eq 'development') {
            $manifest.Package.Properties.DisplayName = 'NvGram Bleeding Edge'
            $manifest.SelectSingleNode("//*[local-name()='VisualElements']").SetAttribute('DisplayName', 'NvGram Bleeding Edge')
            $manifest.SelectSingleNode("//*[local-name()='ExecutionAlias']").SetAttribute('Alias', 'NvGramDev.exe')
            # Do not capture Stable's tg/tonsite protocol handlers on an opt-in development install.
            foreach ($node in @($manifest.SelectNodes("//*[local-name()='Extension' and @Category='windows.protocol']"))) { $node.ParentNode.RemoveChild($node) | Out-Null }
        }
        $manifest.Save((Join-Path $root 'Telegram.Msix/Package.appxmanifest'))
        # Embed full channel/version provenance in the MSIX payload as well as the outer ZIP.
        [xml] $packaging = Get-Content Telegram.Msix/Telegram.Msix.wapproj -Raw
        $contentGroup = $packaging.CreateElement('ItemGroup', $packaging.DocumentElement.NamespaceURI)
        foreach ($file in @('release.json', 'CHANGELOG.md')) {
            $content = $packaging.CreateElement('Content', $packaging.DocumentElement.NamespaceURI)
            $content.SetAttribute('Include', "..\artifacts\release\$file")
            $link = $packaging.CreateElement('Link', $packaging.DocumentElement.NamespaceURI)
            $link.InnerText = "NvGramRelease\$file"
            $content.AppendChild($link) | Out-Null
            $copy = $packaging.CreateElement('CopyToOutputDirectory', $packaging.DocumentElement.NamespaceURI)
            $copy.InnerText = 'Always'
            $content.AppendChild($copy) | Out-Null
            $contentGroup.AppendChild($content) | Out-Null
        }
        $packaging.DocumentElement.AppendChild($contentGroup) | Out-Null
        $packaging.Save((Join-Path $root 'Telegram.Msix/Telegram.Msix.wapproj'))
    }
    # tdlib generates MIME tables in its host-only `prepare` step and requires GNU gperf, which the
    # runner image does not ship (its MSYS2 package set is empty). Install the baseline-pinned gperf
    # port as a host tool and expose it on PATH so find_program(GPERF_EXECUTABLE gperf) succeeds.
    Push-Location $env:VCPKG_ROOT
    try {
        Invoke-Checked (Join-Path $env:VCPKG_ROOT 'vcpkg.exe') @('install', 'gperf:x64-windows', '--x-install-root', (Join-Path $env:VCPKG_ROOT 'installed'))
    } finally { Pop-Location }
    $gperf = Get-ChildItem (Join-Path $env:VCPKG_ROOT 'installed') -Recurse -Filter 'gperf.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $gperf) { throw 'tdlib code generation requires gperf, but the vcpkg gperf host tool was not produced.' }
    $env:PATH = "$($gperf.Directory.FullName);$env:PATH"
    Push-Location Libraries/tdjson
    try { & ./build.ps1 -arch $Platform -vcpkg_root $env:VCPKG_ROOT } finally { Pop-Location }
    $common = @('Telegram.slnx', '-restore', '-m', '-nologo', '-verbosity:minimal', '-p:RestorePackagesConfig=true', '-p:Configuration=Release', "-p:Platform=$Platform", '-p:Deterministic=true', '-p:ContinuousIntegrationBuild=true', '-p:NuGetAudit=true', '-p:NuGetAuditMode=all', '-p:NuGetAuditLevel=high', '-p:WarningsAsErrors=NU1903%3BNU1904', '-p:RunAnalyzersDuringBuild=true', '-p:EnableNETAnalyzers=true', '-p:RunCodeAnalysis=true')
    Invoke-Checked $msbuild ($common + @('-target:Telegram_Native;Telegram_Native_Calls', "-flp:logfile=artifacts/logs/native-$Platform.log;verbosity=normal"))
    Invoke-Checked $msbuild ($common + @('-target:Telegram_Msix', '-p:UapAppxPackageBuildMode=SideloadOnly', '-p:AppxBundle=Always', "-p:AppxBundlePlatforms=$Platform", '-p:AppxPackageSigningEnabled=false', '-p:GenerateTestArtifacts=true', "-flp:logfile=artifacts/logs/package-$Platform.log;verbosity=normal"))
    $bundles = @(Get-ChildItem Telegram.Msix/AppPackages -Recurse -Filter *.msixbundle)
    if ($bundles.Count -ne 1) { throw "Expected exactly one fresh bundle, found $($bundles.Count)." }
    # VSTest projects are discovered explicitly; benchmarks are not represented as application tests.
    $tests = @(Get-ChildItem -Recurse -Filter *.csproj | Where-Object { $_.FullName -notmatch '[\\/]Libraries[\\/]' -and (Get-Content $_.FullName -Raw) -match 'Microsoft.NET.Test.Sdk|<IsTestProject>true</IsTestProject>' })
    foreach ($test in $tests) { Invoke-Checked dotnet @('test', $test.FullName, '--configuration', 'Release', '--logger', 'trx', '--results-directory', "$root/artifacts/tests") }
    $validation = @{ schemaVersion = 1; commit = $sha; platform = $Platform; build = 'passed'; packaging = 'passed'; testProjects = @($tests.FullName); applicationTests = $(if ($tests.Count) { 'passed' } else { 'not-configured' }); timestamp = [DateTime]::UtcNow.ToString('o'); msbuild = (& $msbuild -version -nologo | Out-String).Trim(); dotnet = (& dotnet --version); vcpkg = $baseline; submodules = (& git submodule status --recursive | Out-String) }
    $validation | ConvertTo-Json -Depth 8 | Set-Content artifacts/validation.json -Encoding UTF8
    # Retain resolved dependency inputs, not credential-bearing binary logs.
    New-Item artifacts/dependencies -ItemType Directory -Force | Out-Null
    Get-ChildItem -Recurse -Filter project.assets.json | Where-Object { $_.FullName -notmatch '[\\/]vcpkg_installed[\\/]' } | ForEach-Object { Copy-Item $_.FullName (Join-Path artifacts/dependencies (($_.Directory.Parent.Name) + '-' + [guid]::NewGuid().ToString() + '.json')) }
} finally {
    try {
        foreach ($path in $workspaceInputs) {
            if ($null -ne $originals[$path]) { [IO.File]::WriteAllBytes((Join-Path $root $path), $originals[$path]) }
            elseif (Test-Path $path) { Remove-Item -LiteralPath $path -Force }
        }
    } finally { Stop-Transcript }
}
