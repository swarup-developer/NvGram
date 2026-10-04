$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('nvgram-build-cleanup-' + [guid]::NewGuid().ToString('N'))
$previousLocation = Get-Location
$previousSha = $env:GITHUB_SHA
try {
    New-Item (Join-Path $fixture 'Tools/Automation'), (Join-Path $fixture 'Telegram'), (Join-Path $fixture 'Telegram.Msix') -ItemType Directory -Force | Out-Null
    Copy-Item (Join-Path $PSScriptRoot '../Build.ps1') (Join-Path $fixture 'Tools/Automation/Build.ps1')
    $files = @('Telegram/Telegram.csproj', 'Telegram/Constants.Secret.cs', 'Telegram.Msix/Package.appxmanifest', 'Telegram.Msix/Telegram.Msix.wapproj')
    foreach ($file in $files) { [IO.File]::WriteAllBytes((Join-Path $fixture $file), [byte[]](239,187,191,65,13,10,66)) }
    Set-Location $fixture
    & git init --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Fixture git initialization failed.' }
    & git -c user.name=Test -c user.email=test@example.invalid commit --allow-empty --quiet -m fixture
    if ($LASTEXITCODE -ne 0) { throw 'Fixture git commit failed.' }
    $env:GITHUB_SHA = 'not-the-fixture-commit'
    $failed = $false
    try { & (Join-Path $fixture 'Tools/Automation/Build.ps1') } catch {
        if ($_.Exception.Message -notmatch 'Source SHA does not match') { throw }
        $failed = $true
    }
    if (-not $failed) { throw 'Build should fail on source mismatch.' }
    foreach ($file in $files) {
        $bytes = [IO.File]::ReadAllBytes((Join-Path $fixture $file))
        if ([Convert]::ToBase64String($bytes) -ne [Convert]::ToBase64String([byte[]](239,187,191,65,13,10,66))) { throw "Build failure modified or deleted $file" }
    }
    Remove-Item (Join-Path $fixture 'Telegram/Constants.Secret.cs')
    try { & (Join-Path $fixture 'Tools/Automation/Build.ps1') } catch {
        if ($_.Exception.Message -notmatch 'Source SHA does not match') { throw }
    }
    if (Test-Path (Join-Path $fixture 'Telegram/Constants.Secret.cs')) { throw 'Build cleanup created an originally absent secret file.' }
    Write-Output 'PASS: actual build failure preserves workspace inputs and existing API configuration byte-for-byte.'
} finally {
    $env:GITHUB_SHA = $previousSha
    Set-Location $previousLocation
    if (Test-Path $fixture) { Remove-Item $fixture -Recurse -Force }
}
