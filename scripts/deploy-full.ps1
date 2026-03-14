# Deploy: GitHub push + Cloudflare Pages
# Usage: npm run deploy:full  or  .\scripts\deploy-full.ps1 "commit message"

param(
    [string]$Message = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Load from .env
$env:CLOUDFLARE_ACCOUNT_ID = "a6fa9e34e1c8653d73bb0d5d6dfbb785"
if (Test-Path ".env") {
    Get-Content ".env" -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^CLOUDFLARE_API_TOKEN=(.+)$') {
            $env:CLOUDFLARE_API_TOKEN = $matches[1].Trim().Trim('"')
        }
        if ($_ -match '^CLOUDFLARE_ACCOUNT_ID=(.+)$') {
            $env:CLOUDFLARE_ACCOUNT_ID = $matches[1].Trim().Trim('"')
        }
    }
}
if (-not $env:CLOUDFLARE_API_TOKEN) {
    Write-Host "CLOUDFLARE_API_TOKEN not set. Add to .env or run: npx wrangler login" -ForegroundColor Yellow
}

# Step 1: GitHub push (skip if not a git repo)
Write-Host "`n=== Step 1: GitHub ===" -ForegroundColor Cyan
if (Test-Path ".git") {
    $status = git status --porcelain
    if ($status) {
        git add .
        git commit -m $Message
        git push origin HEAD:main
        Write-Host "GitHub push done" -ForegroundColor Green
    } else {
        Write-Host "No changes, skip GitHub" -ForegroundColor Yellow
    }
} else {
    Write-Host "Not a git repo, skip GitHub. Run: git init && git remote add origin <url>" -ForegroundColor Yellow
}

# Step 2: Build + Cloudflare deploy
Write-Host "`n=== Step 2: Build + Cloudflare ===" -ForegroundColor Cyan
Write-Host "Run database migrations..." -ForegroundColor Cyan
$migrationScripts = @(
    ".\scripts\run-member-spin-wheel-prizes-migration.mjs",
    ".\scripts\run-member-points-mall-migration.mjs",
    ".\scripts\run-member-points-mall-redemption-admin-migration.mjs",
    ".\scripts\run-member-tenant-resolution-fix-migration.mjs",
    ".\scripts\run-member-portal-settings-by-account-migration.mjs",
    ".\scripts\run-phone-pool-extract-guard-and-consume-migration.mjs"
)
foreach ($script in $migrationScripts) {
    if (Test-Path $script) {
        Write-Host " - $script"
        node $script
        if ($LASTEXITCODE -ne 0) { exit 1 }
    }
}

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

npx wrangler pages deploy dist --project-name=gift-system --branch=main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy failed. Token needs: User->User Details Read, Account->Pages Edit" -ForegroundColor Red
    Write-Host "Or run: npx wrangler login" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "https://crm.fastgc.cc" -ForegroundColor Green
