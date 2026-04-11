# scripts/build-release.ps1
#
# 完整 Electron 桌面客户端发布流水线
#
# 功能：
#   1. TypeScript 编译（electron/）
#   2. Vite 构建前端（ELECTRON 模式）
#   3. 预处理 winCodeSign 缓存（解决 Windows 符号链接权限问题）
#   4. electron-builder 构建 NSIS 安装包（--publish=never，不自动上传）
#   5. 生成 latest.yml（供 electron-updater 检测更新用）
#   6. 上传安装包 + latest.yml 到服务器 downloads/ 目录
#   7. 更新数据库中的客户端下载 URL
#
# 用法：
#   npm run release:electron
#   powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -SkipBuild   # 仅上传
#
# 自动更新说明：
#   - 安装包命名：FastGC-WhatsApp-Setup-${version}.exe
#   - latest.yml  命名：latest.yml（固定名称，electron-updater 检测入口）
#   - 更新源 URL：https://admin.crm.fastgc.cc/downloads/latest.yml
#   - 当 electron-updater 接入后，用户安装新版后将自动检测并下载更新

param(
    [switch]$SkipBuild,
    [switch]$SkipUpload
)
# SkipBuild  = skip build steps, upload existing release/ artifacts
# SkipUpload = build only, do not upload

$ErrorActionPreference = "Stop"

function Initialize-Console {
    try { chcp 65001 | Out-Null } catch { }
    try {
        $utf8 = [System.Text.UTF8Encoding]::new($false)
        [Console]::OutputEncoding = $utf8
        [Console]::InputEncoding  = $utf8
    } catch { }
}
Initialize-Console

if ($PSScriptRoot) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $projectRoot
} else {
    $projectRoot = (Get-Location).Path
}

# ── 读取部署配置 ──
$envFiles = @(".env", "server\.env")
$sshTarget = ""; $remoteDir = "/var/www/gc-app"; $sshKeyFile = ""
foreach ($ef in $envFiles) {
    if (Test-Path $ef) {
        Get-Content $ef -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^DEPLOY_PM2_SSH=(.+)$')           { $sshTarget  = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_REMOTE_DIR=(.+)$')        { $remoteDir  = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_IDENTITY_FILE=(.+)$') { $sshKeyFile = $matches[1].Trim().Trim('"') }
            if ($_ -match '^DEPLOY_SSH_KEY_DIR=(.+)$') {
                $dir = $matches[1].Trim().Trim('"')
                if ($dir -and -not $sshKeyFile) {
                    $pem = Get-ChildItem $dir -Filter *.pem -File -EA SilentlyContinue | Select-Object -First 1
                    if ($pem) { $sshKeyFile = $pem.FullName }
                }
            }
        }
    }
}

if (-not $sshTarget -or -not $sshKeyFile) {
    Write-Host "ERROR: DEPLOY_PM2_SSH / SSH key not configured in .env" -FG Red; exit 1
}
$sshIdent = @("-i", $sshKeyFile, "-o", "BatchMode=yes", "-o", "ConnectTimeout=60", "-o", "ServerAliveInterval=30")
Write-Host "SSH: $sshTarget  key: $sshKeyFile" -FG DarkGray

# ── 读取版本号（用 node 避免 PowerShell ConvertFrom-Json 对大 JSON 的兼容问题）──
$pkgVersion = (& node -e "process.stdout.write(require('./package.json').version)" 2>$null)
if (-not $pkgVersion) { Write-Host "ERROR: Could not read version from package.json" -FG Red; exit 1 }
$installerName = "FastGC-WhatsApp-Setup-${pkgVersion}.exe"
Write-Host "Version: $pkgVersion" -FG Cyan

# ============================================================
# Step 1: 构建
# ============================================================
if (-not $SkipBuild) {
    Write-Host "`n=== Step 1: TypeScript + Vite + electron-builder ===" -FG Cyan

    Write-Host "  [1/3] Compiling electron TypeScript..." -FG DarkGray
    node scripts/build-electron.mjs
    if ($LASTEXITCODE -ne 0) { Write-Host "TS compilation failed" -FG Red; exit 1 }

    Write-Host "  [2/3] Vite build (ELECTRON mode)..." -FG DarkGray
    $env:VITE_BUILD_TARGET = "electron"
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Host "Vite build failed" -FG Red; exit 1 }

    Write-Host "  [3/3] winCodeSign pre-extract..." -FG DarkGray
    powershell -ExecutionPolicy Bypass -File "scripts\pre-extract-wincodesign.ps1"
    if ($LASTEXITCODE -ne 0) { Write-Host "winCodeSign pre-extract failed" -FG Red; exit 1 }

    Write-Host "  [4/3] electron-builder NSIS --publish=never..." -FG DarkGray
    npx electron-builder --win --publish=never
    if ($LASTEXITCODE -ne 0) { Write-Host "electron-builder failed" -FG Red; exit 1 }

    Write-Host "Build complete." -FG Green
} else {
    Write-Host "`n=== Step 1: SKIPPED (--SkipBuild) ===" -FG Yellow
}

# ── 查找产物 ──
$releaseDir = Join-Path $projectRoot "release"
$installer  = Get-ChildItem $releaseDir -Filter $installerName -ErrorAction SilentlyContinue | Select-Object -First 1
$latestYml  = Join-Path $releaseDir "latest.yml"

if (-not $installer) {
    Write-Host "ERROR: Installer not found: $installerName in $releaseDir" -FG Red
    Write-Host "  Available files:" -FG Yellow
    Get-ChildItem $releaseDir -File | Select-Object Name | Format-Table | Out-String | Write-Host
    exit 1
}
if (-not (Test-Path $latestYml)) {
    Write-Host "WARNING: latest.yml not found — auto-update will not work" -FG Yellow
}

$installerSize = [math]::Round($installer.Length / 1MB, 1)
Write-Host "`nInstaller: $($installer.Name) ($installerSize MB)" -FG Green
Write-Host "latest.yml: $(if (Test-Path $latestYml) {'found'} else {'MISSING'})" -FG $(if (Test-Path $latestYml) {"Green"} else {"Yellow"})

if ($SkipUpload) {
    Write-Host "`n=== Upload SKIPPED (--SkipUpload) ===" -FG Yellow
    Write-Host "Installer at: $($installer.FullName)"
    exit 0
}

# ============================================================
# Step 2: 上传安装包 + latest.yml 到服务器
# ============================================================
Write-Host "`n=== Step 2: Upload to server ===" -FG Cyan

# 确保 downloads/ 目录存在
& ssh @sshIdent $sshTarget "mkdir -p $remoteDir/dist/downloads"
if ($LASTEXITCODE -ne 0) { Write-Host "SSH mkdir failed" -FG Red; exit 1 }

# 上传安装包
Write-Host "  Uploading installer ($installerSize MB)..." -FG DarkGray
& scp @sshIdent `
    "-o" "ServerAliveCountMax=20" `
    $installer.FullName `
    "${sshTarget}:${remoteDir}/dist/downloads/$installerName"
if ($LASTEXITCODE -ne 0) { Write-Host "SCP installer failed" -FG Red; exit 1 }
Write-Host "  Installer uploaded OK" -FG Green

# 上传 blockmap（差分更新：electron-updater 检测到 blockmap 后只下载变化部分）
$blockmapName = "$installerName.blockmap"
$blockmapFile = Join-Path $releaseDir $blockmapName
if ($blockmapFile -and (Test-Path $blockmapFile)) {
    Write-Host "  Uploading blockmap (differential update support)..." -FG DarkGray
    & scp @sshIdent $blockmapFile "${sshTarget}:${remoteDir}/dist/downloads/$blockmapName"
    if ($LASTEXITCODE -ne 0) { Write-Host "SCP blockmap failed (non-fatal)" -FG Yellow }
    else { Write-Host "  blockmap uploaded OK" -FG Green }
} else {
    Write-Host "  blockmap not found at: $blockmapFile — full download will be used" -FG Yellow
}

# 上传 latest.yml（自动更新检测入口）
if (Test-Path $latestYml) {
    Write-Host "  Uploading latest.yml..." -FG DarkGray
    & scp @sshIdent $latestYml "${sshTarget}:${remoteDir}/dist/downloads/latest.yml"
    if ($LASTEXITCODE -ne 0) { Write-Host "SCP latest.yml failed" -FG Yellow }
    else { Write-Host "  latest.yml uploaded OK" -FG Green }
}

# ============================================================
# Step 3: 更新数据库下载 URL
# ============================================================
Write-Host "`n=== Step 3: Update DB download URL ===" -FG Cyan

$newUrl = "https://admin.crm.fastgc.cc/downloads/$installerName"

$dbScript = @"
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/gc-app/server/.env' });
(async () => {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: parseInt(process.env.MYSQL_PORT || '3306')
  });
  const url = '$newUrl';
  const [rows] = await pool.execute("SELECT store_key FROM shared_data_store WHERE store_key = 'companionDownloadUrls'");
  if (rows.length === 0) {
    await pool.execute("INSERT INTO shared_data_store (store_key, store_value) VALUES ('companionDownloadUrls', ?)", [JSON.stringify({ windows: url })]);
    console.log('[OK] Inserted. windows =', url);
  } else {
    await pool.execute("UPDATE shared_data_store SET store_value = JSON_SET(COALESCE(store_value, '{}'), '$.windows', ?) WHERE store_key = 'companionDownloadUrls'", [url]);
    console.log('[OK] Updated. windows =', url);
  }
  await pool.end();
})().catch(e => { console.error('[ERR]', e.message); process.exit(1); });
"@

$encUtf8 = New-Object System.Text.UTF8Encoding $false
$tmpSh  = Join-Path $env:TEMP ("gc-release-$(New-Guid).cjs")
[System.IO.File]::WriteAllBytes($tmpSh, $encUtf8.GetBytes($dbScript))

& scp @sshIdent $tmpSh "${sshTarget}:/var/www/gc-app/server/_release_update.cjs"
Remove-Item $tmpSh -Force -ErrorAction SilentlyContinue

$dbOut = Join-Path $env:TEMP "gc-db-out.txt"
$dbErr = Join-Path $env:TEMP "gc-db-err.txt"
$dbProc = Start-Process "ssh" -ArgumentList (@() + $sshIdent + @($sshTarget, "cd /var/www/gc-app/server && node _release_update.cjs; rm -f _release_update.cjs")) `
    -Wait -NoNewWindow -PassThru -RedirectStandardOutput $dbOut -RedirectStandardError $dbErr
if (Test-Path $dbOut) { Get-Content $dbOut | Write-Host }
if (Test-Path $dbErr) { Get-Content $dbErr | Write-Host }
Remove-Item $dbOut, $dbErr -Force -ErrorAction SilentlyContinue

if ($dbProc.ExitCode -ne 0) {
    Write-Host "WARNING: DB update failed (exit $($dbProc.ExitCode))" -FG Yellow
} else {
    Write-Host "  DB updated: $newUrl" -FG Green
}

# ============================================================
# 完成
# ============================================================
Write-Host "`n=== Release Complete ===" -FG Green
Write-Host "  Version    : $pkgVersion"
Write-Host "  Installer  : $newUrl" -FG Cyan
Write-Host "  Auto-update: https://admin.crm.fastgc.cc/downloads/latest.yml"
Write-Host ""
Write-Host "用户操作：" -FG White
Write-Host "  首次安装：下载安装包并运行" -FG Gray
Write-Host "  后续版本：安装 electron-updater 后可自动推送 (见 main/index.ts 注释)" -FG Gray
