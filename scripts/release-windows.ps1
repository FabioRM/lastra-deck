#Requires -Version 7.2
[CmdletBinding()]
param(
    [string]$Tag
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

if (-not $IsWindows) {
    throw 'Build the Windows release on a Windows machine.'
}

Push-Location (Join-Path $PSScriptRoot '..')
try {
    $package = Get-Content -Raw package.json | ConvertFrom-Json
    $version = $package.version
    $lock = Get-Content -Raw package-lock.json | ConvertFrom-Json -AsHashtable
    if ($lock.version -cne $version -or $lock.packages[''].version -cne $version) {
        throw 'package.json and package-lock.json disagree on the release version.'
    }
    if ($Tag) {
        if ($Tag -cne "v$version" -or $version -notmatch '^\d+\.\d+\.\d+$') {
            throw "Expected a stable release tag for package.json version $version, got $Tag."
        }
        $tagCommit = git rev-parse --verify "refs/tags/$Tag^{commit}"
        $head = git rev-parse HEAD
        if ($tagCommit -ne $head -or (git status --porcelain)) {
            throw 'Check out the release tag with a clean working tree before building.'
        }
    }

    $previousSkipDownload = $env:ELECTRON_SKIP_BINARY_DOWNLOAD
    try {
        $env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    } finally {
        $env:ELECTRON_SKIP_BINARY_DOWNLOAD = $previousSkipDownload
    }
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'Release checks failed.' }
    npm run dist
    if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }

    $installerName = "Lastra-Setup-$version.exe"
    $installer = Get-Item -LiteralPath "out/$installerName"
    $blockmap = Get-Item -LiteralPath "out/$installerName.blockmap"
    $metadata = Get-Item -LiteralPath 'out/latest.yml'
    if ($installer.Length -eq 0 -or $blockmap.Length -eq 0) {
        throw 'The installer or its blockmap is empty.'
    }
    $sha512 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA512).Hash
    $updateHash = [Convert]::ToBase64String([Convert]::FromHexString($sha512))
    $update = Get-Content -LiteralPath $metadata.FullName -Raw
    if ($update -notmatch "(?m)^version: $([regex]::Escape($version))\r?$" -or
        $update -notmatch "(?m)^path: $([regex]::Escape($installerName))\r?$" -or
        $update -notmatch "(?m)^sha512: $([regex]::Escape($updateHash))\r?$") {
        throw 'latest.yml does not match the Windows installer.'
    }

    $sha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$sha256  $installerName" | Set-Content -LiteralPath "out/$installerName.sha256" -Encoding ascii
    Write-Host "Built $installerName and verified its update metadata. Release files are in out/."
} finally {
    Pop-Location
}
