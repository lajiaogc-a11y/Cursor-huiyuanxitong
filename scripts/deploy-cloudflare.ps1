# Cloudflare Pages deploy only (loads .env, build, deploy)
# Usage: npm run deploy:cf

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Load from .env (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
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

Write-Host "Build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Deploy to Cloudflare Pages..." -ForegroundColor Cyan
npx wrangler pages deploy dist --project-name=gift-system --branch=main
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`nDone: https://crm.fastgc.cc" -ForegroundColor Green
