param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$ZipPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $ZipPath) {
  $ZipPath = Join-Path $RepoRoot "FTPE_social_master_assets.zip"
}

if (-not (Test-Path $ZipPath)) {
  throw "ZIP not found: $ZipPath"
}

$TargetDir = Join-Path $RepoRoot "assets\ftpe\social_master"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
Copy-Item -Force $ZipPath (Join-Path $TargetDir "FTPE_social_master_assets.zip")

Push-Location $RepoRoot
try {
  git add assets/ftpe/social_master/FTPE_social_master_assets.zip
  git commit -m "Add FTPE social master asset ZIP"
  git push
  Write-Host "FTPE social master asset ZIP uploaded to repo."
} finally {
  Pop-Location
}
