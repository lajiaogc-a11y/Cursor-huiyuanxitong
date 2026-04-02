# Push to GitHub
# Usage: npm run publish  or  .\scripts\push-to-github.ps1 "commit message"

param(
    [string]$Message = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "Checking changes..." -ForegroundColor Cyan
$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes to commit" -ForegroundColor Yellow
    exit 0
}

Write-Host "Adding files..." -ForegroundColor Cyan
git add .

Write-Host "Committing: $Message" -ForegroundColor Cyan
git commit -m $Message

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin HEAD:main

Write-Host "`nPublished to GitHub!" -ForegroundColor Green
