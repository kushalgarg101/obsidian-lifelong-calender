$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$manifestPath = Join-Path $root "manifest.json"
$stylesPath = Join-Path $root "styles.css"
$mainPath = Join-Path $root "main.js"
$releaseRoot = Join-Path $root "release"

if (!(Test-Path $manifestPath)) {
  throw "manifest.json not found."
}

$manifest = Get-Content $manifestPath | ConvertFrom-Json
$version = $manifest.version

if ([string]::IsNullOrWhiteSpace($version)) {
  throw "manifest.json does not contain a valid version."
}

Write-Host "Building release assets for version $version..."
npm run build

if (!(Test-Path $mainPath)) {
  throw "main.js was not generated."
}

$releaseDir = Join-Path $releaseRoot $version
if (Test-Path $releaseDir) {
  Remove-Item -Recurse -Force $releaseDir
}

New-Item -ItemType Directory -Path $releaseDir | Out-Null

Copy-Item $mainPath (Join-Path $releaseDir "main.js")
Copy-Item $manifestPath (Join-Path $releaseDir "manifest.json")

if (Test-Path $stylesPath) {
  Copy-Item $stylesPath (Join-Path $releaseDir "styles.css")
}

$zipPath = Join-Path $releaseRoot ("lifelong-calendar-" + $version + ".zip")
if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $zipPath

Write-Host ""
Write-Host "Release assets created:"
Write-Host "  $releaseDir"
Write-Host "  $zipPath"
Write-Host ""
Write-Host "Upload these files to the GitHub release:"
Write-Host "  main.js"
Write-Host "  manifest.json"
Write-Host "  styles.css"
