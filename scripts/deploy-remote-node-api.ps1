# 在生产机上：git pull + server 目录 tsc + PM2 重启（触发启动时 migrateMemberPortalSettingsColumns 等）
# 依赖：本机可 SSH 免密登录服务器；仓库已在远端克隆且默认分支为 main。
# 配置：项目根 `.env` 或 `server\.env` 中设置：
#   DEPLOY_PM2_SSH=user@host
#   DEPLOY_REMOTE_DIR=/var/www/gc-app   （可选，默认 /var/www/gc-app）
#   DEPLOY_SSH_KEY_DIR=D:\path\to\keys    （可选：目录内第一个 .pem 作为 -i）
#   DEPLOY_SSH_IDENTITY_FILE=D:\path\key.pem  （可选：显式指定私钥，优先于 KEY_DIR）
#
# 用法：npm run deploy:remote-api
#      或：powershell -ExecutionPolicy Bypass -File ./scripts/deploy-remote-node-api.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$envFiles = @(".env", "server\.env")
foreach ($ef in $envFiles) {
    $full = Join-Path $projectRoot $ef
    if (Test-Path $full) {
        Get-Content $full -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^DEPLOY_PM2_SSH=(.+)$') { $env:DEPLOY_PM2_SSH = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_REMOTE_DIR=(.+)$') { $env:DEPLOY_REMOTE_DIR = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_IDENTITY_FILE=(.+)$') { $env:DEPLOY_SSH_IDENTITY_FILE = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_KEY_DIR=(.+)$') { $env:DEPLOY_SSH_KEY_DIR = $matches[1].Trim().Trim('"') }
        }
    }
}

if ([string]::IsNullOrWhiteSpace($env:DEPLOY_PM2_SSH)) {
    Write-Host ""
    Write-Host '未配置 DEPLOY_PM2_SSH，无法 SSH 到生产机执行部署。' -ForegroundColor Yellow
    Write-Host '请在项目根目录 .env 或 server\.env 中添加，例如：' -ForegroundColor Yellow
    Write-Host "  DEPLOY_PM2_SSH=ubuntu@your-server-ip" -ForegroundColor DarkGray
    Write-Host "  DEPLOY_REMOTE_DIR=/var/www/gc-app" -ForegroundColor DarkGray
    Write-Host ""
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

# 整段交给远端 shell 解析（与 deploy-full.ps1 Step 4 一致），并增加 git pull 与 server build
$remoteCmd = 'cd {0} && git pull origin main || git pull && cd server && npm run build && npm run migrate:all && cd .. && (test -f ecosystem.config.cjs && pm2 restart ecosystem.config.cjs --update-env || pm2 restart gc-api --update-env || pm2 restart all --update-env)' -f $remoteDir

Write-Host "`n=== Remote Node API deploy ===" -ForegroundColor Cyan
Write-Host "SSH: $($env:DEPLOY_PM2_SSH)  |  dir: $remoteDir" -ForegroundColor DarkGray

& ssh @sshIdent -o BatchMode=yes -o ConnectTimeout=25 $env:DEPLOY_PM2_SSH $remoteCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote deploy failed (exit $LASTEXITCODE). Check SSH key, path, git remote, and pm2 on server." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nRemote Node API deploy OK. Portal settings columns migrate on API process start if needed." -ForegroundColor Green
