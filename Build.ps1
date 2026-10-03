param (
  [string]$arch = "x64|arm64",
  [string]$mode = "SideloadOnly"
)

if ($mode -eq "StoreUpload") {
  throw "StoreUpload is disabled for NvGram until its own Partner Center package association is configured. The repository's StoreAssociation metadata belongs to upstream Unigram."
}

.\UpdateManifest.ps1 -path "Telegram.Msix\\" -config "RELEASE" -mode "$mode"
if ($LASTEXITCODE -ne 0) { throw "UpdateManifest.ps1 failed with exit code $LASTEXITCODE." }

msbuild Telegram.slnx /target:Telegram_Msix /p:Configuration=Release /p:Platform="$arch" /p:UapAppxPackageBuildMode=$mode /p:AppxBundlePlatforms="$arch" /p:AppxBundle=Always /p:AppxPackageSigningEnabled=True
if ($LASTEXITCODE -ne 0) { throw "MSBuild failed with exit code $LASTEXITCODE." }