# 远程执行 migrate:all 并重启 gc-api（不 git pull、不上传构建产物）
# 配置同 deploy-full.ps1：DEPLOY_PM2_SSH、DEPLOY_REMOTE_DIR、DEPLOY_SSH_* 
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$envFiles = @(".env", "server\.env")
foreach ($ef in $envFiles) {
    if (Test-Path $ef) {
        Get-Content $ef -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^DEPLOY_PM2_SSH=(.+)$') { $env:DEPLOY_PM2_SSH = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_REMOTE_DIR=(.+)$') { $env:DEPLOY_REMOTE_DIR = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_IDENTITY_FILE=(.+)$') { $env:DEPLOY_SSH_IDENTITY_FILE = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_KEY_DIR=(.+)$') { $env:DEPLOY_SSH_KEY_DIR = $matches[1].Trim().Trim('"') }
        }
    }
}

if ([string]::IsNullOrWhiteSpace($env:DEPLOY_PM2_SSH)) {
    Write-Host "DEPLOY_PM2_SSH not set in .env" -ForegroundColor Red
    exit 1
}
$remoteDir = $env:DEPLOY_REMOTE_DIR
if ([string]::IsNullOrWhiteSpace($remoteDir)) { $remoteDir = "/var/www/gc-app" }

function Get-DeploySshIdentityArg {
    $explicit = ''
    if ($env:DEPLOY_SSH_IDENTITY_FILE) { $explicit = $env:DEPLOY_SSH_IDENTITY_FILE.Trim().Trim('"') }
    if ($explicit -and (Test-Path -LiteralPath $explicit -PathType Leaf)) {
        return @('-i', (Resolve-Path -LiteralPath $explicit).Path)
    }
    $dir = ''
    if ($env:DEPLOY_SSH_KEY_DIR) { $dir = $env:DEPLOY_SSH_KEY_DIR.Trim().Trim('"') }
    if ($dir -and (Test-Path -LiteralPath $dir -PathType Container)) {
        $pem = Get-ChildItem -LiteralPath $dir -Filter *.pem -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pem) { return @('-i', $pem.FullName) }
    }
    return @()
}
$sshIdent = Get-DeploySshIdentityArg
if ($sshIdent.Count -gt 0) {
    Write-Host "SSH identity: $($sshIdent[1])" -ForegroundColor DarkGray
}

$migrateStep = "npm run migrate:all"
$remoteCmd = @(
    "cd $remoteDir",
    "(pm2 stop gc-api 2>/dev/null || true)",
    "cd server",
    $migrateStep,
    "cd ..",
    "(test -f ecosystem.config.cjs && pm2 restart ecosystem.config.cjs --update-env || pm2 restart gc-api --update-env)"
) -join " && "

Write-Host "`n=== Remote: migrate:all + PM2 restart gc-api ===" -ForegroundColor Cyan
Write-Host "SSH: $($env:DEPLOY_PM2_SSH)  |  dir: $remoteDir" -ForegroundColor DarkGray

& ssh @sshIdent -o BatchMode=yes -o ConnectTimeout=30 $env:DEPLOY_PM2_SSH $remoteCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "`nDone: migrations applied, gc-api restarted." -ForegroundColor Green
