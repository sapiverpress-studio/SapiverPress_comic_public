param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$ZipPath = "",
  [string]$DriveFileId = "17Qbd8Q6xICtKvpV0ZWtUuXv94nBWrXbc",
  [string]$CommitMessage = "Add FTPE social master asset ZIP"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is not available on PATH. Install Git or run this inside GitHub Codespaces."
}

if (-not (Test-Path $RepoRoot)) {
  throw "Repo root not found: $RepoRoot"
}

if (-not $ZipPath) {
  $ZipPath = Join-Path $RepoRoot "FTPE_social_master_assets.zip"
}

if (-not (Test-Path $ZipPath)) {
  if (-not $DriveFileId) {
    throw "ZIP not found and no DriveFileId supplied: $ZipPath"
  }

  Write-Host "Downloading FTPE social asset ZIP from Google Drive file id $DriveFileId ..."
  $downloadUrl = "https://drive.google.com/uc?export=download&id=$DriveFileId"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $ZipPath
}

try {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  $pngCount = ($zip.Entries | Where-Object { $_.FullName -match '\.png$' }).Count
  $zip.Dispose()
} catch {
  throw "Downloaded file is not a valid ZIP: $ZipPath`n$($_.Exception.Message)"
}

if ($pngCount -lt 5) {
  throw "Expected at least five PNGs in the social asset ZIP. Found $pngCount in $ZipPath"
}

$TargetDir = Join-Path $RepoRoot "assets\ftpe\social_master"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
Copy-Item -Force $ZipPath (Join-Path $TargetDir "FTPE_social_master_assets.zip")

Push-Location $RepoRoot
try {
  git status --short
  git add -f assets/ftpe/social_master/FTPE_social_master_assets.zip

  $pending = git diff --cached --name-only
  if (-not $pending) {
    Write-Host "No asset changes to commit. Repo already has the current social master ZIP."
    return
  }

  git commit -m $CommitMessage
  git push
  Write-Host "FTPE social master asset ZIP uploaded to repo with $pngCount PNGs."
} finally {
  Pop-Location
}
